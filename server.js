// server.js
const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// Configuración PostgreSQL (Render requiere SSL)
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// ----------------- RUTAS -----------------

// Obtener todas las tareas
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

// Crear nueva tarea
app.post("/tareas", async (req, res) => {
  const { usuario, tarea, fin, imagen } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO ric01 (usuario, tarea, fin, imagen) VALUES ($1,$2,$3,$4) RETURNING *",
      [usuario, tarea, fin || false, imagen || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
});

// Actualizar tarea
app.put("/tareas/:id", async (req, res) => {
  const { id } = req.params;
  const { tarea, fin, imagen } = req.body;
  try {
    const result = await pool.query(
      "UPDATE ric01 SET tarea=$1, fin=$2, imagen=$3 WHERE id=$4 RETURNING *",
      [tarea, fin, imagen, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar tarea" });
  }
});

// Registro de usuario
app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, movil, mail } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO usuarios (nombre, servicio, movil, mail) VALUES ($1,$2,$3,$4) RETURNING *",
      [nombre, servicio, movil, mail]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// Obtener usuarios (si necesitás)
app.get("/usuarios", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuarios ORDER BY nombre ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// ----------------- SERVIR FRONTEND REACT -----------------
app.use(express.static(path.join(__dirname, "build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
