// -----------------------------------------------------
// historialConsultas.js
// Consultas SQL para el historial de equipos
// -----------------------------------------------------

import pool from "../db.js";

// -----------------------------------------------------
// Obtiene la información general del equipo
// -----------------------------------------------------

export async function obtenerEquipo(numeroSerie) {

    const result = await pool.query(
        `
        SELECT
            id,
            descripcion,
            marca_modelo,
            numero_serie,
            estado,
            servicio,
            area,
            sub_servicio,
            ultimo_mant
        FROM equipos
        WHERE numero_serie = $1
        `,
        [numeroSerie]
    );

    if (result.rows.length === 0) {
        throw new Error("Equipo no encontrado");
    }

    return result.rows[0];

}

// -----------------------------------------------------
// Historial completo del equipo
// -----------------------------------------------------

export async function obtenerHistorial(numeroSerie) {

    const result = await pool.query(
        `
        SELECT
            id,
            fecha,
            fecha_comp,
            fecha_fin,
            tipo_mantenimiento,
            diagnostico,
            solucion,
            observacion,
            usuario,
            asignado,
            solicitado_por,
            fin
        FROM ric01
        WHERE numero_serie = $1
        ORDER BY fecha DESC
        `,
        [numeroSerie]
    );

    return result.rows;

}

// -----------------------------------------------------
// Resumen estadístico
// -----------------------------------------------------

export async function obtenerResumen(numeroSerie) {

    const result = await pool.query(
        `
        SELECT

            COUNT(*)::int AS total,

            COALESCE(
                SUM(
                    CASE
                        WHEN tipo_mantenimiento='Correctivo'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            )::int AS correctivos,

            COALESCE(
                SUM(
                    CASE
                        WHEN tipo_mantenimiento='Preventivo'
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            )::int AS preventivos,

            COALESCE(
                SUM(
                    CASE
                        WHEN tipo_mantenimiento IN ('Calibración','Calibracion')
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            )::int AS calibraciones,

            COALESCE(
                SUM(
                    CASE
                        WHEN tipo_mantenimiento IN ('Instalación','Instalacion')
                        THEN 1
                        ELSE 0
                    END
                ),
                0
            )::int AS instalaciones

        FROM ric01

        WHERE numero_serie = $1
        `,
        [numeroSerie]
    );

    return result.rows[0];

}

// -----------------------------------------------------
// Devuelve todos los datos juntos
// -----------------------------------------------------

export async function obtenerDatosEquipo(numeroSerie) {

    const [
        equipo,
        historial,
        resumen
    ] = await Promise.all([

        obtenerEquipo(numeroSerie),

        obtenerHistorial(numeroSerie),

        obtenerResumen(numeroSerie)

    ]);

    return {

        equipo,

        historial,

        resumen

    };

}
