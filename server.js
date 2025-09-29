// src/server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());

// ⚡ Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ========================
// TABLA USUARIOS
// ========================

// Registro de usuario
app.post("/usuarios", async (req, res) => {
  try {
    const { usuario, password, servicio } = req.body;
    const result = await pool.query(
      "INSERT INTO usuarios (usuario, password, servicio) VALUES ($1, $2, $3) RETURNING *",
      [usuario, password, servicio]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registrando usuario" });
  }
});

// Login de usuario
app.post("/usuarios/login", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE usuario=$1 AND password=$2",
      [usuario, password]
    );
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login" });
  }
});

// ========================
// TABLA TAREAS
// ========================

// Crear tarea
app.post("/tareas", async (req, res) => {
  try {
    const { usuario, tarea, imagen } = req.body;
    const result = await pool.query(
      "INSERT INTO tareas (usuario, tarea, imagen, fecha) VALUES ($1, $2, $3, NOW()) RETURNING *",
      [usuario, tarea, imagen]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando tarea" });
  }
});

// Listar tareas
app.get("/tareas", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM tareas ORDER BY fecha DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo tareas" });
  }
});

// Marcar tarea como finalizada con solución
app.put("/tareas/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { solucion } = req.body;
    const result = await pool.query(
      "UPDATE tareas SET fin=TRUE, solucion=$1 WHERE id=$2 RETURNING *",
      [solucion, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error actualizando tarea" });
  }
});

// ========================
// TABLA PERSONAL
// ========================

// Registro de personal
app.post("/personal", async (req, res) => {
  try {
    const { nombre, movil, mail, area, password } = req.body;
    const result = await pool.query(
      "INSERT INTO personal (nombre, movil, mail, area, password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [nombre, movil, mail, area, password]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error registrando personal" });
  }
});

// Login de personal
app.post("/personal/login", async (req, res) => {
  try {
    const { mail, password } = req.body;
    const result = await pool.query(
      "SELECT * FROM personal WHERE mail=$1 AND password=$2",
      [mail, password]
    );
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login personal" });
  }
});

// ========================
// SERVER
// ========================
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
