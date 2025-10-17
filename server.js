const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer"); // ✅ agregado

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" })); // para imágenes en base64

// Configuración PostgreSQL usando variables de entorno de Render
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: {
    rejectUnauthorized: false, // Render requiere SSL pero sin verificar certificado
  },
});

// ✅ Configuración de Nodemailer con Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "EMAIL_USER", // ⚠️ tu Gmail real
    pass: "EMAIL_PASS", // ⚠️ la generada en https://myaccount.google.com/apppasswords
  },
});

// ----------------- RUTAS -----------------

// ---------- TAREAS ----------
// Endpoint GET de tareas filtradas por área
app.get("/tareas/:area", async (req, res) => {
  const { area } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM ric01 
       WHERE 
         (area = $1 AND reasignado_a IS NULL)  -- solo tareas propias no reasignadas
         OR reasignado_a = $1                  -- y tareas reasignadas a este área
       ORDER BY fecha DESC`,
      [area]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener tareas:", err.message);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

// Obtener todas las tareas
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener todas las tareas", err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

// Crear tarea (con notificación por correo)
app.post("/tareas", async (req, res) => {
  try {
    let { usuario, tarea, fin, imagen, area, servicio, subservicio } = req.body;

    // Validaciones básicas
    if (!usuario || !tarea) {
      return res.status(400).json({ error: "Falta 'usuario' o 'tarea' en el body" });
    }

    // Fallback de área, servicio y subservicio desde tabla usuarios
    if (!area || !servicio || !subservicio) {
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
          console.warn(`No se encontró usuario para asignar valores: ${usuario}`);
        }
      } catch (lookupErr) {
        console.error("Error buscando datos en usuarios:", lookupErr);
      }
    }

    // Inserción en ric01
    const result = await pool.query(
      `INSERT INTO ric01 
        (usuario, tarea, fin, imagen, fecha, area, servicio, subservicio) 
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7) 
       RETURNING *`,
      [usuario, tarea, fin || false, imagen || null, area || null, servicio || null, subservicio || null]
    );

    // ✅ Enviar notificación a todo el personal del área
    try {
      const personalResult = await pool.query("SELECT mail FROM personal WHERE area = $1", [area]);
      const correos = personalResult.rows.map(r => r.mail);

      if (correos.length > 0) {
        const mailOptions = {
          from: "EMAIL_USER", // ⚠️ mismo Gmail configurado arriba
          to: correos.join(","),
          subject: `Nueva tarea en el área ${area}`,
          html: `
            <h3>Nueva tarea creada</h3>
            <p><strong>Usuario:</strong> ${usuario}</p>
            <p><strong>Tarea:</strong> ${tarea}</p>
            <p><strong>Servicio:</strong> ${servicio || "-"} | <strong>Subservicio:</strong> ${subservicio || "-"}</p>
            <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Notificación enviada a: ${correos.join(", ")}`);
      }
    } catch (mailErr) {
      console.error("⚠️ Error al enviar notificación por correo:", mailErr.message);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR DETALLADO (POST /tareas):", err);
    res.status(500).json({ error: err.message || "Error al crear tarea" });
  }
});

// Resto del código original sin cambios

app.put("/tareas/:id/solucion", async (req, res) => {
  const { id } = req.params;
  const { solucion, asignado } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ric01
       SET solucion = $1, asignado = $2
       WHERE id = $3
       RETURNING *`,
      [solucion, asignado || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al actualizar solución:", err);
    res.status(500).json({ error: "Error al actualizar solución" });
  }
});

app.put("/tareas/:id", async (req, res) => {
  const { id } = req.params;
  const { fin } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ric01
       SET fin = $1
       WHERE id = $2
       RETURNING *`,
      [fin, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error al finalizar tarea:", err);
    res.status(500).json({ error: "Error al finalizar tarea" });
  }
});

app.put("/tareas/:id/calificacion", async (req, res) => {
  const { id } = req.params;
  const { calificacion } = req.body;

  if (!calificacion || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: "Calificación inválida (1–5)" });
  }

  try {
    const result = await pool.query(
      "UPDATE ric01 SET calificacion = $1 WHERE id = $2 RETURNING *",
      [calificacion, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    res.json({
      mensaje: "Calificación actualizada correctamente",
      tarea: result.rows[0],
    });
  } catch (err) {
    console.error("Error al guardar calificación:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

app.put("/tareas/:id/reasignar", async (req, res) => {
  const { id } = req.params;
  const { nueva_area, reasignado_por } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ric01
       SET reasignado_a = $1, reasignado_por = $2
       WHERE id = $3
       RETURNING *`,
      [nueva_area, reasignado_por, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    res.json({ ok: true, tarea: result.rows[0] });
  } catch (err) {
    console.error("Error al reasignar tarea:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, subservicio, area, movil, mail, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, area, movil, mail, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, servicio, subservicio, area, movil, mail, password]
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
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE mail=$1 AND password=$2",
      [mail, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al loguear usuario" });
  }
});

app.post("/personal", async (req, res) => {
  const { nombre, movil, mail, area, password } = req.body;
  try {
    const areaCheck = await pool.query("SELECT * FROM areas WHERE area=$1", [area]);
    if (areaCheck.rows.length === 0)
      return res.status(400).json({ error: "Área inválida" });

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
    const result = await pool.query(
      "SELECT * FROM personal WHERE mail=$1 AND password=$2",
      [mail, password]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: "Credenciales inválidas" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login personal" });
  }
});

app.get("/servicios", async (req, res) => {
  try {
    const result = await pool.query("SELECT servicio, subservicio, area FROM servicios ORDER BY servicio");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener servicios", err.message);
    res.status(500).json({ error: "Error al obtener servicios" });
  }
});

app.get("/areas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM areas ORDER BY id");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener áreas" });
  }
});

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
