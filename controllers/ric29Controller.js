import pool from "../db.js";

import { obtenerRIC29 } from "../pdf/protocolosConsultas.js";
import { generarRIC29PDF } from "../pdf/ric29PDF.js";

import {
  obtenerCarpetaRIC29,
  subirPDFDrive
} from "../googleDrive.js";


// ============================================================
// GUARDAR RIC29
// ============================================================

export async function guardarRIC29(req, res) {

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
      resultado_general,
      observaciones,

      inspecciones,
      energia,
      carga,
      bateria,
      sincronismo,
      monitorizacion,
      alarmas
    } = req.body;


    // --------------------------------------------------
    // 1. CABECERA RIC 29
    // --------------------------------------------------

    const resultRic29 = await client.query(
      `
      INSERT INTO ric29 (
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
        resultado_general,
        observaciones
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
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
        resultado_general || null,
        observaciones || null
      ]
    );

    const ric29_id = resultRic29.rows[0].id;


    // --------------------------------------------------
    // 2. INSPECCIONES
    // --------------------------------------------------

    if (inspecciones) {

      await client.query(
        `
        INSERT INTO ric29_inspecciones (
          ric29_id,
          limpieza_exterior,
          papel_registro,
          estado_cables,
          observaciones
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          ric29_id,
          inspecciones.limpieza_exterior || null,
          inspecciones.papel_registro || null,
          inspecciones.estado_cables || null,
          inspecciones.observaciones || null
        ]
      );

    }


    // --------------------------------------------------
    // 3. ENTREGA DE ENERGÍA
    // --------------------------------------------------

    if (Array.isArray(energia)) {

      for (const item of energia) {

        await client.query(
          `
          INSERT INTO ric29_energia (
            ric29_id,
            energia_nominal,
            resultado_medicion,
            incertidumbre,
            rango_min,
            rango_max,
            conforme
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            ric29_id,
            item.energia_nominal || null,
            item.resultado_medicion || null,
            item.incertidumbre || null,
            item.rango_min || null,
            item.rango_max || null,
            item.conforme ?? null
          ]
        );

      }

    }


    // --------------------------------------------------
    // 4. TIEMPO DE CARGA
    // --------------------------------------------------

    if (carga) {

      await client.query(
        `
        INSERT INTO ric29_carga (
          ric29_id,
          numero_medicion,
          resultado_medicion,
          incertidumbre,
          rango_max,
          conforme
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          ric29_id,
          1,
          carga.resultado_medicion ?? null,
          carga.incertidumbre ?? 0.05,
          carga.rango_max ?? 15,
          carga.conforme ?? null
        ]
      );

    }


    // --------------------------------------------------
    // 5. BATERÍA
    // --------------------------------------------------

    if (Array.isArray(bateria)) {

      for (const item of bateria) {

        await client.query(
          `
          INSERT INTO ric29_bateria (
            ric29_id,
            numero_medicion,
            resultado_medicion,
            incertidumbre,
            rango_max,
            conforme,
            observaciones
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            ric29_id,
            item.numero_medicion,
            item.resultado_medicion || null,
            item.incertidumbre || null,
            item.rango_max || null,
            item.conforme ?? null,
            item.observaciones || null
          ]
        );

      }

    }


    // --------------------------------------------------
    // 6. SINCRONISMO
    // --------------------------------------------------

    if (sincronismo) {

      await client.query(
        `
        INSERT INTO ric29_sincronismo (
          ric29_id,
          resultado_medicion,
          incertidumbre,
          rango_max,
          conforme
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          ric29_id,
          sincronismo.resultado_medicion || null,
          sincronismo.incertidumbre || null,
          sincronismo.rango_max || null,
          sincronismo.conforme ?? null
        ]
      );

    }


    // --------------------------------------------------
    // 7. MONITORIZACIÓN
    // --------------------------------------------------

    if (monitorizacion) {

      const mediciones = [
        {
          frecuencia_nominal: 60,
          ...(monitorizacion["60"] || {})
        },
        {
          frecuencia_nominal: 120,
          ...(monitorizacion["120"] || {})
        }
      ];

      for (const item of mediciones) {

        await client.query(
          `
          INSERT INTO ric29_monitorizacion (
            ric29_id,
            frecuencia_nominal,
            resultado_medicion,
            incertidumbre,
            conforme
          )
          VALUES ($1,$2,$3,$4,$5)
          `,
          [
            ric29_id,
            item.frecuencia_nominal,
            item.resultado_medicion ?? null,
            item.incertidumbre ?? 3,
            item.conforme ?? null
          ]
        );

      }

    }


    // --------------------------------------------------
    // 8. ALARMAS
    // --------------------------------------------------

    if (alarmas) {

      await client.query(
        `
        INSERT INTO ric29_alarmas (
          ric29_id,
          alarma_alta_frecuencia,
          alarma_baja_frecuencia,
          activacion_alarmas,
          observaciones
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          ric29_id,
          alarmas.alarma_alta_frecuencia ?? null,
          alarmas.alarma_baja_frecuencia ?? null,
          alarmas.activacion_alarmas ?? null,
          alarmas.observaciones || null
        ]
      );

    }


    // --------------------------------------------------
    // COMMIT
    // --------------------------------------------------

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      mensaje: "RIC 29 guardado correctamente",
      ric29_id
    });

  } catch (error) {

    await client.query("ROLLBACK");

    console.error(
      "Error guardando RIC 29:",
      error
    );

    res.status(500).json({
      ok: false,
      error: "Error guardando RIC 29"
    });

  } finally {

    client.release();

  }

}


// ============================================================
// OBTENER RIC29
// ============================================================

export async function obtenerDetalleRIC29(req, res) {

  try {

    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {

      return res.status(400).json({
        error: "ID RIC29 inválido"
      });

    }

    const datos = await obtenerRIC29(id);

    res.json(datos);

  } catch (error) {

    console.error(
      "Error obteniendo RIC29:",
      error
    );

    res.status(500).json({
      error: error.message
    });

  }

}


// ============================================================
// GENERAR PDF RIC29
// ============================================================

export async function generarPDFRIC29(req, res) {

  try {

    const ric29_id = Number(req.params.id);

    if (!Number.isInteger(ric29_id)) {

      return res.status(400).json({
        error: "ID RIC29 inválido"
      });

    }

    console.log(
      `Generando PDF RIC29: ${ric29_id}`
    );

    const resultado =
      await generarRIC29PDF(ric29_id);


    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${resultado.nombreArchivo}"`
    );

    res.send(resultado.pdf);

  } catch (error) {

    console.error(
      "Error generando PDF RIC29:",
      error
    );

    res.status(500).json({
      error: error.message
    });

  }

}


// ============================================================
// ENVIAR RIC29 A GOOGLE DRIVE
// ============================================================

export async function enviarRIC29Drive(req, res) {

  try {

    const ric29_id =
      Number(req.params.id);

    if (!Number.isInteger(ric29_id)) {

      return res.status(400).json({
        ok: false,
        error: "ID RIC29 inválido"
      });

    }


    console.log(
      "Enviando RIC29 a Google Drive:",
      ric29_id
    );


    // --------------------------------------------------------
    // OBTENER DATOS DEL RIC29
    // --------------------------------------------------------

    const datos =
      await obtenerRIC29(
        ric29_id
      );


    // --------------------------------------------------------
    // GENERAR PDF
    // --------------------------------------------------------

    const resultadoPDF =
      await generarRIC29PDF(
        ric29_id
      );

    const pdf =
      resultadoPDF.pdf;

    const nombreArchivo =
      resultadoPDF.nombreArchivo;


    // --------------------------------------------------------
    // OBTENER CARPETA
    // Servicio → Subservicio
    // --------------------------------------------------------

    const carpeta =
      await obtenerCarpetaRIC29(
        datos.servicio,
        datos.sub_servicio
      );


    // --------------------------------------------------------
    // SUBIR PDF
    // --------------------------------------------------------

    const archivo =
      await subirPDFDrive({
        pdf,
        nombreArchivo,
        carpetaId:
          carpeta.id
      });


    console.log(
      "RIC29 enviado correctamente a Google Drive:",
      {
        ric29_id,
        nombreArchivo,
        carpeta: carpeta.name
      }
    );


    res.json({
      ok: true,
      mensaje:
        "RIC29 enviado correctamente a Google Drive",

      ric29_id,

      archivo: {
        id:
          archivo.id,

        name:
          archivo.name,

        webViewLink:
          archivo.webViewLink
      },

      carpeta: {
        id:
          carpeta.id,

        nombre:
          carpeta.name
      }

    });

  }

  catch (error) {

    console.error(
      "Error enviando RIC29 a Google Drive:",
      error
    );

    res.status(500).json({
      ok: false,
      error:
        error.message
    });

  }

}
