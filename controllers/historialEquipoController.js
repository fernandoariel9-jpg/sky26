import pool from "../db.js";

/**
 * Historial de mantenimientos de un equipo.
 *
 * La relación con RIC37 se realiza exclusivamente mediante ric01_id.
 */
export async function obtenerHistorialEquipo(req, res) {
  const { numero_serie } = req.params;

  try {
    if (!numero_serie) {
      return res.status(400).json({
        error: "Número de serie requerido"
      });
    }

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.fecha,
        r.fecha_comp,
        r.fecha_fin,
        r.fin,
        r.usuario,
        r.solicitado_por,
        r.asignado,
        r.tipo_mantenimiento,
        r.diagnostico,
        r.solucion,
        r.observacion,
        r.calificacion,
        (
          SELECT json_build_object(
            'id', x.id,
            'ric01_id', x.ric01_id,
            'equipo_id', x.equipo_id,
            'numero_serie', x.numero_serie,
            'marca_modelo', x.marca_modelo,
            'area', x.area,
            'servicio', x.servicio,
            'sub_servicio', x.sub_servicio,
            'encargado', x.encargado,
            'fecha', x.fecha,
            'tecnico', x.tecnico,
            'clase', x.clase,
            'tipo_proteccion', x.tipo_proteccion,
            'medicion_tension', x.medicion_tension,
            'medicion_corriente', x.medicion_corriente,
            'resultado_general', x.resultado_general,
            'observaciones', x.observaciones
          )
          FROM ric37 x
          WHERE x.ric01_id = r.id
          ORDER BY x.id DESC
          LIMIT 1
        ) AS ric37
      FROM ric01 r
      WHERE r.numero_serie = $1
      ORDER BY r.fecha DESC
      `,
      [numero_serie]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("Error obteniendo historial del equipo:", error);
    return res.status(500).json({
      error: "Error obteniendo historial del equipo"
    });
  }
}

/**
 * Obtiene el detalle completo de un RIC37, incluyendo sus determinaciones.
 */
export async function obtenerDetalleRIC37(req, res) {
  const { id } = req.params;
  const idNumerico = Number(id);

  try {
    if (!Number.isInteger(idNumerico)) {
      return res.status(400).json({
        ok: false,
        error: "ID RIC37 inválido"
      });
    }

    const cabecera = await pool.query(
      `
      SELECT *
      FROM ric37
      WHERE id = $1
      LIMIT 1
      `,
      [idNumerico]
    );

    if (cabecera.rowCount === 0) {
      return res.status(404).json({
        ok: false,
        error: "RIC37 no encontrado"
      });
    }

    const determinaciones = await pool.query(
      `
      SELECT
        id,
        determinacion,
        nombre,
        medicion,
        rango_aceptacion,
        conforme,
        no_aplica,
        observaciones
      FROM ric37_determinaciones
      WHERE ric37_id = $1
      ORDER BY id ASC
      `,
      [idNumerico]
    );

    return res.json({
      ok: true,
      ric37: {
        ...cabecera.rows[0],
        determinaciones: determinaciones.rows
      }
    });
  } catch (error) {
    console.error("Error obteniendo detalle RIC37:", error);
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo detalle RIC37"
    });
  }
}
