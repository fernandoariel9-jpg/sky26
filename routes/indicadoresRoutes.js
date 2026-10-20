import express from "express";
import { obtenerIndicadoresPreventivos, obtenerEdadEquipos, obtenerMantenimientosProgramados } from "../controllers/indicadoresController.js";

const router = express.Router();

router.get("/preventivos", obtenerIndicadoresPreventivos);
router.get("/edad-equipos", obtenerEdadEquipos);
router.get("/mantenimientos-programados", obtenerMantenimientosProgramados);

export default router;
