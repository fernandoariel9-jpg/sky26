// -----------------------------------------------------
// sky26AgentController.js
// Último snapshot recibido desde agentes locales Sky26
// -----------------------------------------------------

import pool from "../db.js";

const MAX_ANTIGUEDAD_MS = 15000;

function obtenerToken(req) {
  return req.headers["x-agent-token"] || "";
}

function validarToken(req, res) {
  const tokenEsperado = process.env.SKY26_AGENT_TOKEN;

  if (!tokenEsperado) {
    res.status(503).json({
      ok: false,
      error: "SKY26_AGENT_TOKEN no está configurado en el backend"
    });
    return false;
  }

  if (obtenerToken(req) !== tokenEsperado) {
    res.status(401).json({
      ok: false,
      error: "Token de agente inválido"
    });
    return false;
  }

  return true;
}

function calcularEstado(recibidoEn) {
  if (!recibidoEn) {
    return {
      conectado: false,
      antiguedadMs: null
    };
  }

  const antiguedadMs = Math.max(
    0,
    Date.now() - new Date(recibidoEn).getTime()
  );

  return {
    conectado: antiguedadMs <= MAX_ANTIGUEDAD_MS,
    antiguedadMs
  };
}

export async function publicarSnapshot(req, res) {
  if (!validarToken(req, res)) return;

  const {
    agente = "ingenieria-clinica",
    instrumento = "citrex-h5",
    datos
  } = req.body || {};

  if (!Array.isArray(datos)) {
    return res.status(400).json({
      ok: false,
      error: "datos debe ser un arreglo de mediciones"
    });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO agent_snapshots
        (agente, instrumento, datos, recibido_en)
      VALUES
        ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (agente, instrumento)
      DO UPDATE SET
        datos = EXCLUDED.datos,
        recibido_en = CURRENT_TIMESTAMP
      RETURNING agente, instrumento, recibido_en;
      `,
      [agente, instrumento, JSON.stringify(datos)]
    );

    const row = result.rows[0];

    return res.json({
      ok: true,
      agente: row.agente,
      instrumento: row.instrumento,
      recibidoEn: row.recibido_en,
      mediciones: datos.length
    });
  } catch (error) {
    console.error("Error guardando snapshot de agente:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo guardar el snapshot del agente"
    });
  }
}

export async function obtenerUltimoSnapshot(req, res) {
  const agente = req.query.agente || "ingenieria-clinica";
  const instrumento = req.query.instrumento || "citrex-h5";

  try {
    const result = await pool.query(
      `
      SELECT
        agente,
        instrumento,
        datos,
        recibido_en
      FROM agent_snapshots
      WHERE agente = $1
        AND instrumento = $2
      LIMIT 1;
      `,
      [agente, instrumento]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Todavía no hay mediciones publicadas por el agente"
      });
    }

    const row = result.rows[0];
    const estado = calcularEstado(row.recibido_en);

    return res.json({
      ok: true,
      agente: row.agente,
      instrumento: row.instrumento,
      recibidoEn: row.recibido_en,
      conectado: estado.conectado,
      antiguedadMs: estado.antiguedadMs,
      datos: row.datos
    });
  } catch (error) {
    console.error("Error obteniendo snapshot de agente:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo obtener el snapshot del agente"
    });
  }
}

export async function estadoAgent(req, res) {
  const agente = req.query.agente || "ingenieria-clinica";
  const instrumento = req.query.instrumento || "citrex-h5";

  try {
    const result = await pool.query(
      `
      SELECT recibido_en
      FROM agent_snapshots
      WHERE agente = $1
        AND instrumento = $2
      LIMIT 1;
      `,
      [agente, instrumento]
    );

    const row = result.rows[0];
    const estado = calcularEstado(row?.recibido_en);

    return res.json({
      ok: true,
      conectado: estado.conectado,
      agente,
      instrumento,
      ultimaLectura: row?.recibido_en || null,
      antiguedadMs: estado.antiguedadMs
    });
  } catch (error) {
    console.error("Error consultando estado del agente:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo consultar el estado del agente"
    });
  }
}
