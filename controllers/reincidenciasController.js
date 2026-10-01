import pool from "../db.js";
import webpush from "web-push";

const INTERVALO_MS = 5000;
const UMBRAL_SIMILITUD = 0.6;
const VENTANA_DIAS = 10;
let monitorIniciado = false;
let ejecutando = false;

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "al", "a", "en", "con", "sin", "por", "para",
  "y", "o", "que", "se", "es", "no", "equipo", "equipos",
  "falla", "fallas", "problema", "problemas", "presenta", "presentando"
]);

function normalizarTexto(valor = "") {
  return String(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensSignificativos(valor = "") {
  return normalizarTexto(valor)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function similitudTexto(a, b) {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);

  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(tokensSignificativos(a));
  const tb = new Set(tokensSignificativos(b));
  if (!ta.size || !tb.size) return 0;

  let interseccion = 0;
  for (const token of ta) {
    if (tb.has(token)) interseccion += 1;
  }

  const union = new Set([...ta, ...tb]).size;
  const jaccard = union ? interseccion / union : 0;
  const contencion = interseccion / Math.min(ta.size, tb.size);

  return Math.max(jaccard, contencion * 0.85);
}

async function asegurarTablas() {
  const existencia = await pool.query(
    "SELECT to_regclass('public.reincidencias_procesadas') AS tabla"
  );
  const tablaProcesadosExistia = Boolean(existencia.rows[0]?.tabla);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alertas_reincidencia (
      id SERIAL PRIMARY KEY,
      ric01_id INTEGER NOT NULL,
      ric01_anterior_id INTEGER NOT NULL,
      numero_serie TEXT,
      descripcion TEXT,
      area TEXT,
      diagnostico_actual TEXT,
      diagnostico_anterior TEXT,
      solucion_anterior TEXT,
      asignado_anterior TEXT,
      fecha_actual TIMESTAMP,
      fecha_anterior TIMESTAMP,
      dias_diferencia INTEGER,
      similitud NUMERIC(5,4),
      mismo_problema BOOLEAN NOT NULL DEFAULT false,
      fecha_alerta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (ric01_id, ric01_anterior_id)
    )
  `);

  // Compatibilidad con instalaciones donde la tabla ya fue creada.
  await pool.query(`
    ALTER TABLE alertas_reincidencia
    ADD COLUMN IF NOT EXISTS mismo_problema BOOLEAN NOT NULL DEFAULT false
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reincidencias_procesadas (
      ric01_id INTEGER PRIMARY KEY,
      procesado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Primera instalación: no avisar por correctivos históricos.
  if (!tablaProcesadosExistia) {
    await pool.query(`
      INSERT INTO reincidencias_procesadas (ric01_id)
      SELECT id
      FROM ric01
      WHERE LOWER(TRIM(COALESCE(tipo_mantenimiento, ''))) = 'correctivo'
      ON CONFLICT (ric01_id) DO NOTHING
    `);
    console.log("✅ Monitor de reincidencias inicializado sin alertas retroactivas");
  }
}

function calcularDias(fechaActual, fechaAnterior) {
  const actual = new Date(fechaActual).getTime();
  const anterior = new Date(fechaAnterior).getTime();
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return null;
  return Math.max(0, Math.floor((actual - anterior) / 86400000));
}

async function enviarPushArea(area, alerta) {
  if (!area) return 0;

  try {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(
        "mailto:icsky26@gmail.com",
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
    }

    const { rows } = await pool.query(
      `SELECT id, suscripcion
       FROM personal
       WHERE suscripcion IS NOT NULL
         AND translate(lower(trim(COALESCE(area, ''))), 'áéíóúüñ', 'aeiouun') =
             translate(lower(trim($1)), 'áéíóúüñ', 'aeiouun')`,
      [area]
    );

    const clasificacion = alerta.mismo_problema
      ? "⚠️ El problema es similar al ingreso anterior."
      : "ℹ️ El problema informado es diferente al ingreso anterior.";

    const body = [
      `${alerta.descripcion || "Equipo"} · Serie ${alerta.numero_serie || "-"}`,
      `Tuvo otro correctivo #${alerta.ric01_anterior_id} hace ${alerta.dias_diferencia} día(s).`,
      clasificacion,
      `Actual: ${alerta.diagnostico_actual || "Sin diagnóstico informado"}`,
      `Anterior: ${alerta.diagnostico_anterior || "Sin diagnóstico informado"}`
    ].join("\n");

    let enviadas = 0;

    for (const row of rows) {
      try {
        const subscription = typeof row.suscripcion === "string"
          ? JSON.parse(row.suscripcion)
          : row.suscripcion;

        await webpush.sendNotification(subscription, JSON.stringify({
          title: alerta.mismo_problema
            ? "⚠️ Reingreso reciente - problema similar"
            : "⚠️ Reingreso reciente del equipo",
          body,
          icon: "/icon-192x192.png",
          data: {
            tipo: "reincidencia",
            ric01_id: alerta.ric01_id,
            ric01_anterior_id: alerta.ric01_anterior_id,
            numero_serie: alerta.numero_serie,
            mismo_problema: alerta.mismo_problema
          }
        }));
        enviadas += 1;
      } catch (error) {
        console.warn("⚠️ No se pudo enviar push de reincidencia:", error.message);
      }
    }

    return enviadas;
  } catch (error) {
    console.error("Error enviando alertas de reincidencia:", error);
    return 0;
  }
}

async function marcarProcesado(ric01Id) {
  await pool.query(
    `INSERT INTO reincidencias_procesadas (ric01_id)
     VALUES ($1)
     ON CONFLICT (ric01_id) DO NOTHING`,
    [ric01Id]
  );
}

async function procesarCorrectivo(ric01Id) {
  const actualResult = await pool.query(
    `SELECT id, fecha, numero_serie, descripcion, area, diagnostico, tipo_mantenimiento
     FROM ric01
     WHERE id = $1
     LIMIT 1`,
    [ric01Id]
  );

  if (!actualResult.rows.length) {
    await marcarProcesado(ric01Id);
    return null;
  }

  const actual = actualResult.rows[0];

  // La alerta depende de que sea un correctivo y tenga número de serie.
  // El diagnóstico puede estar vacío: el reingreso reciente igualmente se alerta.
  if (
    normalizarTexto(actual.tipo_mantenimiento) !== "correctivo" ||
    !actual.numero_serie
  ) {
    await marcarProcesado(ric01Id);
    return null;
  }

  // Buscar el ingreso correctivo inmediatamente anterior del mismo equipo
  // dentro de los últimos 10 días, independientemente del diagnóstico.
  const anterioresResult = await pool.query(
    `SELECT id, fecha, diagnostico, solucion, asignado
     FROM ric01
     WHERE numero_serie = $1
       AND id <> $2
       AND LOWER(TRIM(COALESCE(tipo_mantenimiento, ''))) = 'correctivo'
       AND fecha >= COALESCE($3::timestamp, CURRENT_TIMESTAMP) - INTERVAL '${VENTANA_DIAS} days'
       AND (
         fecha < COALESCE($3::timestamp, CURRENT_TIMESTAMP)
         OR (fecha = COALESCE($3::timestamp, CURRENT_TIMESTAMP) AND id < $2)
       )
     ORDER BY fecha DESC, id DESC
     LIMIT 1`,
    [actual.numero_serie, actual.id, actual.fecha]
  );

  if (!anterioresResult.rows.length) {
    await marcarProcesado(ric01Id);
    return null;
  }

  const anterior = anterioresResult.rows[0];
  const similitud = similitudTexto(actual.diagnostico, anterior.diagnostico);
  const mismoProblema = similitud >= UMBRAL_SIMILITUD;
  const diasDiferencia = calcularDias(actual.fecha, anterior.fecha);

  const insert = await pool.query(
    `INSERT INTO alertas_reincidencia (
       ric01_id, ric01_anterior_id, numero_serie, descripcion, area,
       diagnostico_actual, diagnostico_anterior, solucion_anterior,
       asignado_anterior, fecha_actual, fecha_anterior,
       dias_diferencia, similitud, mismo_problema
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (ric01_id, ric01_anterior_id) DO NOTHING
     RETURNING *`,
    [
      actual.id,
      anterior.id,
      actual.numero_serie,
      actual.descripcion || null,
      actual.area || null,
      actual.diagnostico || null,
      anterior.diagnostico || null,
      anterior.solucion || null,
      anterior.asignado || null,
      actual.fecha || null,
      anterior.fecha || null,
      diasDiferencia,
      Number(similitud.toFixed(4)),
      mismoProblema
    ]
  );

  await marcarProcesado(ric01Id);

  if (!insert.rows.length) return null;

  const alerta = insert.rows[0];
  const enviadas = await enviarPushArea(actual.area, alerta);

  console.log(
    `⚠️ Reingreso reciente detectado: RIC01 #${actual.id} / anterior #${anterior.id} ` +
    `(${diasDiferencia} día(s), ${Math.round(similitud * 100)}% similitud, ` +
    `${mismoProblema ? "problema similar" : "problema diferente"}, ${enviadas} push)`
  );

  return alerta;
}

async function revisarNuevosCorrectivos() {
  if (ejecutando) return;
  ejecutando = true;

  try {
    const { rows } = await pool.query(`
      SELECT r.id
      FROM ric01 r
      LEFT JOIN reincidencias_procesadas p ON p.ric01_id = r.id
      WHERE p.ric01_id IS NULL
        AND LOWER(TRIM(COALESCE(r.tipo_mantenimiento, ''))) = 'correctivo'
      ORDER BY r.id ASC
      LIMIT 25
    `);

    for (const row of rows) {
      try {
        await procesarCorrectivo(row.id);
      } catch (error) {
        console.error(`Error procesando reincidencia para RIC01 #${row.id}:`, error);
      }
    }
  } catch (error) {
    console.error("Error revisando reincidencias:", error);
  } finally {
    ejecutando = false;
  }
}

export async function listarAlertasReincidencia(req, res) {
  try {
    const area = String(req.query.area || "").trim();
    const limite = Math.min(Math.max(Number(req.query.limite) || 30, 1), 100);

    const params = [];
    let where = "";
    if (area) {
      params.push(area);
      where = `WHERE translate(lower(trim(COALESCE(area, ''))), 'áéíóúüñ', 'aeiouun') =
                     translate(lower(trim($1)), 'áéíóúüñ', 'aeiouun')`;
    }
    params.push(limite);

    const { rows } = await pool.query(
      `SELECT *
       FROM alertas_reincidencia
       ${where}
       ORDER BY fecha_alerta DESC, id DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ ok: true, alertas: rows });
  } catch (error) {
    console.error("Error listando reincidencias:", error);
    res.status(500).json({ ok: false, error: "Error obteniendo reincidencias" });
  }
}

export async function iniciarMonitorReincidencias() {
  if (monitorIniciado) return;
  monitorIniciado = true;

  try {
    await asegurarTablas();
    await revisarNuevosCorrectivos();
  } catch (error) {
    console.error("No se pudo inicializar el monitor de reincidencias:", error);
  }

  const timer = setInterval(revisarNuevosCorrectivos, INTERVALO_MS);
  timer.unref?.();
}
