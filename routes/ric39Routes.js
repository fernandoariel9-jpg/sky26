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

import {
  guardarRIC56,
  obtenerDetalleRIC56,
  generarPDFRIC56,
  enviarRIC56Drive
} from "../controllers/ric56Controller.js";

import {
  guardarRIC64,
  obtenerDetalleRIC64,
  generarPDFRIC64,
  enviarRIC64Drive
} from "../controllers/ric64Controller.js";

const router = express.Router();

// Protocolos específicos se montan antes de /:id para evitar colisiones.
router.post("/ric48", guardarRIC48);
router.get("/ric48/:id", obtenerDetalleRIC48);
router.get("/ric48/:id/pdf", generarPDFRIC48);
router.post("/ric48/:id/drive", enviarRIC48Drive);

router.post("/ric56", guardarRIC56);
router.get("/ric56/:id", obtenerDetalleRIC56);
router.get("/ric56/:id/pdf", generarPDFRIC56);
router.post("/ric56/:id/drive", enviarRIC56Drive);

router.post("/ric64", guardarRIC64);
router.get("/ric64/:id", obtenerDetalleRIC64);
router.get("/ric64/:id/pdf", generarPDFRIC64);
router.post("/ric64/:id/drive", enviarRIC64Drive);

router.post("/", guardarRIC39);
router.get("/:id", obtenerDetalleRIC39);
router.get("/:id/pdf", generarPDFRIC39);
router.post("/:id/drive", enviarRIC39Drive);

export default router;
