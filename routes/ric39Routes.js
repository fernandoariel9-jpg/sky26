import express from "express";

import {
  guardarRIC39,
  obtenerDetalleRIC39,
  generarPDFRIC39,
  enviarRIC39Drive
} from "../controllers/ric39Controller.js";

import {
  guardarRIC48,
  obtenerDetalleRIC48,
  generarPDFRIC48,
  enviarRIC48Drive
} from "../controllers/ric48Controller.js";

const router = express.Router();

// RIC48 se monta antes de /:id para evitar colisiones con el detalle RIC39.
router.post("/ric48", guardarRIC48);
router.get("/ric48/:id", obtenerDetalleRIC48);
router.get("/ric48/:id/pdf", generarPDFRIC48);
router.post("/ric48/:id/drive", enviarRIC48Drive);

router.post("/", guardarRIC39);
router.get("/:id", obtenerDetalleRIC39);
router.get("/:id/pdf", generarPDFRIC39);
router.post("/:id/drive", enviarRIC39Drive);

export default router;
