import pool from "../db.js";

/**
 * Obtiene estadísticas generales de un equipo.
 *
 * GET /api/estadisticas/equipo/:numero_serie
 *
 * Las estadísticas son independientes de cualquier RIC.
 */
export const obtenerEstadisticasEquipo = async (req, res) => {
  const { numero_serie } = req.params;

  try {
    if (!numero_serie) {
      return res.status(400).json({
        error: "Número de serie requerido"
      });
    }

    // ---------------------------------------------------------
    // 1. DATOS BÁSICOS DEL EQUIPO
    // ---------------------------------------------------------

    const equipoResult = await pool.query(
      `
      SELECT
        id,
        numero_serie,
        descripcion,
        marca_modelo,
        estado,
        servicio,
        area,
        sub_servicio,
        fecha_alta
      FROM equipos
      WHERE numero_serie = $1
      LIMIT 1
      `,
      [numero_serie]
    );

    if (equipoResult.rowCount === 0) {
      return res.status(404).json({
        error: "Equipo no encontrado"
      });
    }

    const equipo = equipoResult.rows[0];

    // ---------------------------------------------------------
    // 2. CANTIDAD DE MANTENIMIENTOS / INGRESOS
    // ---------------------------------------------------------

    const mantenimientosResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(tipo_mantenimiento, ''))) = 'correctivo'
        ) AS correctivos,

        COUNT(*) FILTER (
          WHERE LOWER(TRIM(COALESCE(tipo_mantenimiento, ''))) = 'preventivo'
        ) AS preventivos,

        COUNT(*) AS total
      FROM ric01
      WHERE numero_serie = $1
      `,
      [numero_serie]
    );

    const mantenimientos = {
      correctivos: Number(mantenimientosResult.rows[0].correctivos) || 0,
      preventivos: Number(mantenimientosResult.rows[0].preventivos) || 0,
      total: Number(mantenimientosResult.rows[0].total) || 0
    };

    // ---------------------------------------------------------
    // 3. EVOLUCIÓN DE INGRESOS
    //
    // Para esta estadística, un ingreso equivale a un mantenimiento
    // correctivo. Se agrupan por año para poder visualizar la
    // tendencia de reparaciones a lo largo del tiempo.
    // ---------------------------------------------------------

    const evolucionIngresosResult = await pool.query(
      `
      SELECT
        EXTRACT(YEAR FROM fecha)::integer AS anio,
        COUNT(*) AS ingresos
      FROM ric01
      WHERE numero_serie = $1
        AND LOWER(TRIM(COALESCE(tipo_mantenimiento, ''))) = 'correctivo'
        AND fecha IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM fecha)
      ORDER BY anio ASC
      `,
      [numero_serie]
    );

    const evolucionIngresos = evolucionIngresosResult.rows.map((registro) => ({
      periodo: String(registro.anio),
      ingresos: Number(registro.ingresos) || 0
    }));

    // ---------------------------------------------------------
    // 4. HISTORIAL DE ESTADOS
    // ---------------------------------------------------------

    const historialResult = await pool.query(
      `
      SELECT
        id,
        estado_anterior,
        estado_nuevo,
        fecha,
        usuario
      FROM historial_estados
      WHERE numero_serie = $1
      ORDER BY fecha ASC, id ASC
      `,
      [numero_serie]
    );

    const historial = historialResult.rows;

    // ---------------------------------------------------------
    // 5. CÁLCULO DE TIEMPO POR ESTADO
    //
    // Cada registro representa el comienzo del estado_nuevo.
    // Ese estado permanece hasta el siguiente cambio o hasta
    // el momento actual si es el último registro.
    //
    // Reglas:
    //   - Activo              -> activo
    //   - Activo Restringido  -> activo_restringido
    //   - Cualquier otro      -> fuera_de_servicio
    //
    // Estados como "Ingresado" también cuentan como fuera de
    // servicio.
    // ---------------------------------------------------------

    const ahora = new Date();

    let segundosActivo = 0;
    let segundosActivoRestringido = 0;
    let segundosFueraServicio = 0;

    for (let i = 0; i < historial.length; i++) {
      const registro = historial[i];
      const inicio = new Date(registro.fecha);
      const siguiente = historial[i + 1];

      if (Number.isNaN(inicio.getTime())) {
        continue;
      }

      const fin = siguiente
        ? new Date(siguiente.fecha)
        : ahora;

      if (Number.isNaN(fin.getTime())) {
        continue;
      }

      const segundos = Math.max(
        0,
        (fin.getTime() - inicio.getTime()) / 1000
      );

      const estado = String(
        registro.estado_nuevo || ""
      ).trim().toLowerCase();

      if (estado === "activo") {
        segundosActivo += segundos;
      } else if (estado === "activo restringido") {
        segundosActivoRestringido += segundos;
      } else {
        segundosFueraServicio += segundos;
      }
    }

    // ---------------------------------------------------------
    // 6. CONVERTIR A DÍAS COMPLETOS
    // ---------------------------------------------------------

    const diasActivo = Math.floor(segundosActivo / 86400);
    const diasActivoRestringido = Math.floor(
      segundosActivoRestringido / 86400
    );
    const diasFueraServicio = Math.floor(
      segundosFueraServicio / 86400
    );

    const disponibilidad = {
      activo: diasActivo,
      activo_restringido: diasActivoRestringido,
      fuera_de_servicio: diasFueraServicio
    };

    // ---------------------------------------------------------
    // 7. TIEMPO MEDIO ENTRE FALLAS (TMF)
    //
    // Fórmula definida:
    //
    // ((hoy - fecha_alta) - días fuera de servicio)
    // / cantidad de ingresos
    //
    // Los ingresos se consideran los mantenimientos correctivos.
    // Si no existen ingresos, el TMF queda en null.
    // ---------------------------------------------------------

    let tmfDias = null;
    let diasDesdeAlta = null;
    let diasOperativosParaTmf = null;

    if (equipo.fecha_alta && mantenimientos.correctivos > 0) {
      const fechaAlta = new Date(equipo.fecha_alta);

      if (!Number.isNaN(fechaAlta.getTime())) {
        const milisegundosDesdeAlta = Math.max(
          0,
          ahora.getTime() - fechaAlta.getTime()
        );

        diasDesdeAlta = Math.floor(
          milisegundosDesdeAlta / 86400000
        );

        diasOperativosParaTmf = Math.max(
          0,
          diasDesdeAlta - diasFueraServicio
        );

        tmfDias = Number(
          (diasOperativosParaTmf / mantenimientos.correctivos).toFixed(1)
        );
      }
    }

    const tmf = {
      dias: tmfDias,
      ingresos: mantenimientos.correctivos,
      dias_desde_alta: diasDesdeAlta,
      dias_fuera_servicio: diasFueraServicio,
      dias_operativos: diasOperativosParaTmf
    };

    // ---------------------------------------------------------
    // 8. EQUIPOS SIMILARES
    //
    // Se consideran similares los equipos que coinciden
    // en descripción y marca/modelo.
    // El propio equipo no se cuenta.
    // ---------------------------------------------------------

    const similaresResult = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM equipos e
      WHERE e.id <> $1
        AND LOWER(TRIM(COALESCE(e.descripcion, '')))
            = LOWER(TRIM(COALESCE($2, '')))
        AND LOWER(TRIM(COALESCE(e.marca_modelo, '')))
            = LOWER(TRIM(COALESCE($3, '')))
      `,
      [
        equipo.id,
        equipo.descripcion,
        equipo.marca_modelo
      ]
    );

    const equiposSimilares =
      Number(similaresResult.rows[0].total) || 0;

    // ---------------------------------------------------------
    // 9. RESPUESTA
    // ---------------------------------------------------------

    return res.json({
      equipo: {
        id: equipo.id,
        numero_serie: equipo.numero_serie,
        descripcion: equipo.descripcion,
        marca_modelo: equipo.marca_modelo,
        estado: equipo.estado,
        servicio: equipo.servicio,
        area: equipo.area,
        sub_servicio: equipo.sub_servicio,
        fecha_alta: equipo.fecha_alta
      },

      mantenimientos,

      evolucion_ingresos: evolucionIngresos,

      disponibilidad,

      // Alias directos para facilitar el consumo desde
      // componentes frontend que necesiten métricas puntuales.
      dias_fuera_servicio: diasFueraServicio,
      dias_activo: diasActivo,
      dias_activo_restringido: diasActivoRestringido,

      // Tiempo Medio entre Fallas.
      // null cuando no existe fecha de alta válida o no hay ingresos.
      tmf,

      equipos_similares: equiposSimilares,

      // El historial queda disponible para mostrarlo en el
      // componente sin necesidad de realizar otra consulta.
      historial_estados: historial.map((registro) => ({
        id: registro.id,
        estado_anterior: registro.estado_anterior,
        estado_nuevo: registro.estado_nuevo,
        fecha: registro.fecha,
        usuario: registro.usuario
      }))
    });

  } catch (error) {
    console.error(
      "Error obteniendo estadísticas del equipo:",
      error
    );

    return res.status(500).json({
      error: "Error obteniendo estadísticas del equipo"
    });
  }
};
