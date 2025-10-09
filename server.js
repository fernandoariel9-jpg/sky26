// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");
const { Resend } = require("resend");
const jwt = require("jsonwebtoken");
const app = express();
const PORT = process.env.PORT || 4000;
const resend = new Resend(process.env.RESEND_API_KEY);

// Configurar transporte de correo
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
    // Crear usuario como no verificado
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, area, movil, mail, password, verificado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING *`,
      [nombre, servicio, subservicio, area, movil, mail, password]
    );

    const user = result.rows[0];

    // Crear token de verificación (expira en 24 h)
   const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1d" });
const verifyLink = `${process.env.FRONTEND_URL}/verificar/${token}`;

await resend.emails.send({
  from: "Sky26 <no-reply@sky26.app>", // o el dominio que verifiques
  to: mail,
  subject: "Verificá tu cuenta en Sky26",
  html: `
    <h2>Hola ${nombre} 👋</h2>
    <p>Gracias por registrarte en <b>Sky26</b>.</p>
    <p>Por favor hacé clic en el siguiente enlace para verificar tu cuenta:</p>
    <a href="${verifyLink}" target="_blank">Verificar mi cuenta</a>
    <p>El enlace expirará en 24 horas.</p>
  `,
});

    res.json({
      message: "Usuario registrado. Revisá tu correo para verificar la cuenta.",
    });
  } catch (err) {
    console.error("❌ Error al registrar usuario:", err);
    res.status(500).json({ error: "Error al registrar usuario" });
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
    const result = await pool.query("SELECT * FROM areas ORDER BY area");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener áreas" });
  }
});

// ---------- VERIFICAR CORREO ----------
app.get("/usuarios/verificar/:token", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const result = await pool.query(
      "UPDATE usuarios SET verificado = true WHERE id = $1 RETURNING *",
      [decoded.id]
    );

    if (result.rows.length === 0)
      return res.status(404).send("Usuario no encontrado.");

    res.send("✅ Cuenta verificada con éxito. Ya podés ingresar a la aplicación.");
  } catch (err) {
    console.error("❌ Error en verificación:", err);
    res.status(400).send("Token inválido o expirado.");
  }
});

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});




