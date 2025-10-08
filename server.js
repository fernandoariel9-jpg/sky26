// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET_KEY = process.env.JWT_SECRET || "repliKatM5";
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAILUSER,
    pass: process.env.EMAILPASS,
  },
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// Configuración PostgreSQL
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// ----------------- RUTAS -----------------
// (Todas las rutas de tareas, personal, servicios y áreas se mantienen igual)

// ---------- USUARIOS ----------

// Registro de usuario
app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, subservicio, area, movil, mail, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, area, movil, mail, password, verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING *`,
      [nombre, servicio, subservicio, area, movil, mail, hashed]
    );

    // ✅ Responder éxito inmediato
    res.json({
      message: "Usuario registrado correctamente. Revisa tu correo para verificar la cuenta.",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("Error registrando usuario:", err.message);
    if (err.code === "23505") {
      return res.status(400).json({ error: "Este correo ya está registrado" });
    }
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// Enviar correo de verificación
app.post("/usuarios/enviar-verificacion", async (req, res) => {
  try {
    const { mail } = req.body;
    const result = await pool.query("SELECT * FROM usuarios WHERE mail=$1", [mail]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    if (result.rows[0].verificado) return res.json({ message: "Usuario ya verificado" });

    const token = jwt.sign({ mail }, SECRET_KEY, { expiresIn: "24h" });
    const link = `https://sky26.onrender.com/usuarios/verificar/${token}`;

    try {
      await transporter.sendMail({
        from: `"Sistema Sky26" <${process.env.EMAIL_USER}>`,
        to: mail,
        subject: "Verifica tu cuenta Sky26",
        html: `
          <h3>Hola ${result.rows[0].nombre},</h3>
          <p>Gracias por registrarte en <b>Sky26</b>.</p>
          <p>Haz clic en el siguiente enlace para verificar tu correo:</p>
          <a href="${link}" target="_blank"
            style="background:#2f855a;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;">
            Verificar mi cuenta
          </a>
          <p>El enlace expirará en 24 horas.</p>
        `,
      });
      res.json({ message: "Correo de verificación enviado correctamente" });
    } catch (mailErr) {
      console.error("Error enviando correo:", mailErr.message);
      res.status(500).json({ error: "Usuario registrado, pero no se pudo enviar el correo de verificación" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error reenviando correo" });
  }
});

// ---------- resto de rutas ----------
// (Se mantienen exactamente igual que tu código original)

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});


