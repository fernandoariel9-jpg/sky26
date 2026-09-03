import express from "express";

import {
  guardarRIC29,
  obtenerDetalleRIC29,
  generarPDFRIC29,
  enviarRIC29Drive
} from "../controllers/ric29Controller.js";


const router = express.Router();


// POST /api/ric29
router.post("/", guardarRIC29);


// GET /api/ric29/:id
router.get("/:id", obtenerDetalleRIC29);


// GET /api/ric29/:id/pdf
router.get("/:id/pdf", generarPDFRIC29);


// POST /api/ric29/:id/drive
router.post("/:id/drive", enviarRIC29Drive);


export default router;
