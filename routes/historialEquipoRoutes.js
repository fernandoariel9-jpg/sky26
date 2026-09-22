import express from "express";
import {
  obtenerHistorialEquipo,
  obtenerDetalleRIC37
} from "../controllers/historialEquipoController.js";
import { obtenerEquipoPublico } from "../controllers/equipoPublicoController.js";

const router = express.Router();

router.get("/publico/:numero_serie", obtenerEquipoPublico);
router.get("/:numero_serie/historial", obtenerHistorialEquipo);
router.get("/ric37/:id", obtenerDetalleRIC37);

export default router;
