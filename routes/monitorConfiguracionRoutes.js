import express from "express";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();
const defaults = {
  estado_equipos: true,
  tareas_mantenimiento: true,
  envejecimiento_parque: true
};
let inicializado = false;
async function asegurarTabla() {
  if (inicializado) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.monitor_indicadores_config (
      clave TEXT PRIMARY KEY,
      activo BOOLEAN NOT NULL,
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    INSERT INTO public.monitor_indicadores_config (clave, activo)
    VALUES ('estado_equipos', TRUE), ('tareas_mantenimiento', TRUE), ('envejecimiento_parque', TRUE)
    ON CONFLICT (clave) DO NOTHING
  `);
  inicializado = true;
}
router.post("/login", (req, res) => {
  const expected = process.env.SUPERVISOR_PASSWORD;
  const provided = req.body?.password;
  if (!expected || !process.env.PERSONAL_JWT_SECRET) return res.status(503).json({ error: "Configurá SUPERVISOR_PASSWORD y PERSONAL_JWT_SECRET en Render." });
  if (typeof provided !== "string" || !provided ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }
  res.set("Cache-Control", "no-store");
  res.json({ token: jwt.sign({ scope: "sky26-supervision" }, process.env.PERSONAL_JWT_SECRET, { expiresIn: "8h" }) });
});
router.get("/sesion", (req, res) => {
  try {
    const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const claims = jwt.verify(token, process.env.PERSONAL_JWT_SECRET);
    if (claims.scope !== "sky26-supervision") throw new Error("scope");
    res.json({ ok: true });
  } catch { res.status(401).json({ error: "Sesión vencida" }); }
});
router.get("/config", async (_req, res) => {
  try {
    await asegurarTabla();
    const resultado = await pool.query("SELECT clave, activo FROM public.monitor_indicadores_config");
    const configuracion = { ...defaults };
    for (const fila of resultado.rows) if (Object.hasOwn(defaults, fila.clave)) configuracion[fila.clave] = fila.activo;
    res.set("Cache-Control", "no-store");
    res.json({ configuracion });
  } catch (error) {
    console.error("Monitor config lectura:", error);
    res.status(500).json({ error: "No se pudo leer la configuración del monitor" });
  }
});
router.put("/config", async (req, res) => {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const claims = jwt.verify(token, process.env.PERSONAL_JWT_SECRET);
    if (claims.scope !== "sky26-supervision") throw new Error("Permiso insuficiente");
  } catch {
    return res.status(401).json({ error: "Sesión de supervisión inválida o vencida. Ingresá nuevamente." });
  }
  const config = req.body?.configuracion;
  if (!config || typeof config !== "object" ||
      Object.keys(config).length !== Object.keys(defaults).length ||
      Object.keys(defaults).some(k => typeof config[k] !== "boolean")) {
    return res.status(400).json({ error: "Configuración inválida" });
  }
  try {
    await asegurarTabla();
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      for (const [clave, activo] of Object.entries(config)) {
        await cliente.query("UPDATE public.monitor_indicadores_config SET activo=$2, actualizado_en=NOW() WHERE clave=$1", [clave, activo]);
      }
      await cliente.query("COMMIT");
    } catch (e) { await cliente.query("ROLLBACK"); throw e; }
    finally { cliente.release(); }
    res.json({ ok: true, configuracion: config });
  } catch (error) {
    console.error("Monitor config escritura:", error);
    res.status(500).json({ error: "No se pudo guardar la configuración" });
  }
});
export default router;
