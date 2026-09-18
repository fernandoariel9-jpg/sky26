import express from "express";

import {
  guardarRIC39,
  obtenerDetalleRIC39,
  generarPDFRIC39,
  enviarRIC39Drive
} from "../controllers/ric39Controller.js";

const router = express.Router();

router.post("/", guardarRIC39);
router.get("/:id", obtenerDetalleRIC39);
router.get("/:id/pdf", generarPDFRIC39);
router.post("/:id/drive", enviarRIC39Drive);

export default router;
