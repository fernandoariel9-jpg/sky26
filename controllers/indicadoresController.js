import pool from "../db.js";

const ESTADOS_EXCLUIDOS = ["OBSOLETO", "OBSOLETOS", "DE BAJA"];

export async function obtenerIndicadoresPreventivos(req, res) {
  try {
    const { rows } = await pool.query(
      `
      WITH equipos_vigentes AS (
        SELECT
          id,
          UPPER(TRIM(COALESCE(estado, ''))) AS estado_normalizado,
          CASE
            WHEN TRIM(COALESCE(periodo::text, '')) ~ '^[0-9]+$'
             AND TRIM(periodo::text)::integer > 0
            THEN TRIM(periodo::text)::integer
            ELSE NULL
          END AS periodo_dias,
          CASE
            WHEN TRIM(COALESCE(ultimo_mant::text, '')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN TRIM(ultimo_mant::text)::timestamp::date
            WHEN TRIM(COALESCE(ultimo_mant::text, '')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}
        FROM equipos
        WHERE UPPER(TRIM(COALESCE(estado, ''))) <> ALL($1::text[])
      )
      SELECT
        COUNT(*)::integer AS total_vigentes,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
        )::integer AS cubiertos,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
        )::integer AS cubiertos_calculables,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
            AND (fecha_base + (periodo_dias * INTERVAL '1 day'))::date >= CURRENT_DATE
        )::integer AS en_cumplimiento,
        COUNT(*) FILTER (
          WHERE estado_normalizado IN ('ACTIVO', 'ACTIVO RESTRINGIDO')
        )::integer AS operativos
      FROM equipos_vigentes
      `,
      [ESTADOS_EXCLUIDOS]
    );

    const r = rows[0] || {};

    const total = Number(r.total_vigentes || 0);
    const cubiertos = Number(r.cubiertos || 0);
    const calculables = Number(r.cubiertos_calculables || 0);
    const cumplimiento = Number(r.en_cumplimiento || 0);
    const operativos = Number(r.operativos || 0);

    res.json({
      cobertura_preventiva: total > 0
        ? Number(((cubiertos / total) * 100).toFixed(1))
        : 0,
      cumplimiento_preventivo: calculables > 0
        ? Number(((cumplimiento / calculables) * 100).toFixed(1))
        : 0,
      equipos_operativos: total > 0
        ? Number(((operativos / total) * 100).toFixed(1))
        : 0,
      detalle: {
        total_vigentes: total,
        cubiertos,
        cubiertos_calculables: calculables,
        preventivos_en_cumplimiento: cumplimiento,
        operativos
      }
    });
  } catch (error) {
    console.error("Error obteniendo indicadores preventivos:", error);
    res.status(500).json({
      error: "Error obteniendo indicadores preventivos",
      detalle: error.message
    });
  }
}

              THEN TO_DATE(TRIM(ultimo_mant::text), 'DD/MM/YYYY')
            WHEN TRIM(COALESCE(fecha_alta::text, '')) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
              THEN TRIM(fecha_alta::text)::timestamp::date
            WHEN TRIM(COALESCE(fecha_alta::text, '')) ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}
        FROM equipos
        WHERE UPPER(TRIM(COALESCE(estado, ''))) <> ALL($1::text[])
      )
      SELECT
        COUNT(*)::integer AS total_vigentes,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
        )::integer AS cubiertos,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
        )::integer AS cubiertos_calculables,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
            AND (fecha_base + (periodo_dias * INTERVAL '1 day'))::date >= CURRENT_DATE
        )::integer AS en_cumplimiento,
        COUNT(*) FILTER (
          WHERE estado_normalizado IN ('ACTIVO', 'ACTIVO RESTRINGIDO')
        )::integer AS operativos
      FROM equipos_vigentes
      `,
      [ESTADOS_EXCLUIDOS]
    );

    const r = rows[0] || {};

    const total = Number(r.total_vigentes || 0);
    const cubiertos = Number(r.cubiertos || 0);
    const calculables = Number(r.cubiertos_calculables || 0);
    const cumplimiento = Number(r.en_cumplimiento || 0);
    const operativos = Number(r.operativos || 0);

    res.json({
      cobertura_preventiva: total > 0
        ? Number(((cubiertos / total) * 100).toFixed(1))
        : 0,
      cumplimiento_preventivo: calculables > 0
        ? Number(((cumplimiento / calculables) * 100).toFixed(1))
        : 0,
      equipos_operativos: total > 0
        ? Number(((operativos / total) * 100).toFixed(1))
        : 0,
      detalle: {
        total_vigentes: total,
        cubiertos,
        cubiertos_calculables: calculables,
        preventivos_en_cumplimiento: cumplimiento,
        operativos
      }
    });
  } catch (error) {
    console.error("Error obteniendo indicadores preventivos:", error);
    res.status(500).json({
      error: "Error obteniendo indicadores preventivos",
      detalle: error.message
    });
  }
}

              THEN TO_DATE(TRIM(fecha_alta::text), 'DD/MM/YYYY')
            ELSE NULL
          END AS fecha_base
        FROM equipos
        WHERE UPPER(TRIM(COALESCE(estado, ''))) <> ALL($1::text[])
      )
      SELECT
        COUNT(*)::integer AS total_vigentes,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
        )::integer AS cubiertos,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
        )::integer AS cubiertos_calculables,
        COUNT(*) FILTER (
          WHERE periodo_dias IS NOT NULL
            AND fecha_base IS NOT NULL
            AND (fecha_base + (periodo_dias * INTERVAL '1 day'))::date >= CURRENT_DATE
        )::integer AS en_cumplimiento,
        COUNT(*) FILTER (
          WHERE estado_normalizado IN ('ACTIVO', 'ACTIVO RESTRINGIDO')
        )::integer AS operativos
      FROM equipos_vigentes
      `,
      [ESTADOS_EXCLUIDOS]
    );

    const r = rows[0] || {};

    const total = Number(r.total_vigentes || 0);
    const cubiertos = Number(r.cubiertos || 0);
    const calculables = Number(r.cubiertos_calculables || 0);
    const cumplimiento = Number(r.en_cumplimiento || 0);
    const operativos = Number(r.operativos || 0);

    res.json({
      cobertura_preventiva: total > 0
        ? Number(((cubiertos / total) * 100).toFixed(1))
        : 0,
      cumplimiento_preventivo: calculables > 0
        ? Number(((cumplimiento / calculables) * 100).toFixed(1))
        : 0,
      equipos_operativos: total > 0
        ? Number(((operativos / total) * 100).toFixed(1))
        : 0,
      detalle: {
        total_vigentes: total,
        cubiertos,
        cubiertos_calculables: calculables,
        preventivos_en_cumplimiento: cumplimiento,
        operativos
      }
    });
  } catch (error) {
    console.error("Error obteniendo indicadores preventivos:", error);
    res.status(500).json({
      error: "Error obteniendo indicadores preventivos",
      detalle: error.message
    });
  }
}
