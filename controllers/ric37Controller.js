import pool from "../db.js";

function numeroDecimalONull(valor, campo = "valor") {
  if (valor === null || valor === undefined) return null;

  if (typeof valor === "string" && valor.trim() === "") return null;

  const normalizado = typeof valor === "string"
    ? valor.trim().replace(/,/g, ".")
    : valor;

  const numero = Number(normalizado);

  if (!Number.isFinite(numero)) {
    const error = new Error(`Valor numérico inválido en ${campo}: "${valor}"`);
    error.statusCode = 400;
    throw error;
  }

  return numero;
}

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

    // RIC37 siempre debe quedar asociado a un mantenimiento RIC01.
    if (!ric01_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "No se recibió ric01_id"
      });
    }

    const ric01IdNumerico = Number(ric01_id);

    if (!Number.isInteger(ric01IdNumerico) || ric01IdNumerico <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "ric01_id inválido"
      });
    }

    // ========================================================
    // PROTECCIÓN CONTRA DUPLICADOS
    // ========================================================
    // El advisory lock es por transacción y por ric01_id.
    // Si llegan dos POST simultáneos para el mismo mantenimiento,
    // el segundo espera a que termine el primero y luego comprueba
    // si el RIC37 ya fue creado.
    await client.query(
      "SELECT pg_advisory_xact_lock($1::bigint)",
      [ric01IdNumerico]
    );

    const existente = await client.query(
      `SELECT id
       FROM ric37
       WHERE ric01_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [ric01IdNumerico]
    );

    if (existente.rows.length > 0) {
      await client.query("COMMIT");

      return res.status(200).json({
        ok: true,
        ric37_id: existente.rows[0].id,
        existente: true,
        mensaje: "RIC37 ya estaba guardado para este mantenimiento"
      });
    }

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
        ric01IdNumerico,
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
        numeroDecimalONull(medicion_tension, "medicion_tension"),
        numeroDecimalONull(medicion_corriente, "medicion_corriente"),
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
          d.determinacion ?? d.numero ?? null,
          d.nombre,
          numeroDecimalONull(d.medicion, `determinacion ${d.determinacion ?? d.numero ?? ""} - medicion`),
          numeroDecimalONull(d.rango_aceptacion ?? d.rango, `determinacion ${d.determinacion ?? d.numero ?? ""} - rango_aceptacion`),
          d.no_aplica ?? d.noAplica
            ? null
            : d.conforme ?? null,
          d.no_aplica ?? d.noAplica ?? false,
          d.observaciones || null
        ]
      );

    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      ric37_id,
      existente: false
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "Error guardando RIC37:",
      error
    );

    res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message
    });

  } finally {

    client.release();

  }
}


export async function obtenerRIC37PorRic01(req, res) {
  try {
    const ric01Id = Number(req.params.ric01Id);

    if (!Number.isInteger(ric01Id) || ric01Id <= 0) {
      return res.status(400).json({
        ok: false,
        error: "ric01_id inválido"
      });
    }

    const result = await pool.query(
      `SELECT id, ric01_id, resultado_general, fecha, tecnico
       FROM ric37
       WHERE ric01_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [ric01Id]
    );

    if (!result.rows.length) {
      return res.json({
        ok: true,
        realizado: false,
        ric37: null
      });
    }

    return res.json({
      ok: true,
      realizado: true,
      ric37: result.rows[0]
    });
  } catch (error) {
    console.error("Error consultando RIC37 por ric01_id:", error);
    return res.status(500).json({
      ok: false,
      error: "No se pudo consultar el RIC37 asociado"
    });
  }
}
