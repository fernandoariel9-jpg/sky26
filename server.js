
// ----------------- IMPORTS -----------------
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pkg from "pg";
const { Pool, types } = pkg;
import bcrypt from "bcryptjs";
import webpush from "web-push";
import fetch from "node-fetch";
import cron from "node-cron";

// Evitar conversión automática de timestamptz WITHOUT TZ a Date
types.setTypeParser(1114, (val) => val);

const app = express();
const PORT = process.env.PORT || 4000;

// Memoria temporal de la IA
const memoriaIA = {}; // { sessionId: [ { pregunta, respuesta } ] }
const sesionesIA = {}; // 🧠 Memoria por sessionId
const MAX_MEMORIA = 10; // máximo de interacciones guardadas por sesión

// ----------------- FUNCIONES FECHA -----------------
function fechaLocalArgentina() {
  const ahora = new Date();
  const opciones = { timeZone: "America/Argentina/Buenos_Aires", hour12: false };
  const partes = new Intl.DateTimeFormat("sv-SE", {
    ...opciones,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(ahora)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}

function toArgentinaISO(fecha) {
  if (!fecha) return null;
  try {
    const d = new Date(fecha);
    const partes = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(d).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    const offset = "-03:00";
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${offset}`;
  } catch {
    return fecha;
  }
}

function formatToLocal(fecha) {
  if (!fecha) return null;
  try {
    return new Date(fecha).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour12: false,
    });
  } catch {
    return fecha;
  }
}

// ----------------- MIDDLEWARE -----------------

const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).json({ error: "Token requerido" });
  }

  if (authHeader !== "Bearer ingeclinHR") {
    return res.status(403).json({ error: "Token inválido" });
  }

  next();
};

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));
app.use(express.json());

// ----------------- POSTGRES -----------------
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function guardarResumenTiempos() {
  try {
    console.log("⏳ Calculando promedios diarios...");

    // 📌 Promedio tiempo de SOLUCIÓN (en horas)
    const promedioSolucionQuery = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (fecha_comp - fecha)) / 3600) AS horas
      FROM ric01
      WHERE fecha_comp IS NOT NULL
    `);
    const promedio_solucion = Number(promedioSolucionQuery.rows[0].horas) || 0;

    // 📌 Promedio tiempo de FINALIZACIÓN (en horas)
    const promedioFinQuery = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_comp)) / 3600) AS horas
      FROM ric01
      WHERE fecha_fin IS NOT NULL
        AND fecha_comp IS NOT NULL
    `);
    const promedio_finalizacion = Number(promedioFinQuery.rows[0].horas) || 0;

    // 📌 Promedio tiempo ADMINISTRACIÓN (fecha_adm → fecha_fin)
    const promedioAdmQuery = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_adm)) / 3600) AS horas
      FROM ric01
      WHERE fecha_adm IS NOT NULL
        AND fecha_fin IS NOT NULL
    `);
    const promedio_adm = Number(promedioAdmQuery.rows[0].horas) || 0;

    // 📌 Guardar en resumen_tiempos
    await pool.query(
      `
      INSERT INTO resumen_tiempos (
        fecha,
        promedio_solucion,
        promedio_finalizacion,
        promedio_adm
      )
      VALUES (CURRENT_DATE, $1, $2, $3)
      ON CONFLICT (fecha)
      DO UPDATE SET
        promedio_solucion     = EXCLUDED.promedio_solucion,
        promedio_finalizacion = EXCLUDED.promedio_finalizacion,
        promedio_adm          = EXCLUDED.promedio_adm
      `,
      [promedio_solucion, promedio_finalizacion, promedio_adm]
    );

    console.log(
      `✅ Resumen guardado:
       Solución=${promedio_solucion.toFixed(2)}h |
       Finalización=${promedio_finalizacion.toFixed(2)}h |
       Administración=${promedio_adm.toFixed(2)}h`
    );
  } catch (err) {
    console.error("❌ Error al guardar resumen de tiempos:", err.message);
  }
}

cron.schedule("0 14 * * *", guardarResumenTiempos, {
  timezone: "America/Argentina/Buenos_Aires",
});

// 🕒 Función principal que guarda el resumen diario
async function guardarResumenDiario() {
  try {
    console.log("⏰ Ejecutando resumen diario de tareas a las 14:00...");

    // 📊 Contar totales actuales
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE solucion IS NULL AND fin = false) AS pendientes,
        COUNT(*) FILTER (WHERE solucion IS NOT NULL AND fin = false) AS en_proceso,
        COUNT(*) FILTER (WHERE fin = true) AS finalizadas
      FROM ric01
    `);

    const pendientes = Number(rows[0].pendientes) || 0;
    const en_proceso = Number(rows[0].en_proceso) || 0;
    const finalizadas = Number(rows[0].finalizadas) || 0;

    // 💾 Guardar o actualizar el registro del día
    await pool.query(
      `INSERT INTO resumen_tareas (fecha, pendientes, en_proceso, finalizadas)
       VALUES (CURRENT_DATE, $1, $2, $3)
       ON CONFLICT (fecha)
       DO UPDATE SET
         pendientes = EXCLUDED.pendientes,
         en_proceso = EXCLUDED.en_proceso,
         finalizadas = EXCLUDED.finalizadas`,
      [pendientes, en_proceso, finalizadas]
    );

    console.log(
      `✅ Resumen diario guardado: ${pendientes} pendientes, ${en_proceso} en proceso, ${finalizadas} finalizadas`
    );
  } catch (error) {
    console.error("❌ Error al guardar resumen diario:", error);
  }
}

// 🗓️ Programar tarea automáticamente todos los días a las 14:00 (hora Argentina)
cron.schedule("0 14 * * *", guardarResumenDiario, {
  timezone: "America/Argentina/Buenos_Aires",
});

console.log("🕓 Cron de resumen_tareas configurado para ejecutarse todos los días a las 14:00 (hora Argentina).");

// ----------------- WEB PUSH -----------------
webpush.setVapidDetails(
  "mailto:icsky26@gmail.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function enviarNotificacion(userId, payload) {
  try {
    const result = await pool.query(
      "SELECT suscripcion FROM personal WHERE id = $1",
      [userId]
    );
    const row = result.rows[0];
    if (!row?.suscripcion) return;
    const subscription = JSON.parse(row.suscripcion);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch (err) {
    console.error("Error enviando notificación:", err);
  }
}

// ----------------- RUTAS -----------------

app.get("/api/dashboard/resumen", verificarToken, async (req, res) => {
  try {
    // 🔹 1. RESUMEN GENERAL
    const resumenResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN UPPER(estado) = 'ACTIVO' THEN 1 ELSE 0 END) as activos,
        SUM(CASE WHEN UPPER(estado) <> 'ACTIVO' THEN 1 ELSE 0 END) as no_activos
      FROM equipos
    `);

    const resumen = resumenResult.rows[0];

    // 🔹 2. EQUIPOS CRÍTICOS
    const equiposCriticos = [
      { descripcion: "RESONADOR", serie: "80611" },
      { descripcion: "TOMOGRAFO", serie: "1CC1323560" },
      { descripcion: "TOMOGRAFO", serie: "BCB1712384" },
      { descripcion: "MAMOGRAFO", serie: "67121012" },
      { descripcion: "ANGIOGRAFO", serie: "722026594" },
      { descripcion: "CITOMETRO DE FLUJO", serie: "V33896202615" },
      { descripcion: "PLETISMOGRAFO", serie: "242000380" },
      { descripcion: "MONITOR MULTIPARAMETRICO", serie: "TM3M0728" },
      { descripcion: "COLCHON TERMICO", serie: "020708" },
      { descripcion: "ESPECTROMETRO", serie: "860467301903" },
      { descripcion: "MULTIPLEX", serie: "LX10014295404" },
      { descripcion: "ELECTROFORESIS CAPILAR", serie: "93771" },
      { descripcion: "FACOEMULSIFICADOR", serie: "1603408601X" },
    ];

    // 🔹 3. CONSULTA REAL (POSTGRES)
    const criticosDB = await Promise.all(
      equiposCriticos.map(async (eq) => {
        const result = await pool.query(
          `
          SELECT descripcion, numero_serie, estado
          FROM equipos
          WHERE UPPER(descripcion) = $1
          ${eq.serie ? "AND numero_serie = $2" : ""}
          LIMIT 1
        `,
          eq.serie
            ? [eq.descripcion.toUpperCase(), eq.serie]
            : [eq.descripcion.toUpperCase()]
        );

        if (result.rows.length > 0) {
          const equipo = result.rows[0];

          return {
            descripcion: equipo.descripcion,
            numero_serie: equipo.numero_serie,
            estado: equipo.estado,
            activo: equipo.estado?.toUpperCase() === "ACTIVO",
          };
        } else {
          return {
            descripcion: eq.descripcion,
            numero_serie: eq.serie,
            estado: "NO ENCONTRADO",
            activo: false,
          };
        }
      })
    );

    res.json({
      total: Number(resumen.total),
      activos: Number(resumen.activos),
      no_activos: Number(resumen.no_activos),
      criticos: criticosDB,
    });

  } catch (error) {
    console.error("🔥 ERROR REAL:", error);
    res.status(500).json({ error: "Error en dashboard" });
  }
});

app.get("/estados", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM estados ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener estados:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.put("/api/equipos/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    const result = await pool.query(
      "UPDATE equipos SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error actualizando estado:", error);
    res.status(500).json({ error: "Error del servidor" });
  }
});

app.get("/equipos/serie/:serie", async (req, res) => {
  const { serie } = req.params;

  try {
    // 🔹 limpiar input
    const serieLimpia = serie.trim().toLowerCase();

    // 🔹 query robusta
    const result = await pool.query(
      "SELECT * FROM equipos WHERE LOWER(TRIM(numero_serie)) = $1",
      [serieLimpia]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ mensaje: "No encontrado" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error buscando equipo:", error);
    res.status(500).json({ error: "Error en servidor" });
  }
});

app.get("/api/resumen_tiempos_por_area", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        area,
        AVG(EXTRACT(EPOCH FROM (fecha_comp - fecha))) AS prom_solucion_seg,
        AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha_comp))) AS prom_finalizacion_seg
      FROM ric01
      WHERE fecha IS NOT NULL
      GROUP BY area
      ORDER BY area
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Error resumen por área:", err);
    res.status(500).json({ error: "Error obteniendo resumen por área" });
  }
});

app.get("/api/tiempos_analitica", async (req, res) => {
  const { desde, hasta } = req.query;

  try {
    let filtroFecha = "";
    const valores = [];

    if (desde && hasta) {
      filtroFecha = "AND r.fecha::date BETWEEN $1 AND $2";
      valores.push(desde, hasta);
    }

    const query = `
      SELECT
        COALESCE(r.reasignado_a, r.area) AS area,
        COUNT(*) AS total_tareas,

        AVG(
          CASE 
            WHEN r.fecha_comp IS NOT NULL
            THEN EXTRACT(EPOCH FROM (r.fecha_comp - r.fecha)) / 3600
          END
        ) AS promedio_solucion,

        AVG(
          CASE 
            WHEN r.fecha_fin IS NOT NULL
            THEN EXTRACT(EPOCH FROM (r.fecha_fin - r.fecha_comp)) / 3600
          END
        ) AS promedio_finalizacion

      FROM ric01 r
      WHERE 1=1
      ${filtroFecha}

      GROUP BY COALESCE(r.reasignado_a, r.area)
      ORDER BY area;
    `;

    const result = await pool.query(query, valores);
    res.json(result.rows || []);
  } catch (err) {
    console.error("Error analítica:", err);
    res.status(500).json([]);
  }
});

// ---------- TAREAS ----------
app.get("/tareas/:area", async (req, res) => {
  const { area } = req.params;
  const { personal } = req.query; // 👈 agregamos esto

  try {
    const result = await pool.query(`
      SELECT r.*, u.movil AS movil
      FROM ric01 r
      LEFT JOIN usuarios u ON r.usuario = u.mail OR r.usuario = u.nombre
      WHERE (
        (r.area = $1 AND r.reasignado_a IS NULL)
        OR r.reasignado_a = $1
        OR (r.origen = 'interno' AND r.usuario = $2)
      )
      ORDER BY r.fecha DESC
    `, [area, personal]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener tareas:", err.message);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.get("/tareas", async (req, res) => {
  try {
    const { usuario, panel } = req.query;

    let query = `
      SELECT r.*, u.movil AS movil
      FROM ric01 r
      LEFT JOIN usuarios u ON r.usuario = u.mail
    `;
    let params = [];

    // 🧭 PANEL DE SUPERVISIÓN → VE TODO
    if (panel === "true") {
      // no se aplica filtro
    }
    // 👤 USUARIO COMÚN / SUPERVISOR
    else if (usuario) {
      const userResult = await pool.query(
        `SELECT tipo, servicio
         FROM usuarios
         WHERE mail = $1 OR nombre = $1
         LIMIT 1`,
        [usuario]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const { tipo, servicio } = userResult.rows[0];

      if (tipo === "supervisor") {
        // 👔 Supervisor → tareas de su servicio
        query += ` WHERE r.servicio = $1 `;
        params.push(servicio);
      } else {
  // 👤 Común → ve lo que creó Y lo que solicitó
  query += ` WHERE r.usuario = $1 OR r.solicitado_por = $1 `;
  params.push(usuario);
}
    } else {
      // ❌ ni usuario ni panel
      return res.status(400).json({ error: "Parámetros insuficientes" });
    }

    query += ` ORDER BY r.fecha DESC`;

    const result = await pool.query(query, params);

    res.json(
      result.rows.map((t) => ({
        ...t,
        fecha: t.fecha || null,
        fecha_comp: t.fecha_comp || null,
        fecha_fin: t.fecha_fin || null,
      }))
    );
  } catch (err) {
    console.error("❌ Error al obtener tareas:", err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.put("/tareas/:id/editar", async (req, res) => {
  const { id } = req.params;
  const { tarea } = req.body;

  console.log("EDITANDO:", id, tarea);

  if (!tarea || tarea.trim() === "") {
    return res.status(400).json({ error: "Tarea vacía" });
  }

  try {
    const result = await pool.query(
      "UPDATE ric01 SET tarea = $1 WHERE id = $2 RETURNING *",
      [tarea, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "No existe la tarea" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

app.get("/api/equipos", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM equipos ORDER BY id DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo equipos:", error);
    res.status(500).json({ error: "Error obteniendo equipos" });
  }
});

app.get("/diagnosticos/ric02", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT diagnostico FROM rics WHERE ric = 'RIC02'"
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener diagnósticos" });
  }
});

app.post("/api/equipos", async (req, res) => {
  const {
    numero_serie,
    descripcion,
    marca_modelo,
    servicio,
    sub_servicio,
    encargado,
    area,
    periodo,
    ultimo_mant,
    fecha_alta,
    fecha_baja,
    estado
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO equipos (
        numero_serie, descripcion, marca_modelo,
        servicio, sub_servicio, encargado, area,
        periodo, ultimo_mant, fecha_alta, fecha_baja, estado
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        numero_serie,
        descripcion,
        marca_modelo,
        servicio,
        sub_servicio,
        encargado,
        area,
        periodo,
        ultimo_mant,
        fecha_alta || new Date(),
        fecha_baja,
        estado || "En Servicio"
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creando equipo" });
  }
});

app.put("/api/equipos/:id", async (req, res) => {
  const { id } = req.params;
  const { numero_serie, descripcion, marca, modelo, area } = req.body;

  try {
    await pool.query(
      `UPDATE equipos 
       SET numero_serie=$1, descripcion=$2, marca=$3, modelo=$4, area=$5
       WHERE id=$6`,
      [numero_serie, descripcion, marca, modelo, area, id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error actualizando equipo:", error);
    res.status(500).json({ error: "Error actualizando equipo" });
  }
});

app.post("/api/ric01", async (req, res) => {
  try {
    const {
  usuario,
  fecha,
  tarea,
  diagnostico,
  tipo_mantenimiento,
  area,
  servicio,
  subservicio,
  asignado,
  solicitado_por,
  origen
} = req.body;

    await pool.query(
  `INSERT INTO ric01 
  (usuario, fecha, tarea, diagnostico, tipo_mantenimiento, area, servicio, subservicio, asignado, solicitado_por, origen)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [usuario, fecha, tarea, diagnostico, tipo_mantenimiento, area, servicio, subservicio, asignado, solicitado_por, origen]
);

    res.status(201).json({ message: "Creado" });

  } catch (error) {
    console.error("Error creando pedido interno:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/ric01", async (req, res) => {
  try {
    const {
      usuario,
      fecha,
      tarea,
      diagnostico,
      tipo_mantenimiento,
      descripcion,
      numero_serie,
      area,
      servicio,
      subservicio,
      asignado,
      solicitado_por,
      origen,
      tarea_id,
      solucion
    } = req.body;

    // 🔴 VALIDAR si ya hay mantenimiento abierto
    const existeAbierto = await pool.query(
      `SELECT id FROM ric01 
       WHERE numero_serie = $1 AND fin = false`,
      [numero_serie]
    );

    if (existeAbierto.rows.length > 0) {
      return res.status(400).json({
        error: "El equipo ya tiene un mantenimiento abierto"
      });
    }

    // ✅ INSERT (tu lógica intacta)
    const result = await pool.query(
      `INSERT INTO ric01 (
        usuario,
        fecha,
        tarea,
        diagnostico,
        tipo_mantenimiento,
        descripcion,
        numero_serie,
        area,
        servicio,
        subservicio,
        asignado,
        solicitado_por,
        origen,
        fin,
        fecha_fin,
        fecha_comp,
        tarea_id,
        solucion
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
        false, NULL, NULL, $14, $15
      )
      RETURNING *`,
      [
        usuario,
        fecha,
        tarea,
        diagnostico,
        tipo_mantenimiento,
        descripcion,
        numero_serie,
        area,
        servicio,
        subservicio,
        asignado,
        solicitado_por,
        origen,
        tarea_id,
        solucion
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error iniciando mantenimiento:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/ric01/cerrar/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const fechaCierre = new Date().toISOString();

    await client.query("BEGIN");

    // 🔹 1. cerrar mantenimiento
    const result = await client.query(
      `UPDATE ric01
       SET 
         fin = true,
         fecha_fin = $1,
         fecha_comp = $1
       WHERE id = $2
       RETURNING *`,
      [fechaCierre, id]
    );

    const mantenimiento = result.rows[0];

    // 🔴 2. cerrar tarea (SI EXISTE)
    if (mantenimiento.tarea_id) {
      await client.query(
        `UPDATE ric01 
         SET fin = 'true' 
         WHERE id = $1`,
        [mantenimiento.tarea_id]
      );
    }

    await client.query("COMMIT");

    res.json(mantenimiento);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error cerrando mantenimiento:", error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get("/buscar-equipo/:serie", async (req, res) => {
  const { serie } = req.params;

  try {
    const result = await pool.query(
      `SELECT 
        e.*,
        m.id AS mantenimiento_id,
        m.tipo_mantenimiento,
        m.diagnostico,
        m.fecha AS fecha_inicio
      FROM ric02 e
      LEFT JOIN ric01 m 
        ON e.numero_serie = m.numero_serie 
        AND m.fin = false
      WHERE e.numero_serie = $1`,
      [serie]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("Error buscando equipo:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/ric01/asignar-equipo/:id", async (req, res) => {
  const { id } = req.params;

  const {
    descripcion,
    marca_modelo,
    numero_serie
  } = req.body;

  try {
    // 🔍 Verificar si ya tiene equipo asignado
    const existe = await pool.query(
      "SELECT numero_serie FROM ric01 WHERE id = $1",
      [id]
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({
        error: "Tarea no encontrada"
      });
    }

    if (existe.rows[0].numero_serie) {
      return res.status(400).json({
        error: "La tarea ya tiene un equipo asignado"
      });
    }

    // ✅ Actualizar SOLO datos del equipo
    await pool.query(
      `UPDATE ric01
       SET descripcion = $1,
           marca_modelo = $2,
           numero_serie = $3,
           tipo_mantenimiento = 'correctivo'
       WHERE id = $4`,
      [
        descripcion,
        marca_modelo,
        numero_serie,
        id
      ]
    );

    res.json({ message: "Equipo asignado correctamente ✅" });

  } catch (error) {
    console.error("Error al asignar equipo:", error);
    res.status(500).json({ error: "Error al asignar equipo" });
  }
});

app.put("/tareas/finalizar/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE ric01
       SET fin = true,
           fecha_fin = NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'
       WHERE id = $1`,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al finalizar tarea" });
  }
});

app.get("/api/mantenimientos", async (req, res) => {
  const { tipo, equipo_id } = req.query;

  try {
    let query = `
      SELECT r.*, e.numero_serie, e.descripcion AS equipo
      FROM ric01 r
      LEFT JOIN equipos e ON r.equipo_id = e.id
      WHERE 1=1
    `;

    const params = [];

    if (tipo) {
      params.push(tipo);
      query += ` AND r.tipo_mantenimiento = $${params.length}`;
    }

    if (equipo_id) {
      params.push(equipo_id);
      query += ` AND r.equipo_id = $${params.length}`;
    }

    query += " ORDER BY r.id DESC";

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo mantenimientos" });
  }
});

// ----------------- ENDPOINT PARA EL FRONT -----------------
app.get("/api/resumen_tareas", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT fecha, pendientes, en_proceso
      FROM resumen_tareas
      ORDER BY fecha ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error("❌ Error al obtener resumen de tareas:", error);
    res.status(500).json({ error: "Error al obtener resumen de tareas" });
  }
});

app.get("/api/resumen_tiempos", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        fecha,
        promedio_solucion,
        promedio_finalizacion,
        promedio_adm
      FROM resumen_tiempos
      ORDER BY fecha ASC
    `);

    res.json(rows);

  } catch (error) {
    console.error("❌ Error al obtener resumen de tiempos:", error);
    res.status(500).json({ error: "Error al obtener resumen de tiempos" });
  }
});

// 📌 Obtener lista de usuarios registrados
app.get("/usuarios", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, mail, area, fecha_registro 
       FROM usuarios 
       ORDER BY nombre ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener usuarios:", err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

app.post("/api/guardias", async (req, res) => {
  try {
    const { personal_id, personal_nombre, servicio, fecha_hora, observaciones } = req.body;

    if (!personal_id || !servicio || !fecha_hora) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    await pool.query(
      `INSERT INTO guardias (personal_id, personal_nombre, servicio, fecha_hora, observaciones)
       VALUES ($1, $2, $3, $4, $5)`,
      [personal_id, personal_nombre, servicio, fecha_hora, observaciones]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error en /api/guardias:", error);
    res.status(500).json({ error: "Error guardando guardia" });
  }
});

app.get("/api/areas", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, area FROM areas ORDER BY area ASC"
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo áreas" });
  }
});

app.post("/tareas", async (req, res) => {
  // Aceptamos payload tanto con { usuario, tarea, area, servicio, subservicio, ... }
  // como con campos faltantes — en ese caso intentamos completar desde la tabla usuarios
  try {
    let { usuario, tarea, area, fin, imagen, servicio, subservicio } = req.body;

    // Si faltan area/servicio/subservicio, intentar obtenerlas desde la tabla 'usuarios'
    if ((!area || !servicio || !subservicio) && usuario) {
      try {
        const userQ = await pool.query(
          "SELECT area, servicio, subservicio FROM usuarios WHERE mail = $1 OR nombre = $1 LIMIT 1",
          [usuario]
        );
        if (userQ.rows.length > 0) {
          area = area || userQ.rows[0].area;
          servicio = servicio || userQ.rows[0].servicio;
          subservicio = subservicio || userQ.rows[0].subservicio;
        } else {
          // También intentar buscar en tabla personal por mail/nombre (por si el usuario es personal)
          const personalQ = await pool.query(
            "SELECT area FROM personal WHERE mail = $1 OR nombre = $1 LIMIT 1",
            [usuario]
          );
          if (personalQ.rows.length > 0) {
            area = area || personalQ.rows[0].area;
          }
        }
      } catch (lookupErr) {
        console.error("Error buscando area/servicio/subservicio en usuarios:", lookupErr);
      }
    }

    const fecha = fechaLocalArgentina();

    const result = await pool.query(
      `INSERT INTO ric01 (usuario, tarea, fin, imagen, fecha, fecha_comp, fecha_fin, area, servicio, subservicio) 
       VALUES ($1,$2,$3,$4,$5,NULL,NULL,$6,$7,$8) RETURNING *`,
      [usuario, tarea, fin || false, imagen || null, fecha, area || null, servicio || null, subservicio || null]
    );

    // Notificar al personal del área
    const personalRes = await pool.query(
      "SELECT id, suscripcion FROM personal WHERE area = $1 AND suscripcion IS NOT NULL",
      [area]
    );

    const payload = { title: "Nueva tarea asignada", body: tarea, icon: "/icon-192x192.png" };

    personalRes.rows.forEach(({ id, suscripcion }) => {
      if (suscripcion) enviarNotificacion(id, payload).catch(console.error);
    });

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Error creando tarea:", err);
    res.status(500).json({ error: "Error creando tarea" });
  }
});

// ---------- ACTUALIZACIONES DE TAREAS ----------

// 🔹 Función para calcular y guardar promedios de todas las fechas
async function calcularYGuardarPromediosGlobal() {   // ← renombrada
  try {
    const result = await pool.query(`
      SELECT
        DATE(fecha_registro) AS fecha,
        COUNT(*) AS total_tareas,
        COUNT(fecha_comp) AS tareas_completadas,
        COUNT(fecha_fin) AS tareas_finalizadas,
        AVG(EXTRACT(EPOCH FROM (fecha_comp - fecha)) / 60) AS promedio_minutos_comp,
        AVG(EXTRACT(EPOCH FROM (fecha_fin - fecha)) / 60) AS promedio_minutos_fin
      FROM ric01
      GROUP BY DATE(fecha)
      ORDER BY fecha DESC
    `);

    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO promedios (fecha, total_tareas, tareas_completadas, tareas_finalizadas, promedio_minutos_comp, promedio_minutos_fin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (fecha)
         DO UPDATE SET
           total_tareas = EXCLUDED.total_tareas,
           tareas_completadas = EXCLUDED.tareas_completadas,
           tareas_finalizadas = EXCLUDED.tareas_finalizadas,
           promedio_minutos_comp = EXCLUDED.promedio_minutos_comp,
           promedio_minutos_fin = EXCLUDED.promedio_minutos_fin`,
        [
          row.fecha,
          row.total_tareas,
          row.tareas_completadas,
          row.tareas_finalizadas,
          row.promedio_minutos_comp,
          row.promedio_minutos_fin,
        ]
      );
    }

    console.log("📊 Promedios recalculados correctamente");
  } catch (err) {
    console.error("❌ Error al calcular promedios:", err);
  }
}

// ---------- ACTUALIZACIONES DE TAREAS ----------
app.put("/tareas/:id/solucion", async (req, res) => {
  const { id } = req.params;
  const { solucion, asignado } = req.body;
  try {
    const fecha_comp = fechaLocalArgentina();
    await pool.query(
      `UPDATE ric01 SET solucion=$1, asignado=$2, fecha_comp=$3 WHERE id=$4`,
      [solucion, asignado, fecha_comp, id]
    );

    await calcularYGuardarPromedios(); // 🔁 recalcula después de completar tarea

    res.json({ message: "✅ Solución guardada y promedios actualizados" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.put("/tareas/:id", async (req, res) => {
  const { id } = req.params;
  const { fin } = req.body;
  try {
    const fecha_fin = fechaLocalArgentina();
    const result = await pool.query(
      `UPDATE ric01 SET fin=$1, fecha_fin=$2 WHERE id=$3 RETURNING *`,
      [fin, fecha_fin, id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Tarea no encontrada" });

    await calcularYGuardarPromediosGlobal(); // 🔁 recalcula después de finalizar tarea

    res.json({
      message: "✅ Tarea finalizada y promedios actualizados",
      tarea: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al finalizar tarea" });
  }
});

app.put("/tareas/:id/calificacion", async (req, res) => {
  const { id } = req.params;
  const { calificacion } = req.body;
  if (!calificacion || calificacion < 1 || calificacion > 5)
    return res.status(400).json({ error: "Calificación inválida (1–5)" });
  try {
    const result = await pool.query(
      "UPDATE ric01 SET calificacion=$1 WHERE id=$2 RETURNING *",
      [calificacion, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json({ mensaje: "Calificación actualizada", tarea: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.put("/tareas/:id/reasignar", async (req, res) => {
  const { id } = req.params;
  const { nueva_area, reasignado_por } = req.body;

  try {
    // 1️⃣ Actualizar la tarea en la base de datos
    const result = await pool.query(
      `UPDATE ric01 SET reasignado_a=$1, reasignado_por=$2 WHERE id=$3 RETURNING *`,
      [nueva_area, reasignado_por, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const tarea = result.rows[0];

    // 2️⃣ Enviar notificación al nuevo personal del área
    try {
      const subsResult = await pool.query(
        `SELECT suscripcion FROM personal WHERE area=$1 AND suscripcion IS NOT NULL`,
        [nueva_area]
      );

      if (subsResult.rows.length > 0) {
        const payload = JSON.stringify({
          title: "Tarea reasignada a tu área",
          body: `La tarea ID ${id} fue reasignada al área ${nueva_area}.`,
          icon: "/icon-192x192.png",
          data: { tareaId: id },
        });

        for (const row of subsResult.rows) {
          try {
            const sub = JSON.parse(row.suscripcion);
            await webpush.sendNotification(sub, payload);
          } catch (err) {
            console.warn("⚠️ Error enviando notificación:", err.message);
          }
        }

        console.log(`📢 Notificación enviada a ${subsResult.rows.length} usuarios del área ${nueva_area}`);
      } else {
        console.log(`ℹ️ No hay personal suscrito en el área ${nueva_area}`);
      }
    } catch (notifyErr) {
      console.error("Error al enviar notificación:", notifyErr);
    }

    // 3️⃣ Responder al cliente
    res.json({ ok: true, tarea });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 🔧 Actualizar datos de un usuario
app.put("/usuarios/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, mail, area } = req.body;

  if (!nombre || !mail) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    const query = `
      UPDATE usuarios
      SET nombre = $1, mail = $2, area = $3
      WHERE id = $4
      RETURNING id, nombre, mail, area
    `;

    const result = await pool.query(query, [nombre, mail, area || "", id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al actualizar usuario:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// 🔐 Cambiar contraseña de un usuario
app.put("/usuarios/:id/password", async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 4) {
    return res.status(400).json({ error: "La contraseña es demasiado corta" });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);

    const query = `
      UPDATE usuarios
      SET password = $1
      WHERE id = $2
    `;

    const result = await pool.query(query, [hashed, id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error al cambiar contraseña:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.put("/tareas/:id/observacion", async (req, res) => {
  const { id } = req.params;
  const { observacion } = req.body;

  try {
    const fechaAdm = fechaLocalArgentina();

    await pool.query(
      `
      UPDATE ric01
      SET
        observacion = $1,
        fecha_adm = CASE
          WHEN fecha_adm IS NULL AND COALESCE(observacion, '') = ''
          THEN $2
          ELSE fecha_adm
        END
      WHERE id = $3
      `,
      [observacion, fechaAdm, id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar observación" });
  }
});

// ---------- USUARIOS ----------
app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, subservicio, area, movil, mail, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, area, movil, mail, password)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [nombre, servicio, subservicio, area, movil, mail, hashedPassword]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

app.post("/usuarios/login", async (req, res) => {
  const { mail, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE mail=$1", [mail]);
    if (result.rows.length === 0)
      return res.status(401).json({ error: "Usuario no encontrado" });

    const user = result.rows[0];
    const esValido = 
      user.password === password || await bcrypt.compare(password, user.password);

    if (!esValido)
      return res.status(401).json({ error: "Contraseña incorrecta" });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al loguear usuario" });
  }
});
// ---------- PERSONAL ----------
app.post("/personal", async (req, res) => {
  const { nombre, movil, mail, area, password } = req.body;
  try {
    const areaCheck = await pool.query("SELECT * FROM areas WHERE area=$1", [area]);
    if (areaCheck.rows.length === 0) return res.status(400).json({ error: "Área inválida" });

    const result = await pool.query(
      "INSERT INTO personal(nombre,movil,mail,area,password) VALUES($1,$2,$3,$4,$5) RETURNING *",
      [nombre, movil, mail, area, password]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar personal" });
  }
});

app.post("/personal/login", async (req, res) => {
  const { mail, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM personal WHERE mail=$1 AND password=$2", [mail, password]);
    if (result.rows.length === 0) return res.status(401).json({ error: "Credenciales inválidas" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login personal" });
  }
});

app.get("/personal", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, nombre, movil, area FROM personal ORDER BY nombre"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo personal" });
  }
});

app.put("/personal/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, movil, area, password } = req.body;

  // Validación mínima
  if (!nombre || !usuario || !area) {
    return res.status(400).json({
      error: "Faltan datos obligatorios (nombre, usuario o área)",
    });
  }

  try {
    // 1️⃣ Actualizar datos básicos
    await pool.query(
      `UPDATE personal
       SET nombre = $1,
           movil = $2,
           area = $3
       WHERE id = $4`,
      [nombre, usuario, area, id]
    );

    // 2️⃣ Actualizar contraseña SOLO si viene
    if (password && password.trim() !== "") {
      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        `UPDATE personal
         SET password = $1
         WHERE id = $2`,
        [hash, id]
      );
    }

    res.json({
      ok: true,
      message: "Personal actualizado correctamente",
    });
  } catch (err) {
    console.error("Error actualizando personal:", err);

    // Error de usuario duplicado (si usuario es UNIQUE)
    if (err.code === "23505") {
      return res.status(409).json({
        error: "El personal ya existe",
      });
    }

    res.status(500).json({
      error: "Error interno del servidor",
    });
  }
});

// ---------- SERVICIOS ----------
app.get("/servicios", async (req, res) => {
  try {
    const result = await pool.query("SELECT servicio, subservicio, area FROM servicios ORDER BY servicio");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener servicios" });
  }
});

// ---------- AREAS ----------
app.get("/areas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM areas ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener áreas" });
  }
});

// ---------- SUSCRIPCIONES PUSH ----------

app.post("/suscribir", async (req, res) => {
  try {
    const { userId, subscription } = req.body;

    if (!userId || !subscription) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    // Guardar la suscripción en la tabla 'personal'
    const query = `
      UPDATE personal
      SET suscripcion = $1
      WHERE id = $2
      RETURNING id;
    `;
    const result = await pool.query(query, [JSON.stringify(subscription), userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Personal no encontrado" });
    }

    res.json({ message: "Suscripción guardada correctamente" });
  } catch (err) {
    console.error("Error al guardar suscripción:", err);
    res.status(500).json({ error: "Error al guardar suscripción" });
  }
});

app.post("/desuscribir", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Falta el ID del usuario" });
    }

    // Eliminar la suscripción del personal (dejarla en NULL)
    const query = `
      UPDATE personal
      SET suscripcion = NULL
      WHERE id = $1
      RETURNING id;
    `;
    const result = await pool.query(query, [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Personal no encontrado" });
    }

    res.json({ message: "Suscripción eliminada correctamente" });
  } catch (err) {
    console.error("Error al eliminar suscripción:", err);
    res.status(500).json({ error: "Error al eliminar suscripción" });
  }
});

app.post("/api/suscribir", async (req, res) => {
  try {
    const { userId, subscription } = req.body;
    console.log("Recibido en /api/suscribir:", req.body);

    if (!userId || !subscription) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Verificar que el usuario exista antes de actualizar
    const check = await pool.query("SELECT id FROM personal WHERE id=$1", [userId]);
    if (check.rowCount === 0) {
      console.error("Usuario no encontrado para guardar suscripción:", userId);
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    await pool.query(
      "UPDATE personal SET suscripcion=$1 WHERE id=$2",
      [JSON.stringify(subscription), userId]
    );

    console.log("✅ Suscripción guardada correctamente para usuario", userId);
    res.status(201).json({ message: "Suscripción guardada correctamente" });
  } catch (err) {
    console.error("Error en /api/suscribir:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// Ruta para desuscribir push
app.post("/desuscribir", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Borrar la suscripción de la columna 'suscripcion'
    await pool.query(
      `UPDATE personal SET suscripcion = NULL WHERE id = $1`,
      [userId]
    );

    res.status(200).json({ message: "Suscripción eliminada correctamente" });
  } catch (err) {
    console.error("Error desuscribiendo:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// ---------- PROMEDIOS ----------

// Guardar promedios diarios
app.post("/promedios", async (req, res) => {
  const { fecha, promedio_solucion, promedio_finalizacion } = req.body;

  if (!fecha || promedio_solucion == null || promedio_finalizacion == null) {
    return res.status(400).json({ error: "Faltan datos para guardar los promedios" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO promedios (fecha, promedio_solucion, promedio_finalizacion)
       VALUES ($1, $2, $3)
       ON CONFLICT (fecha) 
       DO UPDATE SET promedio_solucion = EXCLUDED.promedio_solucion,
                     promedio_finalizacion = EXCLUDED.promedio_finalizacion
       RETURNING *`,
      [fecha, promedio_solucion, promedio_finalizacion]
    );
    res.json({ message: "Promedios guardados correctamente", data: result.rows[0] });
  } catch (err) {
    console.error("Error guardando promedios:", err);
    res.status(500).json({ error: "Error al guardar los promedios" });
  }
});

// Obtener todos los promedios
app.get("/promedios", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM promedios ORDER BY fecha ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error obteniendo promedios:", err);
    res.status(500).json({ error: "Error al obtener los promedios" });
  }
});

// ---------- CÁLCULO AUTOMÁTICO DE PROMEDIOS DIARIOS ----------
async function calcularYGuardarPromedios() {
  try {
    const hoy = new Date();
    const fechaHoy = hoy.toISOString().split("T")[0]; // 'YYYY-MM-DD'

    // Obtener todas las tareas finalizadas hoy
    const result = await pool.query(
      `SELECT fecha, fecha_comp, fecha_fin 
       FROM ric01
       WHERE fecha::date = $1::date`,
      [fechaHoy]
    );

    const tareas = result.rows;

    let totalSol = 0, cantSol = 0;
    let totalFin = 0, cantFin = 0;

    tareas.forEach((t) => {
      if (t.fecha_comp) {
        const tiempoSol = (new Date(t.fecha_comp) - new Date(t.fecha)) / (1000 * 60 * 60);
        totalSol += tiempoSol;
        cantSol += 1;
      }
      if (t.fecha_fin) {
        const tiempoFin = (new Date(t.fecha_fin) - new Date(t.fecha)) / (1000 * 60 * 60);
        totalFin += tiempoFin;
        cantFin += 1;
      }
    });

    const promedio_solucion = cantSol ? totalSol / cantSol : 0;
    const promedio_finalizacion = cantFin ? totalFin / cantFin : 0;

    // Guardar en la tabla 'promedios' (insertar o actualizar)
    await pool.query(
      `INSERT INTO promedios (fecha, promedio_solucion, promedio_finalizacion)
       VALUES ($1, $2, $3)
       ON CONFLICT (fecha)
       DO UPDATE SET promedio_solucion = EXCLUDED.promedio_solucion,
                     promedio_finalizacion = EXCLUDED.promedio_finalizacion`,
      [fechaHoy, promedio_solucion, promedio_finalizacion]
    );

    console.log(`✅ Promedios guardados para ${fechaHoy}`);
  } catch (err) {
    console.error("❌ Error calculando promedios:", err);
  }
}

// Ejecutar al iniciar el servidor
calcularYGuardarPromedios();

// Opcional: recalcular cada 24 horas
setInterval(calcularYGuardarPromedios, 24 * 60 * 60 * 1000);

// ---------- ASISTENTE IA ----------
// Helper para insertar en ia_logs de forma segura y consistente
async function logIALog({ session_id = "", pregunta = null, respuesta = null, correccion = null }) {
  // usamos casts explícitos para evitar conversiones implícitas
  const q = `
    INSERT INTO ia_logs (session_id, pregunta, respuesta, correccion)
    VALUES ($1::text, $2::text, $3::text, $4::text)
    RETURNING id
  `;
  const params = [session_id, pregunta || null, respuesta || null, correccion || null];
  return pool.query(q, params);
}

// 🧠 Formatea resultados SQL en texto natural
function formatearRespuestaSQL(sql, rows) {
  // Si la consulta devuelve solo una celda numérica (como un COUNT)
  if (rows.length > 0 && Object.keys(rows[0]).length === 1) {
    const valor = Object.values(rows[0])[0];

    // Detección semántica simple por tipo de consulta
    if (/count/i.test(sql)) {
      return `Hay ${valor} ${valor == 1 ? "tarea" : "tareas"} que cumplen esa condición.`;
    }
    if (/sum/i.test(sql)) {
      return `La suma total es ${valor}.`;
    }
    if (/avg|average/i.test(sql)) {
      return `El promedio calculado es ${valor}.`;
    }

    // Respuesta genérica si no detecta un tipo específico
    return `El resultado es ${valor}.`;
  }

  // Si hay varias filas, devolver un resumen claro
  if (rows.length > 0) {
    const columnas = Object.keys(rows[0]);
    const limite = Math.min(rows.length, 5); // máximo 5 filas mostradas
    const preview = rows
      .slice(0, limite)
      .map((r) => columnas.map((c) => `${c}: ${r[c]}`).join(", "))
      .join("\n- ");

    let resumen = `Se encontraron ${rows.length} registros. Ejemplos:\n- ${preview}`;
    if (rows.length > limite) resumen += `\n...y ${rows.length - limite} más.`;
    return resumen;
  }

  // Si no hay filas
  return "No se encontraron registros que cumplan esa condición.";
}

// ======================================================
// 🤖 Endpoint de IA — con razonamiento SQL + modo explicación
// ======================================================
app.post("/api/ia", async (req, res) => {
  const { pregunta, sessionId } = req.body;

  if (!pregunta || !sessionId) {
    return res.status(400).json({ error: "Faltan datos: pregunta o sessionId." });
  }

  // 🔍 Función auxiliar: detectar entidad principal
  function detectarEntidad(texto) {
    texto = texto.toLowerCase();
    if (texto.includes("personal") || texto.includes("empleado") || texto.includes("usuario"))
      return "personal";
    if (texto.includes("área") || texto.includes("area"))
      return "area";
    if (texto.includes("tarea") || texto.includes("trabajo"))
      return "tarea";
    return "general";
  }

  try {
    // ------------------------------------------------
    // 🔍 Buscar correcciones previas similares
    // ------------------------------------------------
    const { rows: correcciones } = await pool.query(
      `SELECT pregunta, correccion FROM ia_logs 
       WHERE correccion IS NOT NULL 
       AND similarity(pregunta, $1) > 0.85
       ORDER BY fecha DESC LIMIT 1`,
      [pregunta]
    );

    if (correcciones.length > 0) {
      let aplicarCorreccion = true;
      let respuesta;
      let correccion = correcciones[0].correccion.trim();

      // 🧠 Nuevo filtro por tipo de entidad
      const entidadActual = detectarEntidad(pregunta);
      const entidadCorreccion = detectarEntidad(correcciones[0].pregunta);
      if (entidadActual !== entidadCorreccion) {
        console.log(`⚠️ No se aplica corrección (entidades distintas): ${entidadActual} ≠ ${entidadCorreccion}`);
        aplicarCorreccion = false;
      }

      // Detectar número de área
      const regexArea = /área\s*(\d+)|area\s*(\d+)/i;
      const areaMatchActual = pregunta.match(regexArea);
      const areaActual = areaMatchActual ? areaMatchActual[1] || areaMatchActual[2] : null;

      const areaMatchCorreccion = correcciones[0].pregunta.match(regexArea);
      const areaCorreccion = areaMatchCorreccion ? areaMatchCorreccion[1] || areaMatchCorreccion[2] : null;

      if (areaActual && areaCorreccion && areaActual !== areaCorreccion) {
        if (/^select/i.test(correccion)) {
          correccion = correccion.replace(
            new RegExp(`'Area ${areaCorreccion}'`, "i"),
            `'Area ${areaActual}'`
          );
          console.log(`🔁 Adaptada la corrección para el Área ${areaActual}`);
        } else aplicarCorreccion = false;
      }

      if (aplicarCorreccion) {
        if (/^select/i.test(correccion)) {
          try {
            const { rows } = await pool.query(correccion);
            if (rows && rows.length > 0) {
              const firstRow = rows[0];
              const keys = Object.keys(firstRow).map(k => k.toLowerCase());

              // 🧠 Caso 1: un solo valor simple
              if (rows.length === 1 && keys.length === 1) {
                const valor = Object.values(firstRow)[0];
                respuesta = `El resultado es ${valor}.`;
              }

              // 🧠 Caso 2: resultados por área
              else if (keys.includes("area") && keys.includes("cantidad")) {
                respuesta =
                  "📊 Tareas pendientes por área:\n" +
                  rows.map(r => `- ${r.area}: ${r.cantidad} tareas`).join("\n");
              }

              // 🧠 Caso 3: resultados por personal
              else if (keys.includes("personal") && keys.includes("cantidad")) {
                respuesta =
                  "👤 Tareas realizadas por personal:\n" +
                  rows.map(r => `- ${r.personal}: ${r.cantidad} tareas`).join("\n");
              }

              // 🧠 Caso 4: resultados genéricos
              else {
                respuesta =
                  rows.map(r =>
                    Object.entries(r)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")
                  ).join(" | ");
              }
            } else {
              respuesta = "⚠️ No se encontraron tareas que cumplan esas condiciones.";
            }
          } catch (err) {
            console.error("❌ Error al ejecutar SQL de corrección:", err);
            respuesta = "La corrección contiene una consulta SQL no válida.";
          }
        } else {
          respuesta = correccion;
        }

        await pool.query(
          "INSERT INTO ia_logs (session_id, pregunta, respuesta) VALUES ($1, $2, $3)",
          [sessionId, pregunta, respuesta]
        );

        return res.json({ respuesta });
      }
    }

    // ------------------------------------------------
    // 🧠 Generar SQL automáticamente con OpenRouter
    // ------------------------------------------------
    const prompt = `
Eres un asistente experto en PostgreSQL y gestión de tareas.
Tu base de datos se llama "ric01" y tiene columnas: 
id, area, usuario, tarea, solucion, fin, fecha, fecha_comp, fecha_fin, asignado, reasignado_a, reasignado_por.

Objetivo:
- Si la pregunta requiere información (por ejemplo "¿cuál es la tarea más común?" o "qué área tiene más tareas?"),
  genera una consulta SQL válida que lo responda.
- No inventes datos. Usa solo SQL real sobre la tabla ric01.
- Devuelve SOLO la consulta SQL, nada más.
- Toma tu tiempo para penser bien las respuestas.

Ejemplo:
Pregunta: "¿Cuál es la tarea más común?"
Respuesta:
SELECT tarea, COUNT(*) AS cantidad FROM ric01 GROUP BY tarea ORDER BY cantidad DESC LIMIT 1;

Pregunta: "${pregunta}"
`;

    // 🧩 Llamada a OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    const data = await response.json();
    let sql = data?.choices?.[0]?.message?.content?.trim();

    if (!sql) {
      throw new Error("No se recibió SQL válido del modelo.");
    }

    console.log("🧮 SQL generado por IA:", sql);

    // ------------------------------------------------
    // Ejecutar el SQL generado
    // ------------------------------------------------
    let respuestaFinal = "";
    try {
      const { rows } = await pool.query(sql);

      if (rows.length === 0) {
        respuestaFinal = "No se encontraron resultados.";
      } else if (rows.length === 1) {
        const registro = rows[0];
        const columnas = Object.keys(registro);

        // 💬 Respuestas más naturales
        if (columnas.includes("personal") && columnas.includes("cantidad")) {
          respuestaFinal = `👤 ${registro.personal} ha realizado ${registro.cantidad} tareas.`;
        } else if (columnas.includes("tarea") && columnas.includes("cantidad")) {
          respuestaFinal = `🧩 La tarea más común es "${registro.tarea}" con ${registro.cantidad} registros.`;
        } else if (columnas.includes("area") && columnas.includes("cantidad")) {
          respuestaFinal = `🏢 El área con más tareas es "${registro.area}" con ${registro.cantidad} tareas.`;
        } else {
          respuestaFinal = Object.entries(registro)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        }
      } else {
        // Varias filas → generar texto legible
        const claves = Object.keys(rows[0]).map(k => k.toLowerCase());
        if (claves.includes("area") && claves.includes("cantidad")) {
          respuestaFinal = "📊 Tareas por área:\n" +
            rows.map(r => `- ${r.area}: ${r.cantidad} tareas`).join("\n");
        } else if (claves.includes("personal") && claves.includes("cantidad")) {
          respuestaFinal = "👥 Tareas por personal:\n" +
            rows.map(r => `- ${r.personal}: ${r.cantidad} tareas`).join("\n");
        } else {
          respuestaFinal = rows.map(r =>
            Object.entries(r)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ")
          ).join(" | ");
        }
      }
    } catch (err) {
      console.error("❌ Error al ejecutar SQL:", err);
      respuestaFinal = `No pude ejecutar correctamente la consulta. SQL generado:\n${sql}`;
    }

    // ------------------------------------------------
    // 🧩 Modo de explicación
    // ------------------------------------------------
    let explicacion = "";
    if (/explicame|cómo lo calculaste|muéstrame la consulta/i.test(pregunta)) {
      explicacion = `🔍 La consulta SQL utilizada fue:\n\n\`\`\`sql\n${sql}\n\`\`\``;
    }

    const respuestaCompleta = explicacion
      ? `${respuestaFinal}\n\n${explicacion}`
      : respuestaFinal;

    await pool.query(
      "INSERT INTO ia_logs (session_id, pregunta, respuesta) VALUES ($1, $2, $3)",
      [sessionId, pregunta, respuestaCompleta]
    );

    res.json({ respuesta: respuestaCompleta });
  } catch (error) {
    console.error("❌ Error en /api/ia:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});


// PUT /api/ia/corregir/:id (actualizar corrección existente)
app.put("/api/ia/corregir/:id", async (req, res) => {
  const { id } = req.params;
  const { nuevaRespuesta } = req.body;

  try {
    // Usamos bigint en lugar de int
    const result = await pool.query(
      "UPDATE ia_logs SET correccion = $1::text WHERE id = $2::bigint RETURNING id",
      [nuevaRespuesta, id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Registro no encontrado" });

    res.json({ mensaje: "✅ Corrección guardada con éxito.", id: result.rows[0].id });
  } catch (error) {
    console.error("❌ Error al guardar corrección (PUT):", {
      message: error?.message,
      stack: error?.stack,
      params: { id, nuevaRespuesta },
    });
    res.status(500).json({ error: "No se pudo guardar la corrección.", details: error?.message });
  }
});

// ----------------- SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});

// ----------------- PING INTERNO RENDER -----------------
const SELF_URL = "https://sky26.onrender.com";
setInterval(() => {
  fetch(SELF_URL)
    .then(() => console.log(`Ping interno exitoso ${new Date().toLocaleTimeString()}`))
    .catch(err => console.log("Error en ping interno:", err.message));
}, 13 * 60 * 1000);


















