// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

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
app.get("/tareas", async (req, res) => {
  const { area } = req.query; // ej: /tareas?area=Soporte
  try {
    const query = area
      ? "SELECT * FROM ric01 WHERE area=$1 ORDER BY fecha DESC"
      : "SELECT * FROM ric01 ORDER BY fecha DESC";
    const params = area ? [area] : [];
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.post("/tareas", async (req, res) => {
  const { usuario, tarea, fin, imagen, area} = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO ric01 (usuario, tarea, fin, imagen, fecha, area) VALUES ($1, $2, $3, $4, NOW(), $5) RETURNING *",
      [usuario, tarea, fin || false, imagen || null, area]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR DETALLADO:", err); // log completo
    res.status(500).json({ error: err.message }); // devuelve mensaje real al frontend
  }
});

// Actualizar solo la solución (personal)
app.put("/tareas/:id/solucion", async (req, res) => {
  const { id } = req.params;
  const { solucion } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ric01
       SET solucion = $1
       WHERE id = $2
       RETURNING *`,
      [solucion, id]
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
    const areaCheck = await pool.query("SELECT * FROM areas WHERE nombre=$1", [area]);
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






