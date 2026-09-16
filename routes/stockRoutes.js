import express from "express";

import {
  listarStockItems,
  crearStockItem,
  listarExistencias,
  registrarEntradaStock,
  registrarSalidaStock,
  listarMovimientosStock
} from "../controllers/stockController.js";

const router = express.Router();

// Catálogo
router.get("/items", listarStockItems);
router.post("/items", crearStockItem);

// Existencias
router.get("/existencias", listarExistencias);
router.post("/entradas", registrarEntradaStock);
router.post("/salidas", registrarSalidaStock);

// Movimientos
router.get("/movimientos", listarMovimientosStock);

export default router;
