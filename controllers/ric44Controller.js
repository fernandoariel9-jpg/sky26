import pool from "../db.js";

export async function guardarRIC44(req, res) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      ric01_id,
      equipo_id,
      numero_serie,
      descripcion,
      marca_modelo,
      area,
      servicio,
      sub_servicio,
      encargado,
      tecnico,
      criterio,
      ampliar_seleccion,
      disposicion_final,
      imagen,
      observaciones,
      correctivos,
      preventivos,
      dias_fuera_servicio,
      equipos_similares
    } = req.body;

    if (!numero_serie) {
      return res.status(400).json({
        ok: false,
        error: "El número de serie es obligatorio"
      });
    }

    if (!criterio) {
      return res.status(400).json({
        ok: false,
        error: "El criterio de obsolescencia es obligatorio"
      });
    }

    const result = await client.query(
      `
      INSERT INTO ric44 (
        ric01_id,
        equipo_id,
        numero_serie,
        descripcion,
        marca_modelo,
        area,
        servicio,
        sub_servicio,
        encargado,
        tecnico,
        criterio,
        ampliar_seleccion,
        disposicion_final,
        imagen,
        observaciones,
        correctivos,
        preventivos,
        dias_fuera_servicio,
        equipos_similares
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING id, fecha_registro
      `,
      [
        ric01_id || null,
        equipo_id || null,
        numero_serie,
        descripcion || null,
        marca_modelo || null,
        area || null,
        servicio || null,
        sub_servicio || null,
        encargado || null,
        tecnico || null,
        criterio,
        ampliar_seleccion || null,
        disposicion_final || null,
        imagen || null,
        observaciones || null,
        Number.isFinite(Number(correctivos)) ? Number(correctivos) : 0,
        Number.isFinite(Number(preventivos)) ? Number(preventivos) : 0,
        Number.isFinite(Number(dias_fuera_servicio))
          ? Number(dias_fuera_servicio)
          : 0,
        Number.isFinite(Number(equipos_similares))
          ? Number(equipos_similares)
          : 0
      ]
    );

    const ric44_id = result.rows[0].id;

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      ric44_id,
      fecha_registro: result.rows[0].fecha_registro
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Error guardando RIC44:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  } finally {
    client.release();
  }
}

export async function obtenerRIC44(req, res) {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM ric44
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "RIC44 no encontrado"
      });
    }

    res.json({
      ok: true,
      ric44: result.rows[0]
    });
  } catch (error) {
    console.error("Error obteniendo RIC44:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

export async function listarRIC44(req, res) {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM ric44
      ORDER BY fecha_registro DESC, id DESC
      `
    );

    res.json({
      ok: true,
      total: result.rows.length,
      ric44: result.rows
    });
  } catch (error) {
    console.error("Error listando RIC44:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

export async function obtenerEstadisticasRIC44(req, res) {
  try {
    const { numero_serie } = req.params;

    if (!numero_serie) {
      return res.status(400).json({
        ok: false,
        error: "Número de serie obligatorio"
      });
    }

    const equipoResult = await pool.query(
      `
      SELECT
        id,
        descripcion,
        servicio,
        sub_servicio
      FROM equipos
      WHERE numero_serie = $1
      LIMIT 1
      `,
      [numero_serie]
    );

    if (equipoResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Equipo no encontrado"
      });
    }

    const equipo = equipoResult.rows[0];

    const estadisticasResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(tipo_mantenimiento, '')) = 'correctivo'
        )::integer AS correctivos,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(tipo_mantenimiento, '')) = 'preventivo'
        )::integer AS preventivos,
        COALESCE(SUM(
          CASE
            WHEN fecha IS NOT NULL
             AND fecha_fin IS NOT NULL
             AND fecha_fin >= fecha
            THEN EXTRACT(EPOCH FROM (fecha_fin - fecha)) / 86400
            ELSE 0
          END
        ), 0)::integer AS dias_fuera_servicio
      FROM ric01
      WHERE numero_serie = $1
      `,
      [numero_serie]
    );

    const similaresResult = await pool.query(
      `
      SELECT COUNT(*)::integer AS equipos_similares
      FROM equipos
      WHERE LOWER(TRIM(COALESCE(descripcion, ''))) =
            LOWER(TRIM(COALESCE($1, '')))
        AND LOWER(TRIM(COALESCE(servicio, ''))) =
            LOWER(TRIM(COALESCE($2, '')))
        AND LOWER(TRIM(COALESCE(sub_servicio, ''))) =
            LOWER(TRIM(COALESCE($3, '')))
        AND numero_serie <> $4
      `,
      [
        equipo.descripcion,
        equipo.servicio,
        equipo.sub_servicio,
        numero_serie
      ]
    );

    res.json({
      ok: true,
      numero_serie,
      estadisticas: {
        correctivos: estadisticasResult.rows[0].correctivos,
        preventivos: estadisticasResult.rows[0].preventivos,
        dias_fuera_servicio: estadisticasResult.rows[0].dias_fuera_servicio,
        equipos_similares: similaresResult.rows[0].equipos_similares
      }
    });
  } catch (error) {
    console.error("Error obteniendo estadísticas RIC44:", error);

    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
