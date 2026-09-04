import express from "express";

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

const router = express.Router();

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
