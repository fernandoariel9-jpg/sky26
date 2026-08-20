import pool from "../db.js";

export async function guardarRIC37(req, res) {

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const {
      ric01_id,
      equipo_id,
      numero_serie,
      marca_modelo,
      area,
      servicio,
      sub_servicio,
      encargado,
      fecha,
      tecnico,
      clase,
      tipo_proteccion,
      medicion_tension,
      medicion_corriente,
      resultado_general,
      observaciones,
      determinaciones
    } = req.body;

    const result = await client.query(
      `
      INSERT INTO ric37 (
        ric01_id,
        equipo_id,
        numero_serie,
        marca_modelo,
        area,
        servicio,
        sub_servicio,
        encargado,
        fecha,
        tecnico,
        clase,
        tipo_proteccion,
        medicion_tension,
        medicion_corriente,
        resultado_general,
        observaciones
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING id
      `,
      [
        ric01_id || null,
        equipo_id || null,
        numero_serie || null,
        marca_modelo || null,
        area || null,
        servicio || null,
        sub_servicio || null,
        encargado || null,
        fecha || new Date(),
        tecnico || null,
        clase || null,
        tipo_proteccion || null,
        medicion_tension || null,
        medicion_corriente || null,
        resultado_general || null,
        observaciones || null
      ]
    );

    const ric37_id = result.rows[0].id;

    for (const d of determinaciones || []) {

      await client.query(
        `
        INSERT INTO ric37_determinaciones (
          ric37_id,
          determinacion,
          nombre,
          medicion,
          rango_aceptacion,
          conforme,
          no_aplica,
          observaciones
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          ric37_id,
          d.determinacion,
          d.nombre,
          d.medicion ?? null,
          d.rango_aceptacion ?? null,
          d.no_aplica
            ? null
            : d.conforme ?? null,
          d.no_aplica ?? false,
          d.observaciones || null
        ]
      );

    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      ric37_id
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "Error guardando RIC37:",
      error
    );

    res.status(500).json({
      ok: false,
      error: error.message
    });

  } finally {

    client.release();

  }

}
