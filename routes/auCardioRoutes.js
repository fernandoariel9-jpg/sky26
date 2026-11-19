import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { guardarAptitudCardio, eliminarAptitudCardio } from "../controllers/auCardioController.js";

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
    if (!token || !process.env.PERSONAL_JWT_SECRET) {
      return res.status(401).json({ ok: false, error: "Autenticación del personal requerida." });
    }
    const decoded = jwt.verify(token, process.env.PERSONAL_JWT_SECRET);
    const result = await pool.query("SELECT id, nombre FROM public.personal WHERE id = $1", [decoded.personal_id]);
    if (!result.rowCount) return res.status(401).json({ ok: false, error: "Personal no encontrado." });
    req.personal = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "Sesión de personal inválida o vencida." });
  }
});

router.post("/", guardarAptitudCardio);
router.delete("/:id", eliminarAptitudCardio);

export default router;
