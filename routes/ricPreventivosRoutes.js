import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();
const CODIGOS = new Set(["RIC10", "RIC29", "RIC39", "RIC48", "RIC56", "RIC59", "RIC64", "RIC71"]);
const ESTADOS = new Set(["EN_PROCESO", "PENDIENTE_CORRECTIVO", "LISTO_PARA_FINALIZAR", "FINALIZADO"]);
const idValido = (id) => /^[1-9]\d*$/.test(String(id || ""));

// Se exige el JWT del personal y se valida contra la tabla personal.
router.use(async (req, res, next) => {
  try {
    const token = /^Bearer (.+)$/i.exec(req.headers.authorization || "")?.[1];
    if (!token || !process.env.PERSONAL_JWT_SECRET) {
      return res.status(401).json({ error: "Autenticación del personal requerida" });
    }
    const decoded = jwt.verify(token, process.env.PERSONAL_JWT_SECRET);
    const personal = await pool.query("SELECT id FROM personal WHERE id = $1", [decoded.personal_id]);
    if (!personal.rowCount) return res.status(401).json({ error: "Personal no encontrado" });
    next();
  } catch (error) {
    res.status(401).json({ error: "Sesión de personal inválida o vencida" });
  }
});

router.get("/avances/:ric01Id", async (req, res) => {
  if (!idValido(req.params.ric01Id)) return res.status(400).json({ error: "ID inválido" });
  try {
    const resultado = await pool.query(
      "SELECT ric01_id, codigo_ric, datos, estado, actualizado_en FROM public.ric_preventivo_avances WHERE ric01_id = $1",
      [req.params.ric01Id]
    );
    if (!resultado.rowCount) return res.status(404).json({ error: "No existe avance guardado" });
    res.json({ ok: true, avance: resultado.rows[0] });
  } catch (error) {
    console.error("Error obteniendo avance RIC:", error);
    res.status(500).json({ error: "No se pudo obtener el avance" });
  }
});

router.put("/avances/:ric01Id", async (req, res) => {
  const { codigo_ric, datos, estado = "EN_PROCESO" } = req.body || {};
  if (!idValido(req.params.ric01Id) || !CODIGOS.has(codigo_ric) ||
      !ESTADOS.has(estado) || !datos || Array.isArray(datos) ||
      typeof datos !== "object") {
    return res.status(400).json({ error: "Avance inválido" });
  }
  if (estado === "FINALIZADO") {
    return res.status(400).json({ error: "El cierre se realiza mediante la finalización del mantenimiento" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tarea = await client.query(
      "SELECT id, tipo_mantenimiento, fin FROM public.ric01 WHERE id = $1 FOR UPDATE",
      [req.params.ric01Id]
    );
    if (!tarea.rowCount || String(tarea.rows[0].tipo_mantenimiento || "").toLowerCase() !== "preventivo") {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Preventivo no encontrado" });
    }
    if (tarea.rows[0].fin) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El preventivo ya está finalizado" });
    }
    const result = await client.query(
      `INSERT INTO public.ric_preventivo_avances
       (ric01_id, codigo_ric, datos, estado, actualizado_en)
       VALUES ($1, $2, $3::jsonb, $4, NOW())
       ON CONFLICT (ric01_id) DO UPDATE SET
         datos = EXCLUDED.datos,
         estado = EXCLUDED.estado,
         actualizado_en = NOW()
       WHERE ric_preventivo_avances.codigo_ric = EXCLUDED.codigo_ric
       RETURNING ric01_id, codigo_ric, estado, actualizado_en`,
      [req.params.ric01Id, codigo_ric, JSON.stringify(datos), estado]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El preventivo está asociado a otro código RIC" });
    }
    await client.query("COMMIT");
    res.json({ ok: true, avance: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando avance RIC:", error);
    res.status(500).json({ error: "No se pudo guardar el avance" });
  } finally {
    client.release();
  }
});

router.get("/vinculos/:preventivoId", async (req, res) => {
  if (!idValido(req.params.preventivoId)) return res.status(400).json({ error: "ID inválido" });
  try {
    const result = await pool.query(
      `SELECT v.id, v.preventivo_ric01_id, v.correctivo_ric01_id, v.codigo_ric,
        v.no_conformidades, v.creado_en, c.fin AS correctivo_finalizado,
        c.solucion AS solucion_correctivo
       FROM public.ric_correctivos_vinculados v
       JOIN public.ric01 c ON c.id = v.correctivo_ric01_id
       WHERE v.preventivo_ric01_id = $1 ORDER BY v.creado_en DESC`,
      [req.params.preventivoId]
    );
    res.json({ ok: true, vinculos: result.rows });
  } catch (error) {
    console.error("Error consultando correctivos derivados:", error);
    res.status(500).json({ error: "No se pudieron consultar los correctivos" });
  }
});

router.post("/vinculos", async (req, res) => {
  const { preventivo_ric01_id, correctivo_ric01_id, codigo_ric, no_conformidades } = req.body || {};
  if (!idValido(preventivo_ric01_id) || !idValido(correctivo_ric01_id) ||
      String(preventivo_ric01_id) === String(correctivo_ric01_id) ||
      !CODIGOS.has(codigo_ric) || !Array.isArray(no_conformidades)) {
    return res.status(400).json({ error: "Datos de vinculación inválidos" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tareas = await client.query(
      "SELECT id, tipo_mantenimiento, fin, numero_serie FROM public.ric01 WHERE id IN ($1, $2) FOR UPDATE",
      [preventivo_ric01_id, correctivo_ric01_id]
    );
    const p = tareas.rows.find((x) => String(x.id) === String(preventivo_ric01_id));
    const c = tareas.rows.find((x) => String(x.id) === String(correctivo_ric01_id));
    if (!p || !c || p.fin ||
        String(p.tipo_mantenimiento).toLowerCase() !== "preventivo" ||
        String(c.tipo_mantenimiento).toLowerCase() !== "correctivo" ||
        !p.numero_serie || p.numero_serie !== c.numero_serie) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El correctivo y el preventivo deben existir, corresponder al mismo equipo y el preventivo debe estar abierto" });
    }
    const result = await client.query(
      `INSERT INTO public.ric_correctivos_vinculados
        (preventivo_ric01_id, correctivo_ric01_id, codigo_ric, no_conformidades)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (correctivo_ric01_id) DO NOTHING RETURNING id`,
      [preventivo_ric01_id, correctivo_ric01_id, codigo_ric, JSON.stringify(no_conformidades)]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "El correctivo ya tiene un preventivo vinculado" });
    }
    await client.query("COMMIT");
    res.status(201).json({ ok: true, vinculo_id: result.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error vinculando correctivo:", error);
    res.status(500).json({ error: "No se pudo vincular el correctivo" });
  } finally {
    client.release();
  }
});

export default router;
