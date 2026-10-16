import express from "express";
import { obtenerIndicadoresPreventivos, obtenerEdadEquipos } from "../controllers/indicadoresController.js";

const router = express.Router();

router.get("/preventivos", obtenerIndicadoresPreventivos);
router.get("/edad-equipos", obtenerEdadEquipos);

export default router;
