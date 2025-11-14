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
    `);

    const promedio_finalizacion = Number(promedioFinQuery.rows[0].horas) || 0;

    // 📌 Guardar en la tabla resumen_tiempos
    await pool.query(
      `INSERT INTO resumen_tiempos (fecha, promedio_solucion, promedio_finalizacion)
       VALUES (CURRENT_DATE, $1, $2)
       ON CONFLICT (fecha)
       DO UPDATE SET 
          promedio_solucion = EXCLUDED.promedio_solucion,
          promedio_finalizacion = EXCLUDED.promedio_finalizacion`,
      [promedio_solucion, promedio_finalizacion]
    );

    console.log(
      `✅ Resumen de tiempos guardado: Solución=${promedio_solucion.toFixed(
        2
      )}h, Finalización=${promedio_finalizacion.toFixed(2)}h`
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

// ---------- TAREAS ----------
app.get("/tareas/:area", async (req, res) => {
  const { area } = req.params;
  try {
    const result = await pool.query(`
      SELECT r.*, u.movil AS movil
      FROM ric01 r
      LEFT JOIN usuarios u ON r.usuario = u.mail OR r.usuario = u.nombre
      WHERE (r.area = $1 AND r.reasignado_a IS NULL)
         OR r.reasignado_a = $1
      ORDER BY r.fecha DESC
    `, [area]);
    
    res.json(
      result.rows.map((t) => ({
        ...t,
        fecha: t.fecha || null,
        fecha_comp: t.fecha_comp || null,
        fecha_fin: t.fecha_fin || null,
      }))
    );
  } catch (err) {
    console.error("Error al obtener tareas:", err.message);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.movil AS movil
      FROM ric01 r
      LEFT JOIN usuarios u ON r.usuario = u.mail OR r.usuario = u.nombre
      ORDER BY r.fecha DESC
    `);

    res.json(
      result.rows.map((t) => ({
        ...t,
        fecha: t.fecha || null,
        fecha_comp: t.fecha_comp || null,
        fecha_fin: t.fecha_fin || null,
      }))
    );
  } catch (err) {
    console.error("Error al obtener todas las tareas", err);
    res.status(500).json({ error: "Error al obtener tareas" });
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
    const query = `
      SELECT
        a.area AS area,
        COUNT(*) AS total,

        -- promedio en horas de solución (fecha_comp - fecha)
        AVG(
          CASE 
            WHEN r.fecha_comp IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (r.fecha_comp - r.fecha)) / 3600
          END
        ) AS promedio_solucion,

        -- promedio en horas de finalización (fecha_fin - fecha_comp)
        AVG(
          CASE 
            WHEN r.fecha_fin IS NOT NULL
            THEN EXTRACT(EPOCH FROM (r.fecha_fin - r.fecha_comp)) / 3600
          END
        ) AS promedio_finalizacion

      FROM ric01 r
      LEFT JOIN areas a
        ON r.area = a.area

      GROUP BY a.area
      ORDER BY a.area;
    `;

    const { rows } = await pool.query(query);

    res.json(rows);

  } catch (error) {
    console.error("Error en /api/resumen_tiempos:", error);
    res.status(500).json({ error: "Error obteniendo resumen de tiempos" });
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


































