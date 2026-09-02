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
        sub_servicio
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
    // 2. CANTIDAD DE MANTENIMIENTOS
    // ---------------------------------------------------------

    const mantenimientosResult = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(tipo_mantenimiento, '')) = 'correctivo'
        ) AS correctivos,

        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(tipo_mantenimiento, '')) = 'preventivo'
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
    // 3. HISTORIAL DE ESTADOS
    // ---------------------------------------------------------

    const historialResult = await pool.query(
      `
      SELECT
        estado_anterior,
        estado_nuevo,
        fecha
      FROM historial_estados
      WHERE numero_serie = $1
      ORDER BY fecha ASC, id ASC
      `,
      [numero_serie]
    );

    const historial = historialResult.rows;

    // ---------------------------------------------------------
    // 4. CÁLCULO DE DÍAS FUERA DE SERVICIO
    //
    // Cada estado comienza en "fecha" y termina cuando
    // comienza el siguiente estado.
    //
    // Todo estado diferente de "Activo" cuenta como
    // fuera de servicio.
    // ---------------------------------------------------------

    const ahora = new Date();

    let segundosFueraServicio = 0;

    const detalleEstados = {};

    for (let i = 0; i < historial.length; i++) {
      const registro = historial[i];

      const inicio = new Date(registro.fecha);

      if (Number.isNaN(inicio.getTime())) {
        continue;
      }

      const siguiente = historial[i + 1];

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
      ).trim();

      if (estado.toLowerCase() !== "activo") {
        segundosFueraServicio += segundos;

        if (!detalleEstados[estado]) {
          detalleEstados[estado] = 0;
        }

        detalleEstados[estado] += segundos;
      }
    }

    // ---------------------------------------------------------
    // 5. CONVERTIR A DÍAS
    //
    // Se utilizan días completos transcurridos.
    // ---------------------------------------------------------

    const diasFueraServicio = Math.floor(
      segundosFueraServicio / 86400
    );

    const detalleEstadosArray = Object.entries(
      detalleEstados
    ).map(([estado, segundos]) => ({
      estado,
      dias: Math.floor(segundos / 86400)
    }));

    // ---------------------------------------------------------
    // 6. EQUIPOS SIMILARES
    //
    // Se consideran similares los equipos que coinciden
    // en descripción y marca/modelo.
    //
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
    // 7. RESPUESTA
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
        sub_servicio: equipo.sub_servicio
      },

      mantenimientos,

      disponibilidad: {
        dias_fuera_servicio: diasFueraServicio,
        detalle_estados: detalleEstadosArray
      },

      equipos_similares: equiposSimilares
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
