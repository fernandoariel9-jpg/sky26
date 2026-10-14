import express from "express";
import { obtenerIndicadoresPreventivos } from "../controllers/indicadoresController.js";

const router = express.Router();

router.get("/preventivos", obtenerIndicadoresPreventivos);

export default router;
