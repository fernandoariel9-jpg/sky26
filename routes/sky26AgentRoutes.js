import express from "express";

import {
  publicarSnapshot,
  obtenerUltimoSnapshot,
  estadoAgent
} from "../controllers/sky26AgentController.js";

const router = express.Router();

router.post("/snapshot", publicarSnapshot);
router.get("/snapshot", obtenerUltimoSnapshot);
router.get("/estado", estadoAgent);

export default router;
