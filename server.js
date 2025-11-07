// ----------------- IMPORTS -----------------
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pkg from "pg";
const { Pool, types } = pkg;
import bcrypt from "bcryptjs";
import webpush from "web-push";
import fetch from "node-fetch";

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
});

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

// ================================================
// 🤖 Endpoint principal de la IA
// ================================================
app.post("/api/ia", async (req, res) => {
  const { pregunta, sessionId } = req.body;

  if (!pregunta || !sessionId) {
    return res.status(400).json({ error: "Faltan datos: pregunta o sessionId." });
  }

  try {
    // ------------------------------------------------
    // 🔍 Buscar correcciones previas similares
    // ------------------------------------------------
    const { rows: correcciones } = await pool.query(
      `SELECT pregunta, correccion FROM ia_logs 
       WHERE correccion IS NOT NULL 
       AND similarity(pregunta, $1) > 0.7
       ORDER BY fecha DESC LIMIT 1`,
      [pregunta]
    );

    if (correcciones.length > 0) {
      let aplicarCorreccion = true;
      let respuesta;
      let correccion = correcciones[0].correccion.trim();

      // 🧩 Detectar número de área (robusto, con o sin acento)
      const regexArea = /área\s*(\d+)|area\s*(\d+)/i;

      const areaMatchActual = pregunta.match(regexArea);
      const areaActual = areaMatchActual ? areaMatchActual[1] || areaMatchActual[2] : null;

      const areaMatchCorreccion = correcciones[0].pregunta.match(regexArea);
      const areaCorreccion = areaMatchCorreccion ? areaMatchCorreccion[1] || areaMatchCorreccion[2] : null;

      // 🚫 Si las áreas son distintas, no aplicar directamente la corrección
      if (areaActual && areaCorreccion && areaActual !== areaCorreccion) {
        console.log(`⚠️ Corrección previa era del Área ${areaCorreccion}, pero la nueva pregunta es del Área ${areaActual}`);
        
        // Si la corrección es SQL, adaptar el área automáticamente
        if (/^select/i.test(correccion)) {
          const regexReemplazo = new RegExp(`'Area ${areaCorreccion}'`, "i");
          correccion = correccion.replace(regexReemplazo, `'Area ${areaActual}'`);
          console.log(`🔁 Adaptada la corrección para el Área ${areaActual}`);
        } else {
          aplicarCorreccion = false; // Si no es SQL, mejor no aplicar
        }
      }

      if (aplicarCorreccion) {
        // 🧠 Ejecutar si es SQL
        if (/^select/i.test(correccion)) {
          try {
            const { rows } = await pool.query(correccion);
            if (rows.length > 0 && Object.keys(rows[0]).length === 1) {
              const valor = Object.values(rows[0])[0];
              respuesta = `El resultado es ${valor}.`;
            } else {
              respuesta = JSON.stringify(rows, null, 2);
            }
          } catch (err) {
            console.error("❌ Error al ejecutar SQL de corrección:", err);
            respuesta = "La corrección contiene una consulta SQL no válida.";
          }
        } else {
          respuesta = correccion; // No es SQL, usar texto
        }

        // Guardar log
        await pool.query(
          "INSERT INTO ia_logs (session_id, pregunta, respuesta) VALUES ($1, $2, $3)",
          [sessionId, pregunta, respuesta]
        );

        return res.json({ respuesta });
      }
    }

    // ------------------------------------------------
    // 🧠 Si no hay corrección aplicable, generar respuesta con IA
    // ------------------------------------------------
    const prompt = `
      Eres un asistente que responde preguntas sobre tareas en una base de datos PostgreSQL.
      Si la pregunta implica contar, sumar o filtrar datos, responde solo con la consulta SQL que lo haría.
      No inventes datos. Usa nombres de columnas: id, area, fin, solucion, fecha, fecha_comp, fecha_fin, etc.
      Usa lenguaje técnico y profesional.
      Pregunta: "${pregunta}"
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    let respuestaIA = completion.choices[0].message.content.trim();

    // Si la respuesta es una consulta SQL, intentar ejecutarla
    let respuesta;
    if (/^select/i.test(respuestaIA)) {
      try {
        const { rows } = await pool.query(respuestaIA);
        if (rows.length > 0 && Object.keys(rows[0]).length === 1) {
          const valor = Object.values(rows[0])[0];
          respuesta = `El resultado es ${valor}.`;
        } else {
          respuesta = JSON.stringify(rows, null, 2);
        }
      } catch (err) {
        console.error("❌ Error ejecutando consulta SQL:", err);
        respuesta = respuestaIA; // Devolver el SQL como referencia
      }
    } else {
      respuesta = respuestaIA;
    }

    // Guardar log
    await pool.query(
      "INSERT INTO ia_logs (session_id, pregunta, respuesta) VALUES ($1, $2, $3)",
      [sessionId, pregunta, respuesta]
    );

    res.json({ respuesta });
  } catch (error) {
    console.error("❌ Error en /api/ia:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// ================================================
// 💾 Guardar o actualizar corrección manual (POST)
// ================================================
app.post("/api/ia/corregir", async (req, res) => {
  const { pregunta_original, correccion, sessionId } = req.body;

  if (!pregunta_original || !correccion) {
    return res.status(400).json({ error: "Faltan datos: pregunta_original o correccion." });
  }

  try {
    const sid = String(sessionId || "");

    // 🧩 Verificar si existe una corrección similar ya guardada
    const { rows: existentes } = await pool.query(
      `SELECT id, pregunta FROM ia_logs 
       WHERE correccion IS NOT NULL 
       AND similarity(pregunta, $1) > 0.8
       ORDER BY fecha DESC LIMIT 1`,
      [pregunta_original]
    );

    if (existentes.length > 0) {
      // ⚙️ Si ya existe una similar, la actualizamos
      const existente = existentes[0];
      const result = await pool.query(
        "UPDATE ia_logs SET correccion = $1::text WHERE id = $2 RETURNING id",
        [correccion, existente.id]
      );

      console.log(`🔁 Corrección actualizada para pregunta similar (id ${existente.id})`);

      return res.json({
        mensaje: "✅ Corrección actualizada (ya existía una similar).",
        id: result.rows[0].id,
      });
    }

    // 🆕 Si no existe una similar, crear una nueva
    const result = await pool.query(
      `INSERT INTO ia_logs (session_id, pregunta, correccion) 
       VALUES ($1::text, $2::text, $3::text) RETURNING id`,
      [sid, pregunta_original, correccion]
    );

    console.log(`🆕 Nueva corrección guardada (id ${result.rows[0].id})`);

    return res.json({
      mensaje: "✅ Nueva corrección guardada exitosamente.",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("❌ Error al guardar corrección:", {
      message: error?.message,
      stack: error?.stack,
      params: { pregunta_original, correccion, sessionId },
    });
    return res
      .status(500)
      .json({ error: "No se pudo guardar la corrección.", details: error?.message });
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











