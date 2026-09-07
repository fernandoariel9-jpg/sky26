import express from "express";

import {
  obtenerResumenTiempos,
  generarResumenTiempos
} from "../controllers/promediosController.js";

const router = express.Router();

// Obtener toda la serie histórica
router.get("/", obtenerResumenTiempos);

// Generar/recalcular un día
router.post("/generar", generarResumenTiempos);

export default router;
