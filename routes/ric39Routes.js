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
  guardarRIC59,
  obtenerDetalleRIC59,
  generarPDFRIC59,
  enviarRIC59Drive
} from "../controllers/ric59Controller.js";

import {
  guardarRIC64,
  obtenerDetalleRIC64,
  generarPDFRIC64,
  enviarRIC64Drive
} from "../controllers/ric64Controller.js";

import {
  guardarRIC10,
  obtenerDetalleRIC10,
  generarPDFRIC10,
  enviarRIC10Drive
} from "../controllers/ric10Controller.js";

import {
  guardarRIC71,
  obtenerDetalleRIC71,
  generarPDFRIC71,
  enviarRIC71Drive
} from "../controllers/ric71Controller.js";

import {
  iniciarMonitorReincidencias,
  listarAlertasReincidencia
} from "../controllers/reincidenciasController.js";

const router = express.Router();

// El monitor se inicializa una sola vez al cargar el backend.
// Detecta cualquier RIC01 que pase a Correctivo, sin depender del flujo frontend.
iniciarMonitorReincidencias().catch((error) => {
  console.error("Error iniciando monitor de reincidencias:", error);
});

// Historial persistente de alertas por área.
// Debe ir antes de /:id para evitar que "reincidencias" se interprete como ID RIC39.
router.get("/reincidencias", listarAlertasReincidencia);

// Protocolos específicos se montan antes de /:id para evitar colisiones.
router.post("/ric10", guardarRIC10);
router.get("/ric10/:id", obtenerDetalleRIC10);
router.get("/ric10/:id/pdf", generarPDFRIC10);
router.post("/ric10/:id/drive", enviarRIC10Drive);

router.post("/ric48", guardarRIC48);
router.get("/ric48/:id", obtenerDetalleRIC48);
router.get("/ric48/:id/pdf", generarPDFRIC48);
router.post("/ric48/:id/drive", enviarRIC48Drive);

router.post("/ric56", guardarRIC56);
router.get("/ric56/:id", obtenerDetalleRIC56);
router.get("/ric56/:id/pdf", generarPDFRIC56);
router.post("/ric56/:id/drive", enviarRIC56Drive);

router.post("/ric59", guardarRIC59);
router.get("/ric59/:id", obtenerDetalleRIC59);
router.get("/ric59/:id/pdf", generarPDFRIC59);
router.post("/ric59/:id/drive", enviarRIC59Drive);

router.post("/ric64", guardarRIC64);
router.get("/ric64/:id", obtenerDetalleRIC64);
router.get("/ric64/:id/pdf", generarPDFRIC64);
router.post("/ric64/:id/drive", enviarRIC64Drive);

router.post("/ric71", guardarRIC71);
router.get("/ric71/:id", obtenerDetalleRIC71);
router.get("/ric71/:id/pdf", generarPDFRIC71);
router.post("/ric71/:id/drive", enviarRIC71Drive);

router.post("/", guardarRIC39);
router.get("/:id", obtenerDetalleRIC39);
router.get("/:id/pdf", generarPDFRIC39);
router.post("/:id/drive", enviarRIC39Drive);

export default router;
