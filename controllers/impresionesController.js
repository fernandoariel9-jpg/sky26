import pool from "../db.js";

function validarTokenServidor(req, res) {
  const esperado = String(process.env.PRINT_SERVER_TOKEN || "").trim();
  const recibido = String(req.headers["x-print-token"] || "").trim();

  if (!esperado) {
    res.status(500).json({
      ok: false,
      error: "PRINT_SERVER_TOKEN no está configurado en el backend"
    });
    return false;
  }

  if (!recibido || recibido !== esperado) {
    res.status(401).json({ ok: false, error: "Token de servidor de impresión inválido" });
    return false;
  }

  return true;
}

export async function crearImpresion(req, res) {
  try {
    const {
      tipo = "pdf",
      impresora = "laser",
      documento_url,
      datos = null,
      copias = 1,
      solicitado_por = null
    } = req.body || {};

    if (!documento_url && !datos) {
      return res.status(400).json({
        ok: false,
        error: "Debe indicar documento_url o datos"
      });
    }

    const copiasNumero = Number(copias);
    if (!Number.isInteger(copiasNumero) || copiasNumero < 1 || copiasNumero > 20) {
      return res.status(400).json({ ok: false, error: "Cantidad de copias inválida" });
    }

    const result = await pool.query(
      `
      INSERT INTO impresiones
        (tipo, impresora, documento_url, datos, copias, estado, solicitado_por)
      VALUES
        ($1, $2, $3, $4, $5, 'pendiente', $6)
      RETURNING *
      `,
      [
        String(tipo).trim().toLowerCase(),
        String(impresora).trim().toLowerCase(),
        documento_url || null,
        datos || null,
        copiasNumero,
        solicitado_por || null
      ]
    );

    return res.status(201).json({ ok: true, impresion: result.rows[0] });
  } catch (error) {
    console.error("Error creando impresión:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function listarImpresiones(req, res) {
  try {
    const limite = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const result = await pool.query(
      `
      SELECT *
      FROM impresiones
      ORDER BY id DESC
      LIMIT $1
      `,
      [limite]
    );

    return res.json({ ok: true, impresiones: result.rows });
  } catch (error) {
    console.error("Error listando impresiones:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function tomarSiguienteImpresion(req, res) {
  if (!validarTokenServidor(req, res)) return;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const siguiente = await client.query(
      `
      SELECT *
      FROM impresiones
      WHERE estado = 'pendiente'
      ORDER BY id ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `
    );

    if (siguiente.rowCount === 0) {
      await client.query("COMMIT");
      return res.status(204).send();
    }

    const id = siguiente.rows[0].id;

    const actualizado = await client.query(
      `
      UPDATE impresiones
      SET estado = 'imprimiendo',
          fecha_inicio = CURRENT_TIMESTAMP,
          error = NULL
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, impresion: actualizado.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error tomando impresión:", error);
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function finalizarImpresion(req, res) {
  if (!validarTokenServidor(req, res)) return;

  try {
    const id = Number(req.params.id);
    const { ok, error = null } = req.body || {};

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ ok: false, error: "ID inválido" });
    }

    const estado = ok === true ? "impreso" : "error";

    const result = await pool.query(
      `
      UPDATE impresiones
      SET estado = $1,
          fecha_impresion = CASE WHEN $1 = 'impreso' THEN CURRENT_TIMESTAMP ELSE fecha_impresion END,
          error = $2
      WHERE id = $3
      RETURNING *
      `,
      [estado, error ? String(error).slice(0, 4000) : null, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Impresión no encontrada" });
    }

    return res.json({ ok: true, impresion: result.rows[0] });
  } catch (error) {
    console.error("Error finalizando impresión:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}

export async function heartbeatImpresora(req, res) {
  if (!validarTokenServidor(req, res)) return;

  try {
    const { equipo = "pc-impresiones", version = null } = req.body || {};

    const result = await pool.query(
      `
      INSERT INTO servidores_impresion (equipo, version, ultima_conexion)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (equipo)
      DO UPDATE SET
        version = EXCLUDED.version,
        ultima_conexion = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [String(equipo).trim(), version || null]
    );

    return res.json({ ok: true, servidor: result.rows[0] });
  } catch (error) {
    console.error("Error heartbeat impresión:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
