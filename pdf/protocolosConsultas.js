// =====================================================
// CONSULTAS DE PROTOCOLOS DE MANTENIMIENTO
// =====================================================

import pool from "../db.js";

// =====================================================
// RIC29
// =====================================================

export async function obtenerRIC29(id) {

    console.log("=================================");
    console.log("OBTENER RIC29");
    console.log("id recibido:", id);
    console.log("tipo:", typeof id);
    console.log("=================================");

    const idNumerico = Number(id);

    console.log("idNumerico:", idNumerico);

    if (!Number.isInteger(idNumerico)) {
        throw new Error(
            `ID RIC29 inválido: ${id}`
        );
    }

    const { rows: cabecera } = await pool.query(`
        SELECT
            r.*,
            e.estado
        FROM ric29 r
        LEFT JOIN equipos e
            ON e.id = r.equipo_id
        WHERE r.id = $1
    `, [idNumerico]);

    console.log(
        "RIC29 encontrados:",
        cabecera.length
    );

    if (!cabecera.length) {
        throw new Error(
            `RIC29 no encontrado para id=${idNumerico}`
        );
    }

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
                `SELECT *
                 FROM ${tabla}
                 WHERE ric29_id = $1
                 ORDER BY id`,
                [idNumerico]
            );

            return [nombre, rows];

        })
    );

    return {
        ...ric29,
        ...Object.fromEntries(datos)
    };
}

// =====================================================
// RIC39
// =====================================================

export async function obtenerRIC39(id) {
    const idNumerico = Number(id);

    if (!Number.isInteger(idNumerico)) {
        throw new Error(`ID RIC39 inválido: ${id}`);
    }

    const { rows: cabecera } = await pool.query(`
        SELECT
            r.*,
            e.estado,
            e.descripcion AS descripcion_equipo,
            e.marca_modelo AS marca_modelo_equipo,
            e.numero_serie AS numero_serie_equipo,
            e.area AS area_equipo,
            e.servicio AS servicio_equipo,
            e.sub_servicio AS sub_servicio_equipo,
            e.encargado AS encargado_equipo
        FROM ric39 r
        LEFT JOIN equipos e
            ON e.id = r.equipo_id
        WHERE r.id = $1
    `, [idNumerico]);

    if (!cabecera.length) {
        throw new Error(`RIC39 no encontrado para id=${idNumerico}`);
    }

    const ric39 = cabecera[0];

    const [inspecciones, mediciones, ric37] = await Promise.all([
        pool.query(
            `SELECT *
             FROM ric39_inspecciones
             WHERE ric39_id = $1
             ORDER BY id`,
            [idNumerico]
        ),
        pool.query(
            `SELECT *
             FROM ric39_mediciones
             WHERE ric39_id = $1
             ORDER BY
                CASE escenario
                    WHEN 'NORMAL' THEN 1
                    WHEN 'HIPERTENSO' THEN 2
                    WHEN 'BRADICARDIA' THEN 3
                    ELSE 4
                END,
                orden,
                id`,
            [idNumerico]
        ),
        ric39.ric37_id
            ? pool.query(
                `SELECT *
                 FROM ric37
                 WHERE id = $1`,
                [ric39.ric37_id]
              )
            : Promise.resolve({ rows: [] })
    ]);

    let determinacionesRic37 = [];

    if (ric39.ric37_id) {
        const resultado = await pool.query(
            `SELECT *
             FROM ric37_determinaciones
             WHERE ric37_id = $1
             ORDER BY id`,
            [ric39.ric37_id]
        );
        determinacionesRic37 = resultado.rows;
    }

    return {
        ...ric39,
        inspecciones: inspecciones.rows,
        mediciones: mediciones.rows,
        ric37: ric37.rows[0] || null,
        ric37_determinaciones: determinacionesRic37
    };
}

// =====================================================
// RIC48
// =====================================================

export async function obtenerRIC48(id) {
    const idNumerico = Number(id);

    if (!Number.isInteger(idNumerico)) {
        throw new Error(`ID RIC48 inválido: ${id}`);
    }

    const { rows: cabecera } = await pool.query(`
        SELECT
            r.*,
            e.estado,
            e.descripcion AS descripcion_equipo,
            e.marca_modelo AS marca_modelo_equipo,
            e.numero_serie AS numero_serie_equipo,
            e.area AS area_equipo,
            e.servicio AS servicio_equipo,
            e.sub_servicio AS sub_servicio_equipo,
            e.encargado AS encargado_equipo
        FROM ric48 r
        LEFT JOIN equipos e
            ON e.id = r.equipo_id
        WHERE r.id = $1
    `, [idNumerico]);

    if (!cabecera.length) {
        throw new Error(`RIC48 no encontrado para id=${idNumerico}`);
    }

    const ric48 = cabecera[0];

    const [inspecciones, mediciones, ric37] = await Promise.all([
        pool.query(
            `SELECT *
             FROM ric48_inspecciones
             WHERE ric48_id = $1
             ORDER BY id`,
            [idNumerico]
        ),
        pool.query(
            `SELECT *
             FROM ric48_mediciones
             WHERE ric48_id = $1
             ORDER BY
                CASE grupo
                    WHEN 'FRECUENCIA' THEN 1
                    WHEN 'AMPLITUD' THEN 2
                    WHEN 'GRUPO DE ONDA' THEN 3
                    WHEN 'ARTEFACTOS' THEN 4
                    WHEN 'FORMA DE ONDA' THEN 5
                    WHEN 'SEGMENTO ST' THEN 6
                    ELSE 7
                END,
                orden,
                id`,
            [idNumerico]
        ),
        ric48.ric37_id
            ? pool.query(
                `SELECT * FROM ric37 WHERE id = $1`,
                [ric48.ric37_id]
              )
            : Promise.resolve({ rows: [] })
    ]);

    let determinacionesRic37 = [];

    if (ric48.ric37_id) {
        const resultado = await pool.query(
            `SELECT *
             FROM ric37_determinaciones
             WHERE ric37_id = $1
             ORDER BY id`,
            [ric48.ric37_id]
        );
        determinacionesRic37 = resultado.rows;
    }

    return {
        ...ric48,
        inspecciones: inspecciones.rows,
        mediciones: mediciones.rows,
        ric37: ric37.rows[0] || null,
        ric37_determinaciones: determinacionesRic37
    };
}

// =====================================================
// RIC64
// =====================================================

export async function obtenerRIC64(id) {
    const idNumerico = Number(id);

    if (!Number.isInteger(idNumerico)) {
        throw new Error(`ID RIC64 inválido: ${id}`);
    }

    const { rows: cabecera } = await pool.query(`
        SELECT
            r.*,
            e.estado,
            e.descripcion AS descripcion_equipo,
            e.marca_modelo AS marca_modelo_equipo,
            e.numero_serie AS numero_serie_equipo,
            e.area AS area_equipo,
            e.servicio AS servicio_equipo,
            e.sub_servicio AS sub_servicio_equipo,
            e.encargado AS encargado_equipo
        FROM ric64 r
        LEFT JOIN equipos e
            ON e.id = r.equipo_id
        WHERE r.id = $1
    `, [idNumerico]);

    if (!cabecera.length) {
        throw new Error(`RIC64 no encontrado para id=${idNumerico}`);
    }

    const ric64 = cabecera[0];

    const [inspecciones, temperaturas, ric37] = await Promise.all([
        pool.query(
            `SELECT *
             FROM ric64_inspecciones
             WHERE ric64_id = $1
             ORDER BY id`,
            [idNumerico]
        ),
        pool.query(
            `SELECT *
             FROM ric64_temperaturas
             WHERE ric64_id = $1
             ORDER BY orden, id`,
            [idNumerico]
        ),
        ric64.ric37_id
            ? pool.query(`SELECT * FROM ric37 WHERE id = $1`, [ric64.ric37_id])
            : Promise.resolve({ rows: [] })
    ]);

    let determinacionesRic37 = [];
    if (ric64.ric37_id) {
        const resultado = await pool.query(
            `SELECT * FROM ric37_determinaciones WHERE ric37_id = $1 ORDER BY id`,
            [ric64.ric37_id]
        );
        determinacionesRic37 = resultado.rows;
    }

    return {
        ...ric64,
        inspecciones: inspecciones.rows,
        temperaturas: temperaturas.rows,
        ric37: ric37.rows[0] || null,
        ric37_determinaciones: determinacionesRic37
    };
}
