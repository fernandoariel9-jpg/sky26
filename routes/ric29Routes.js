import express from "express";
import pool from "../db.js";
import webpush from "web-push";

import {
  guardarRIC29,
  obtenerDetalleRIC29,
  generarPDFRIC29,
  enviarRIC29Drive
} from "../controllers/ric29Controller.js";

import {
  listarNotificacionesMantenimiento,
  marcarNotificacionMantenimientoLeida,
  marcarTodasNotificacionesMantenimientoLeidas
} from "../controllers/notificacionesMantenimientoController.js";

import sky26AgentRoutes from "./sky26AgentRoutes.js";

const router = express.Router();

function fechaLocalArgentina() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
    .formatToParts(ahora)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  return `${partes.year}-${partes.month}-${partes.day} ${partes.hour}:${partes.minute}`;
}

async function enviarNotificacionTarea(area, tarea) {
  if (!area) return;

  try {
    const personalRes = await pool.query(
      "SELECT suscripcion FROM personal WHERE area = $1 AND suscripcion IS NOT NULL",
      [area]
    );

    if (!personalRes.rows.length) return;

    const payload = JSON.stringify({
      title: "Nueva tarea asignada",
      body: tarea,
      icon: "/icon-192x192.png"
    });

    for (const row of personalRes.rows) {
      try {
        const subscription = typeof row.suscripcion === "string"
          ? JSON.parse(row.suscripcion)
          : row.suscripcion;
        await webpush.sendNotification(subscription, payload);
      } catch (error) {
        console.warn("No se pudo enviar una notificación de tarea:", error.message);
      }
    }
  } catch (error) {
    console.error("Error notificando nueva tarea:", error);
  }
}

// ============================================================
// TAREAS DE USUARIOS
// ============================================================
// Para tareas nuevas:
//   ric01.usuario         = nombre visible
//   ric01.solicitado_por  = mail único
//
// Para tareas históricas se conserva compatibilidad con filas que
// solo tienen el nombre en ric01.usuario, de modo que no desaparezcan
// al comenzar a identificar usuarios por mail.
router.get("/tareas-usuario", async (req, res) => {
  try {
    const mail = String(req.query.mail || "").trim();

    if (!mail) {
      return res.status(400).json({ error: "Mail de usuario requerido" });
    }

    const userResult = await pool.query(
      `SELECT nombre, mail, tipo, servicio
       FROM usuarios
       WHERE TRIM(LOWER(mail)) = TRIM(LOWER($1))
       LIMIT 1`,
      [mail]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuarioActual = userResult.rows[0];
    const nombre = String(usuarioActual.nombre || "").trim();
    const mailNormalizado = String(usuarioActual.mail || mail).trim();

    let where = "";
    let params = [];

    if (String(usuarioActual.tipo || "").trim().toLowerCase() === "supervisor") {
      where = "WHERE r.servicio = $1";
      params = [usuarioActual.servicio];
    } else {
      where = `
        WHERE
          -- Formato nuevo: el mail queda como identidad única.
          TRIM(LOWER(COALESCE(r.solicitado_por, ''))) = TRIM(LOWER($1))

          -- Compatibilidad con el cambio anterior que guardó el mail en usuario.
          OR TRIM(LOWER(COALESCE(r.usuario, ''))) = TRIM(LOWER($1))

          -- Compatibilidad histórica: tareas antiguas que solo guardaban el nombre.
          -- Solo se usa cuando solicitado_por no contiene una identidad distinta.
          OR (
            TRIM(LOWER(COALESCE(r.usuario, ''))) = TRIM(LOWER($2))
            AND (
              r.solicitado_por IS NULL
              OR TRIM(r.solicitado_por) = ''
              OR TRIM(LOWER(r.solicitado_por)) = TRIM(LOWER($2))
            )
          )
      `;
      params = [mailNormalizado, nombre];
    }

    const result = await pool.query(
      `SELECT
         r.*,
         usuario_contacto.movil,
         CASE
           WHEN r.diagnostico IS NOT NULL
            AND TRIM(r.diagnostico) <> ''
           THEN (
             SELECT json_agg(DISTINCT solucion)
             FROM rics
             WHERE UPPER(TRIM(diagnostico)) = UPPER(TRIM(r.diagnostico))
               AND solucion IS NOT NULL
               AND TRIM(solucion) <> ''
           )
           ELSE NULL
         END AS soluciones_posibles
       FROM ric01 r
       LEFT JOIN LATERAL (
         SELECT u.movil
         FROM usuarios u
         WHERE
           TRIM(LOWER(u.mail)) = TRIM(LOWER(COALESCE(r.solicitado_por, '')))
           OR TRIM(LOWER(u.mail)) = TRIM(LOWER(COALESCE(r.usuario, '')))
           OR (
             (r.solicitado_por IS NULL OR TRIM(r.solicitado_por) = '')
             AND TRIM(LOWER(u.nombre)) = TRIM(LOWER(COALESCE(r.usuario, '')))
           )
         ORDER BY CASE
           WHEN TRIM(LOWER(u.mail)) = TRIM(LOWER(COALESCE(r.solicitado_por, ''))) THEN 0
           WHEN TRIM(LOWER(u.mail)) = TRIM(LOWER(COALESCE(r.usuario, ''))) THEN 1
           ELSE 2
         END
         LIMIT 1
       ) usuario_contacto ON true
       ${where}
       ORDER BY r.fecha DESC`,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo tareas de usuario:", error);
    res.status(500).json({ error: "Error al obtener tareas del usuario" });
  }
});

router.post("/tareas-usuario", async (req, res) => {
  try {
    let {
      usuario,
      usuario_nombre,
      usuario_mail,
      solicitado_por,
      tarea,
      area,
      fin,
      imagen,
      servicio,
      subservicio
    } = req.body;

    if (!tarea || !String(tarea).trim()) {
      return res.status(400).json({ error: "Ingrese una descripción de tarea" });
    }

    const mail = String(usuario_mail || solicitado_por || "").trim().toLowerCase();

    if (!mail) {
      return res.status(400).json({ error: "No se recibió el mail del usuario" });
    }

    const userResult = await pool.query(
      `SELECT nombre, mail, area, servicio, subservicio
       FROM usuarios
       WHERE TRIM(LOWER(mail)) = TRIM(LOWER($1))
       LIMIT 1`,
      [mail]
    );

    if (!userResult.rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const usuarioDB = userResult.rows[0];
    const nombre = String(usuario_nombre || usuarioDB.nombre || usuario || "").trim();
    const mailDB = String(usuarioDB.mail || mail).trim().toLowerCase();

    area = area || usuarioDB.area || null;
    servicio = servicio || usuarioDB.servicio || null;
    subservicio = subservicio || usuarioDB.subservicio || null;

    const result = await pool.query(
      `INSERT INTO ric01 (
         usuario,
         solicitado_por,
         tarea,
         fin,
         imagen,
         fecha,
         fecha_comp,
         fecha_fin,
         area,
         servicio,
         subservicio
       ) VALUES (
         $1,$2,$3,$4,$5,$6,NULL,NULL,$7,$8,$9
       )
       RETURNING *`,
      [
        nombre,
        mailDB,
        tarea,
        fin || false,
        imagen || null,
        fechaLocalArgentina(),
        area,
        servicio,
        subservicio
      ]
    );

    await enviarNotificacionTarea(area, tarea);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creando tarea de usuario:", error);
    res.status(500).json({ error: error.message || "Error creando tarea" });
  }
});

// ============================================================
// SKY26 AGENT (montaje temporal para validar integración)
// ============================================================
router.use("/agent", sky26AgentRoutes);

// ============================================================
// NOTIFICACIONES INTERNAS DE MANTENIMIENTO
// ============================================================
// Estas rutas van antes de /:id para que "notificaciones" no
// sea interpretado como un ID de RIC29.
router.get("/notificaciones", listarNotificacionesMantenimiento);
router.put("/notificaciones/:id/leida", marcarNotificacionMantenimientoLeida);
router.put("/notificaciones/leidas/todas", marcarTodasNotificacionesMantenimientoLeidas);

// POST /api/ric29
router.post("/", guardarRIC29);

// GET /api/ric29/:id
router.get("/:id", obtenerDetalleRIC29);

// GET /api/ric29/:id/pdf
router.get("/:id/pdf", generarPDFRIC29);

// POST /api/ric29/:id/drive
router.post("/:id/drive", enviarRIC29Drive);

export default router;
