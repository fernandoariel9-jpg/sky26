// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "5mb" })); // para imagenes en base64

// Configuración PostgreSQL
const pool = new Pool({
  user: "fernando",
  host: "postgresql://fernando:zPxkQxOVRTeEr0AOQ4PQBXsAO0tJbPdp@dpg-d39tdemmcj7s739kp1tg-a/skybase",
  database: "skybase",
  password: "zPxkQxOVRTeEr0AOQ4PQBXsAO0tJbPdp",
  port: 5432,
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
      "INSERT INTO ric01 (usuario, tarea, fin, imagen) VALUES ($1, $2, $3, $4) RETURNING *",
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

// ----------------- INICIO SERVIDOR -----------------
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

