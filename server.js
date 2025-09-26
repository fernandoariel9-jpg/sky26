// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" })); // soportar imágenes base64

// Configuración PostgreSQL (Render)
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false }, // Render requiere SSL
});

// Inicializar tablas si no existen
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      servicio VARCHAR(100),
      movil VARCHAR(50),
      mail VARCHAR(100)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tareas (
      id SERIAL PRIMARY KEY,
      usuario VARCHAR(100) NOT NULL,
      tarea TEXT NOT NULL,
      fin BOOLEAN DEFAULT FALSE,
      imagen TEXT,
      fecha TIMESTAMP DEFAULT NOW()
    )
  `);

  console.log("Tablas verificadas ✅");
}
initDB();

// -------- RUTAS USUARIOS --------
app.post("/usuarios", async (req, res) => {
  try {
    const { nombre, servicio, movil, mail } = req.body;
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio" });

    const result = await pool.query(
      "INSERT INTO usuarios (nombre, servicio, movil, mail) VALUES ($1,$2,$3,$4) RETURNING *",
      [nombre, servicio, movil, mail]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al registrar usuario:", err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

app.get("/usuarios", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM usuarios ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

// -------- RUTAS TAREAS --------
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tareas ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

app.post("/tareas", async (req, res) => {
  try {
    const { usuario, tarea, imagen } = req.body;
    if (!usuario || !tarea) return res.status(400).json({ error: "Datos incompletos" });

    const result = await pool.query(
      "INSERT INTO tareas (usuario, tarea, imagen) VALUES ($1,$2,$3) RETURNING *",
      [usuario, tarea, imagen]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al crear tarea:", err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
});

app.put("/tareas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, tarea, fin, imagen } = req.body;

    const result = await pool.query(
      "UPDATE tareas SET usuario=$1, tarea=$2, fin=$3, imagen=$4 WHERE id=$5 RETURNING *",
      [usuario, tarea, fin, imagen, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: "Tarea no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error al actualizar tarea:", err);
    res.status(500).json({ error: "Error al actualizar tarea" });
  }
});

// -------- SERVER --------
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
