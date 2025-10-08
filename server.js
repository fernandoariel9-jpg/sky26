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
        from: `"Sistema Sky26" <${process.env.EMAILUSER}>`,
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

// ---------- TAREAS ----------
// Endpoint GET de tareas filtradas por área
app.get("/tareas/:area", async (req, res) => {
  const { area } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM ric01 WHERE area = $1 ORDER BY fecha DESC",
      [area]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
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

// ---------- USUARIOS ----------
app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, subservicio, area, movil, mail, password } = req.body;
  try {
    // Cifrar la contraseña
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, area, movil, mail, password, verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING *`,
      [nombre, servicio, subservicio, area, movil, mail, hashed]
    );

    // Enviar correo de verificación
    const token = jwt.sign({ mail }, SECRET_KEY, { expiresIn: "24h" });
    const link = `https://sky26.onrender.com/usuarios/verificar/${token}`;

    await transporter.sendMail({
      from: `"Sistema Sky26" <${process.env.EMAIL_USER}>`,
      to: mail,
      subject: "Verifica tu cuenta Sky26",
      html: `
        <h3>Hola ${nombre},</h3>
        <p>Gracias por registrarte en <b>Sky26</b>.</p>
        <p>Haz clic en el siguiente enlace para verificar tu correo:</p>
        <a href="${link}" target="_blank"
          style="background:#2f855a;color:white;padding:10px 20px;text-decoration:none;border-radius:8px;">
          Verificar mi cuenta
        </a>
        <p>El enlace expirará en 24 horas.</p>
      `,
    });

    res.json({ message: "Usuario registrado. Se envió correo de verificación." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// ✅ Verificar correo desde enlace
app.get("/usuarios/verificar/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const decoded = jwt.verify(token, SECRET_KEY);

    const result = await pool.query("SELECT * FROM usuarios WHERE mail=$1", [decoded.mail]);
    if (result.rows.length === 0) return res.status(404).send("Usuario no encontrado");

    if (result.rows[0].verificado) {
      return res.send("✅ Tu cuenta ya está verificada.");
    }

    await pool.query("UPDATE usuarios SET verificado=true WHERE mail=$1", [decoded.mail]);
    res.send("🎉 Cuenta verificada correctamente. Ya puedes iniciar sesión.");
  } catch (err) {
    console.error("Error verificando token:", err);
    res.status(400).send("❌ Enlace inválido o expirado.");
  }
});

app.post("/usuarios/enviar-verificacion", async (req, res) => {
  try {
    const { mail } = req.body;
    const result = await pool.query("SELECT * FROM usuarios WHERE mail=$1", [mail]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    if (result.rows[0].verificado) return res.json({ message: "Usuario ya verificado" });

    const token = jwt.sign({ mail }, SECRET_KEY, { expiresIn: "24h" });
    const link = `https://sky26.onrender.com/usuarios/verificar/${token}`;

    await transporter.sendMail({
      from: `"Sistema Sky26" <${process.env.EMAIL_USER}>`,
      to: mail,
      subject: "Reenvío de verificación Sky26",
      html: `
        <p>Por favor verifica tu cuenta haciendo clic aquí:</p>
        <a href="${link}" target="_blank">Verificar cuenta</a>
      `,
    });

    res.json({ message: "Correo de verificación reenviado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error reenviando correo" });
  }
});

app.post("/usuarios/login", async (req, res) => {
  const { mail, password } = req.body;
  try {
    // Buscar usuario por correo
    const result = await pool.query("SELECT * FROM usuarios WHERE mail=$1", [mail]);

    if (result.rows.length === 0)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const usuario = result.rows[0];

    // Verificar si el usuario confirmó su correo
    if (!usuario.verificado) {
      return res
        .status(403)
        .json({ error: "Tu cuenta no está verificada. Revisa tu correo electrónico." });
    }

    // Comparar contraseña cifrada
    const bcrypt = require("bcryptjs");
    const esValida = await bcrypt.compare(password, usuario.password);
    if (!esValida)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    res.json({
      id: usuario.id,
      nombre: usuario.nombre,
      mail: usuario.mail,
      area: usuario.area,
      servicio: usuario.servicio,
      subservicio: usuario.subservicio,
      movil: usuario.movil,
    });
  } catch (err) {
    console.error("Error al loguear usuario:", err);
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




