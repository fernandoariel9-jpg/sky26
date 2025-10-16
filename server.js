import { Resend } from "resend";
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer"); // 👈 agregado para enviar correos
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// Configuración PostgreSQL (Render)
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// ==================== CONFIGURACIÓN DE CORREO ====================
const transporter = nodemailer.createTransport({
  service: "gmail", // o smtp.tu_dominio.com
  auth: {
    user: process.env.MAIL_USER || "notificaciones.ic.skyapp@gmail.com",
    pass: process.env.MAIL_PASS || "TU_CONTRASEÑA_DE_APP", // ⚠️ usar clave de aplicación, no tu password real
  },
});

// Test
app.get("/test-mail", async (req, res) => {
  try {
    await resend.emails.send({
      from: "IC-SkyApp <notificaciones@icskyapp.com>",
      to: "fernandoariel9@gmail.com",
      subject: "Prueba IC-SkyApp desde Render",
      html: "<h2>✅ El envío de correo funciona correctamente</h2>",
    });
    res.send("Correo enviado correctamente con Resend 🚀");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error al enviar correo");
  }
});

// ==================== RUTAS ====================

// ---------- TAREAS ----------
app.get("/tareas/:area", async (req, res) => {
  const { area } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM ric01 
       WHERE 
         (area = $1 AND reasignado_a IS NULL)
         OR reasignado_a = $1
       ORDER BY fecha DESC`,
      [area]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener tareas:", err.message);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener todas las tareas", err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

// ========= CREAR NUEVA TAREA (con notificación por correo) =========
app.post("/tareas", async (req, res) => {
  try {
    let { usuario, tarea, fin, imagen, area, servicio, subservicio } = req.body;

    if (!usuario || !tarea) {
      return res.status(400).json({ error: "Falta 'usuario' o 'tarea' en el body" });
    }

    // Fallback de área, servicio y subservicio
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

    const nuevaTarea = result.rows[0];

    // ====== 🔔 Envío de notificación por correo ======

    try {
  const areaDestino = area;
  const usuariosDestino = await pool.query(
    "SELECT mail, nombre FROM personal WHERE area = $1",
    [areaDestino]
  );

  if (usuariosDestino.rows.length > 0) {
    for (const u of usuariosDestino.rows) {
      const mailOptions = {
        from: `"IC-SkyApp" <${process.env.MAIL_USER}>`,
        to: u.mail,
        subject: `🔔 Nueva tarea asignada a ${areaDestino}`,
        html: `
          <div style="font-family: Arial, sans-serif; border: 1px solid #e0e0e0; border-radius: 10px; padding: 20px; max-width: 600px; margin: auto;">
            <div style="text-align: center;">
              <img src="https://sky26.onrender.com/logosmall.png" alt="Logo IC-SkyApp" style="width: 80px; margin-bottom: 10px;" />
              <h2 style="color: #0056b3;">IC-SkyApp</h2>
            </div>
            <hr style="border: none; border-top: 1px solid #ccc;" />
            <p>Estimado/a <strong>${u.nombre}</strong>,</p>
            <p>Se ha asignado una nueva tarea para el área <strong>${areaDestino}</strong>:</p>
            <ul>
              <li><b>ID:</b> ${result.rows[0].id}</li>
              <li><b>Tarea:</b> ${tarea}</li>
              <li><b>Creada por:</b> ${usuario}</li>
              <li><b>Servicio:</b> ${servicio || "—"}</li>
              <li><b>Subservicio:</b> ${subservicio || "—"}</li>
              <li><b>Fecha:</b> ${new Date().toLocaleString()}</li>
            </ul>
            <p>Puedes gestionarla directamente desde el sistema.</p>
            <p style="font-size: 12px; color: #777; text-align: center; margin-top: 20px;">
              © ${new Date().getFullYear()} IC-SkyApp – Sistema de Gestión de Tareas
            </p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`📧 Notificación enviada a ${u.mail}`);
    }
  } else {
    console.log(`⚠️ No hay personal registrado en el área ${areaDestino}`);
  }
} catch (mailErr) {
  console.error("Error al enviar notificación por correo:", mailErr);
}
    // ✅ devolver la tarea creada al cliente
    res.json(nuevaTarea);

  } catch (err) {
    console.error("Error al crear tarea:", err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
}); 
    
// Actualizar solo la solución (personal)
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

// Finalizar tarea (usuario)
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

// --- Ruta para actualizar la calificación de una tarea ---
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

// PUT /tareas/:id/reasignar
app.put("/tareas/:id/reasignar", async (req, res) => {
  const { id } = req.params;
  const { nueva_area, reasignado_por } = req.body; // ✅ aquí se usa "nueva_area"

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

// ---------- USUARIOS ----------
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

// ---------- PERSONAL ----------
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

// ---------- SERVICIOS ----------
app.get("/servicios", async (req, res) => {
  try {
    const result = await pool.query("SELECT servicio, subservicio, area FROM servicios ORDER BY servicio");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener servicios", err.message); // log más claro
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

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});











