const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

// Configuración PostgreSQL con Render
const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
});

// ---------------- TABLAS ----------------
// Tareas: ric01
// Usuarios: usuarios

// ---------- Rutas de Tareas ----------
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ric01 ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

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

// ---------- Rutas de Usuarios ----------
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

app.get("/usuarios/:nombre", async (req, res) => {
  const { nombre } = req.params;
  try {
    const result = await pool.query("SELECT * FROM usuarios WHERE nombre=$1", [
      nombre,
    ]);
    if (result.rows.length > 0) res.json(result.rows[0]);
    else res.status(404).json({ error: "Usuario no encontrado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar usuario" });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
