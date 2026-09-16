import express from "express";

import {
  listarStockItems,
  crearStockItem,
  listarExistencias
} from "../controllers/stockController.js";

const router = express.Router();

// Catálogo
router.get("/items", listarStockItems);
router.post("/items", crearStockItem);

// Existencias
router.get("/existencias", listarExistencias);

export default router;
