// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Agregar esto en server.js (por ejemplo arriba o junto a las otras rutas)
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error al obtener todas las tareas", err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});


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
  // 📧 Notificación por correo al área asignada
    try {
      const nodemailer = require("nodemailer");

      // Buscar emails del personal del área
      const personalQuery = await pool.query(
        "SELECT mail FROM personal WHERE area = $1",
        [area]
      );

      if (personalQuery.rows.length > 0) {
        const destinatarios = personalQuery.rows.map(p => p.mail).join(",");

        // Transporter configurado con Render (usa tus variables de entorno)
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: process.env.SMTP_PORT || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        // Contenido del correo (HTML institucional)
        const mailOptions = {
          from: `"IC-SkyApp" <${process.env.SMTP_USER}>`,
          to: destinatarios,
          subject: `📋 Nueva tarea asignada al área ${area}`,
          html: `
            <div style="font-family: Arial, sans-serif; border:1px solid #ddd; border-radius:10px; padding:20px; max-width:600px;">
              <div style="text-align:center; margin-bottom:20px;">
                <img src="https://icsky26.onrender.com/logosmall.png" alt="IC-SkyApp" style="width:80px;"/>
                <h2 style="color:#0b5394;">Nueva tarea asignada</h2>
              </div>
              <p>Se ha registrado una nueva tarea para su área <strong>${area}</strong>.</p>
              <p><b>Tarea:</b> ${tarea}</p>
              <p><b>Asignada por:</b> ${usuario}</p>
              <p><b>Fecha:</b> ${new Date().toLocaleString("es-AR")}</p>
              <hr>
              <p style="font-size:12px; color:#888;">IC-SkyApp • Sistema de gestión institucional</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`📧 Correo enviado a ${destinatarios}`);
      } else {
        console.log(`⚠️ No hay personal registrado en el área ${area}`);
      }
    } catch (emailErr) {
      console.error("❌ Error al enviar correo:", emailErr.message);
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR DETALLADO (POST /tareas):", err);
    res.status(500).json({ error: err.message || "Error al crear tarea" });
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

async function enviarNotificacion(area, tarea, usuario) {
  try {
    const personal = await pool.query("SELECT mail, nombre FROM personal WHERE area=$1", [area]);
    if (personal.rows.length === 0) {
      console.log(`⚠️ No hay personal registrado en el área ${area}`);
      return;
    }

    const correos = personal.rows.map(p => p.mail);

    const html = `
      <div style="font-family: Arial, sans-serif; border: 1px solid #ccc; padding: 20px; max-width: 600px;">
        <div style="display: flex; align-items: center;">
          <img src="https://icsky26.onrender.com/logosmall.png" style="height: 50px; margin-right: 10px;" />
          <h2 style="color: #004080;">IC-SkyApp</h2>
        </div>
        <hr/>
        <p>Estimado equipo de <strong>${area}</strong>,</p>
        <p>Se ha asignado una nueva tarea:</p>
        <blockquote style="border-left: 4px solid #004080; margin: 10px 0; padding-left: 10px;">
          <strong>${tarea}</strong>
        </blockquote>
        <p><b>Asignado por:</b> ${usuario}</p>
        <p><b>Fecha:</b> ${new Date().toLocaleString("es-AR")}</p>
        <br/>
        <p style="font-size: 12px; color: gray;">Este mensaje fue generado automáticamente por IC-SkyApp.</p>
      </div>
    `;

    await resend.emails.send({
      from: "IC-SkyApp <notificaciones@icskyapp.com>",
      to: correos,
      subject: `Nueva tarea asignada al área ${area}`,
      html,
    });

    console.log(`📧 Notificación enviada a ${correos.length} destinatarios del área ${area}`);
  } catch (error) {
    console.error("❌ Error al enviar correo de notificación:", error);
  }
}

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});



