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
    const result = await pool.query(
      `SELECT * FROM ric01 
       WHERE (area = $1 AND reasignado_a IS NULL)
       OR reasignado_a = $1
       ORDER BY fecha DESC`,
      [area]
    );
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
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
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
  const { usuario, tarea, area, fin, imagen, servicio, subservicio } = req.body;

  try {
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
app.put("/tareas/:id/solucion", async (req, res) => {
  const { id } = req.params;
  const { solucion, asignado } = req.body;
  try {
    const fecha_comp = fechaLocalArgentina();
    await pool.query(
      `UPDATE ric01 SET solucion=$1, asignado=$2, fecha_comp=$3 WHERE id=$4`,
      [solucion, asignado, fecha_comp, id]
    );
    res.json({ message: "✅ Solución guardada" });
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
    if (result.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json(result.rows[0]);
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
    const result = await pool.query(
      `UPDATE ric01 SET reasignado_a=$1, reasignado_por=$2 WHERE id=$3 RETURNING *`,
      [nueva_area, reasignado_por, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json({ ok: true, tarea: result.rows[0] });
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
app.post("/api/suscribir", async (req, res) => {
  const { userId, subscription } = req.body;
  if (!userId || !subscription) return res.status(400).json({ error: "Faltan datos" });

  try {
    await pool.query("UPDATE personal SET suscripcion=$1 WHERE id=$2", [JSON.stringify(subscription), userId]);
    res.status(201).json({ message: "Suscripción guardada correctamente" });
  } catch (err) {
    console.error(err);
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

