import express from "express";
import {
  listarNotificacionesMantenimiento,
  marcarNotificacionMantenimientoLeida,
  marcarTodasNotificacionesMantenimientoLeidas
} from "../controllers/notificacionesMantenimientoController.js";

const router = express.Router();

router.get("/", listarNotificacionesMantenimiento);
router.put("/:id/leida", marcarNotificacionMantenimientoLeida);
router.put("/leidas/todas", marcarTodasNotificacionesMantenimientoLeidas);

export default router;
