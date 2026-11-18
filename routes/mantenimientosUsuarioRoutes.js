import express from "express";
import pool from "../db.js";

const router = express.Router();

// ============================================================
// MANTENIMIENTO DE USUARIO (CHECKLIST QR)
// ============================================================
router.post("/mantenimientos-usuario", async (req, res) => {
  try {
    const {
      equipo_id,
      numero_serie,
      limpieza_ok,
      integridad_ok,
      verificacion_funcional_ok,
      capacitacion_personal_ok,
      observaciones,
      usuario_nombre,
      usuario_mail
    } = req.body || {};

    const resultados = [
      limpieza_ok,
      integridad_ok,
      verificacion_funcional_ok,
      capacitacion_personal_ok
    ];

    if (resultados.some(valor => typeof valor !== "boolean")) {
      return res.status(400).json({
        error: "Debe indicar Conforme o No conforme en todos los puntos del checklist."
      });
    }

    const hayNoConformidad = resultados.some(valor => valor === false);
    const observacionesLimpias = String(observaciones || "").trim();

    if (hayNoConformidad && !observacionesLimpias) {
      return res.status(400).json({
        error: "Debe ingresar observaciones cuando algún punto no está conforme."
      });
    }

    let equipoResult;

    if (equipo_id !== null && equipo_id !== undefined && String(equipo_id).trim() !== "") {
      equipoResult = await pool.query(
        `SELECT id, numero_serie
         FROM equipos
         WHERE id = $1
         LIMIT 1`,
        [equipo_id]
      );
    } else if (String(numero_serie || "").trim()) {
      equipoResult = await pool.query(
        `SELECT id, numero_serie
         FROM equipos
         WHERE LOWER(TRIM(numero_serie)) = LOWER(TRIM($1))
         LIMIT 1`,
        [String(numero_serie).trim()]
      );
    } else {
      return res.status(400).json({
        error: "El QR no contiene un número de serie o ID de equipo válido."
      });
    }

    if (!equipoResult.rows.length) {
      return res.status(404).json({ error: "No se encontró el equipo en la base de datos." });
    }

    const equipo = equipoResult.rows[0];

    const result = await pool.query(
      `INSERT INTO public.mantenimientos_usuario (
         equipo_id,
         numero_serie,
         limpieza_ok,
         integridad_ok,
         verificacion_funcional_ok,
         capacitacion_personal_ok,
         observaciones,
         usuario_nombre,
         usuario_mail
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, equipo_id, numero_serie, fecha,
                 limpieza_ok, integridad_ok,
                 verificacion_funcional_ok, capacitacion_personal_ok,
                 observaciones, usuario_nombre, usuario_mail, tarea_id`,
      [
        equipo.id,
        equipo.numero_serie,
        limpieza_ok,
        integridad_ok,
        verificacion_funcional_ok,
        capacitacion_personal_ok,
        observacionesLimpias || null,
        String(usuario_nombre || "").trim() || null,
        String(usuario_mail || "").trim() || null
      ]
    );

    return res.status(201).json({
      ok: true,
      mensaje: "Mantenimiento de usuario guardado correctamente.",
      mantenimiento: result.rows[0]
    });
  } catch (error) {
    console.error("Error guardando mantenimiento de usuario:", error);
    return res.status(500).json({
      error: "No se pudo guardar el mantenimiento de usuario."
    });
  }
});


export default router;
