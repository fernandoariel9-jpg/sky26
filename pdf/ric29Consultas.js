// =====================================================
// CONSULTAS DE PROTOCOLOS RIC
// =====================================================

import pool from "../db.js";

// -----------------------------------------------------
// RIC29 completo
// -----------------------------------------------------

export async function obtenerRIC29(id) {

    const { rows: cabecera } = await pool.query(`
        SELECT
            r.*,
            e.descripcion,
            e.estado
        FROM ric29 r
        LEFT JOIN equipos e ON e.id = r.equipo_id
        WHERE r.id = $1
    `, [id]);

    if (!cabecera.length)
        throw new Error("RIC29 no encontrado");

    const ric29 = cabecera[0];

    const tablas = [
        ["inspecciones", "ric29_inspecciones"],
        ["energia", "ric29_energia"],
        ["carga", "ric29_carga"],
        ["bateria", "ric29_bateria"],
        ["sincronismo", "ric29_sincronismo"],
        ["monitorizacion", "ric29_monitorizacion"],
        ["alarmas", "ric29_alarmas"]
    ];

    const datos = await Promise.all(
        tablas.map(async ([nombre, tabla]) => {

            const { rows } = await pool.query(
                `SELECT * FROM ${tabla} WHERE ric29_id = $1 ORDER BY id`,
                [id]
            );

            return [nombre, rows];

        })
    );

    return {
        ...ric29,
        ...Object.fromEntries(datos)
    };
}
