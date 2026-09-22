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

import {
  crearImpresion,
  listarImpresiones,
  tomarSiguienteImpresion,
  finalizarImpresion,
  heartbeatImpresora
} from "../controllers/impresionesController.js";

import {
  ajustarExistenciaStock
} from "../controllers/stockAjustesController.js";

import {
  normalizarRespuestaStockEntera,
  validarCamposStockEnteros
} from "../middleware/stockEnterosMiddleware.js";

const router = express.Router();

router.use(normalizarRespuestaStockEntera);

// Categorías
router.get("/categorias", listarStockCategorias);

// Catálogo
router.get("/items", listarStockItems);
router.post("/items", validarCamposStockEnteros(["stock_minimo"]), crearStockItem);
router.delete("/items/:id", eliminarStockItem);

// Existencias
router.get("/existencias", listarExistencias);
router.post("/entradas", validarCamposStockEnteros(["cantidad"]), registrarEntradaStock);
router.post("/salidas", validarCamposStockEnteros(["cantidad"]), registrarSalidaStock);
router.put("/existencias/ajustar", validarCamposStockEnteros(["nueva_cantidad"]), ajustarExistenciaStock);

// Movimientos
router.get("/movimientos", listarMovimientosStock);

// Transferencias
router.get("/transferencias", listarTransferenciasStock);
router.post("/transferencias", validarCamposStockEnteros(["cantidad"]), solicitarTransferenciaStock);
router.put("/transferencias/:id/resolver", resolverTransferenciaStock);

// Cola de impresiones
router.post("/impresiones", crearImpresion);
router.get("/impresiones", listarImpresiones);
router.get("/impresiones/siguiente", tomarSiguienteImpresion);
router.put("/impresiones/:id/finalizar", finalizarImpresion);
router.post("/impresiones/heartbeat", heartbeatImpresora);

export default router;
