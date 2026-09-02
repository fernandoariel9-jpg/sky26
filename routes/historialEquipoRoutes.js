import express from "express";
import {
  obtenerHistorialEquipo,
  obtenerDetalleRIC37
} from "../controllers/historialEquipoController.js";

const router = express.Router();

router.get("/:numero_serie/historial", obtenerHistorialEquipo);
router.get("/ric37/:id", obtenerDetalleRIC37);

export default router;
