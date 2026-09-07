import pool from "../db.js";

/**
 * Obtiene la fecha actual de Argentina en formato YYYY-MM-DD.
 */
function fechaArgentina() {
  const ahora = new Date();

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}


/**
 * Calcula y guarda los promedios históricos acumulados
 * hasta la fecha indicada.
 *
 * promedio_solucion:
 * fecha → fecha_comp
 *
 * promedio_finalizacion:
 * fecha_comp → fecha_fin
 *
 * promedio_adm:
 * fecha_adm → fecha_fin
 */
export async function guardarResumenTiempos(fechaObjetivo = null) {
  try {
    const fecha = fechaObjetivo || fechaArgentina();

    console.log(
      `⏳ Calculando promedios históricos acumulados hasta ${fecha}...`
    );

    const { rows } = await pool.query(
      `
      SELECT

        AVG(
          EXTRACT(EPOCH FROM (fecha_comp - fecha)) / 3600
        ) FILTER (
          WHERE fecha IS NOT NULL
            AND fecha_comp IS NOT NULL
            AND fecha::date <= $1::date
            AND fecha_comp >= fecha
        ) AS promedio_solucion,

        AVG(
          EXTRACT(EPOCH FROM (fecha_fin - fecha_comp)) / 3600
        ) FILTER (
          WHERE fecha_comp IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_comp::date <= $1::date
            AND fecha_fin >= fecha_comp
        ) AS promedio_finalizacion,

        AVG(
          EXTRACT(EPOCH FROM (fecha_fin - fecha_adm)) / 3600
        ) FILTER (
          WHERE fecha_adm IS NOT NULL
            AND fecha_fin IS NOT NULL
            AND fecha_adm::date <= $1::date
            AND fecha_fin >= fecha_adm
        ) AS promedio_adm

      FROM ric01
      `,
      [fecha]
    );

    const promedio_solucion = rows[0].promedio_solucion;
    const promedio_finalizacion = rows[0].promedio_finalizacion;
    const promedio_adm = rows[0].promedio_adm;

    await pool.query(
      `
      INSERT INTO resumen_tiempos (
        fecha,
        promedio_solucion,
        promedio_finalizacion,
        promedio_adm
      )
      VALUES ($1, $2, $3, $4)

      ON CONFLICT (fecha)
      DO UPDATE SET
        promedio_solucion =
          EXCLUDED.promedio_solucion,

        promedio_finalizacion =
          EXCLUDED.promedio_finalizacion,

        promedio_adm =
          EXCLUDED.promedio_adm
      `,
      [
        fecha,
        promedio_solucion,
        promedio_finalizacion,
        promedio_adm
      ]
    );

    console.log(
      `✅ Resumen histórico guardado para ${fecha}:`,
      `Solución=${
        promedio_solucion !== null
          ? Number(promedio_solucion).toFixed(2)
          : "sin datos"
      }h |`,
      `Finalización=${
        promedio_finalizacion !== null
          ? Number(promedio_finalizacion).toFixed(2)
          : "sin datos"
      }h |`,
      `Administración=${
        promedio_adm !== null
          ? Number(promedio_adm).toFixed(2)
          : "sin datos"
      }h`
    );

    return {
      ok: true,
      fecha,
      promedio_solucion,
      promedio_finalizacion,
      promedio_adm
    };

  } catch (error) {
    console.error(
      "❌ Error al guardar resumen histórico de tiempos:",
      error
    );

    throw error;
  }
}


/**
 * Obtener la serie histórica completa.
 */
export async function obtenerResumenTiempos(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        fecha,
        promedio_solucion,
        promedio_finalizacion,
        promedio_adm
      FROM resumen_tiempos
      ORDER BY fecha ASC
    `);

    res.json({
      ok: true,
      datos: rows
    });

  } catch (error) {
    console.error(
      "❌ Error obteniendo resumen histórico de tiempos:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Error obteniendo resumen histórico de tiempos"
    });
  }
}


/**
 * Generar o recalcular manualmente un día.
 *
 * Ejemplo:
 * POST /api/resumen_tiempos/generar
 *
 * body:
 * {
 *   "fecha": "2026-09-07"
 * }
 */
export async function generarResumenTiempos(req, res) {
  try {
    const fecha = req.body?.fecha || req.query?.fecha;

    const resultado = await guardarResumenTiempos(fecha);

    res.json(resultado);

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
