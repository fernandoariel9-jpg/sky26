import express from "express";

import {
  obtenerResumenTiempos,
  generarResumenTiempos
} from "../controllers/promediosController.js";

const router = express.Router();

router.get("/", obtenerResumenTiempos);

router.post("/generar", generarResumenTiempos);

export default router;
