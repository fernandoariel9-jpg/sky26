import express from "express";

import {
  listarStockCategorias,
  listarStockItems,
  crearStockItem,
  eliminarStockItem,
  listarExistencias,
  registrarEntradaStock,
  registrarSalidaStock,
  listarMovimientosStock
} from "../controllers/stockController.js";

import {
  listarTransferenciasStock,
  solicitarTransferenciaStock,
  resolverTransferenciaStock
} from "../controllers/stockTransferenciasController.js";

const router = express.Router();

// Categorías
router.get("/categorias", listarStockCategorias);

// Catálogo
router.get("/items", listarStockItems);
router.post("/items", crearStockItem);
router.delete("/items/:id", eliminarStockItem);

// Existencias
router.get("/existencias", listarExistencias);
router.post("/entradas", registrarEntradaStock);
router.post("/salidas", registrarSalidaStock);

// Movimientos
router.get("/movimientos", listarMovimientosStock);

// Transferencias
router.get("/transferencias", listarTransferenciasStock);
router.post("/transferencias", solicitarTransferenciaStock);
router.put("/transferencias/:id/resolver", resolverTransferenciaStock);

export default router;
