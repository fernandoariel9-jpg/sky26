const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: "5mb" }));

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

// ---------------- Usuarios ----------------
app.get("/usuarios", async (req, res) => {
  const result = await pool.query("SELECT * FROM usuarios");
  res.json(result.rows);
});

app.post("/usuarios", async (req, res) => {
  const { nombre, servicio, subservicio, movil, mail, password } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, servicio, subservicio, movil, mail, password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nombre, servicio, subservicio, movil, mail, password]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ error: "❌ El correo ya está registrado" });
    }
    console.error(err);
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});


// ---------------- Personal ----------------
app.get("/personal", async (req, res) => {
  const result = await pool.query("SELECT * FROM personal");
  res.json(result.rows);
});

app.post("/personal", async (req, res) => {
  const { nombre, area, movil, mail, password } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO personal (nombre, area, movil, mail, password) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [nombre, area, movil, mail, password]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al registrar personal" });
  }
});

// ---------------- Servicios ----------------
app.get("/servicios", async (req, res) => {
  try {
    const result = await pool.query("SELECT servicio, subservicio, area FROM servicios");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener servicios" });
  }
});

// ---------------- Tareas ----------------
// Crear tarea → asigna área automáticamente según el usuario
app.post("/tareas", async (req, res) => {
  const { usuario, tarea, imagen } = req.body;
  try {
    const userRes = await pool.query(
      "SELECT servicio, area FROM usuarios WHERE mail=$1",
      [usuario]
    );
    if (userRes.rows.length === 0)
      return res.status(404).json({ error: "Usuario no encontrado" });

    const { servicio, area } = userRes.rows[0];

    const insertRes = await pool.query(
      "INSERT INTO tareas (usuario, tarea, imagen, fin, servicio, area) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [usuario, tarea, imagen || null, false, servicio, area]
    );
    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear tarea" });
  }
});

// Obtener todas las tareas
app.get("/tareas", async (req, res) => {
  const result = await pool.query("SELECT * FROM tareas ORDER BY fecha DESC");
  res.json(result.rows);
});

// Obtener tareas por personal (solo de su área)
app.get("/tareas/personal/:mail", async (req, res) => {
  const mail = req.params.mail;
  try {
    const areaRes = await pool.query("SELECT area FROM personal WHERE mail=$1", [mail]);
    if (areaRes.rows.length === 0)
      return res.status(404).json({ error: "Personal no encontrado" });

    const area = areaRes.rows[0].area;

    const tareasRes = await pool.query(
      "SELECT * FROM tareas WHERE area=$1 ORDER BY fecha DESC",
      [area]
    );

    res.json(tareasRes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener tareas" });
  }
});

// Actualizar solución de tarea
app.put("/tareas/:id", async (req, res) => {
  const { solucion, fin } = req.body;
  const id = req.params.id;
  try {
    const result = await pool.query(
      "UPDATE tareas SET solucion=$1, fin=$2 WHERE id=$3 RETURNING *",
      [solucion || null, fin || false, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar tarea" });
  }
});

app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));



