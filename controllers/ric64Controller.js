import pool from "../db.js";
import { obtenerRIC64 } from "../pdf/protocolosConsultas.js";
import { generarRIC64PDF } from "../pdf/ric64PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

export async function guardarRIC64(req, res) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const {
      ric01_id,
      ric37_id,
      equipo_id,
      numero_serie,
      descripcion,
      marca_modelo,
      area,
      servicio,
      sub_servicio,
      encargado,
      fecha,
      tecnico,
      en_uso,
      resultado_general,
      observaciones,
      verificador_equipo,
      verificador_numero_serie,
      verificador_certificado,
      verificador_vigencia,
      inspecciones,
      temperaturas
    } = req.body;

    const result = await client.query(
      `
      INSERT INTO ric64 (
        ric01_id, ric37_id, equipo_id, numero_serie, descripcion,
        marca_modelo, area, servicio, sub_servicio, encargado,
        fecha, tecnico, en_uso, resultado_general, observaciones,
        verificador_equipo, verificador_numero_serie,
        verificador_certificado, verificador_vigencia
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      )
      RETURNING id
      `,
      [
        ric01_id || null,
        ric37_id || null,
        equipo_id || null,
        numero_serie || null,
        descripcion || null,
        marca_modelo || null,
        area || null,
        servicio || null,
        sub_servicio || null,
        encargado || null,
        fecha || new Date(),
        tecnico || null,
        typeof en_uso === "boolean" ? en_uso : null,
        resultado_general || null,
        observaciones || null,
        verificador_equipo || "MULTIMETRO FLUKE 87V",
        verificador_numero_serie || "14020306",
        verificador_certificado || "CEMEC 54126/25",
        verificador_vigencia || "2026-10-07"
      ]
    );

    const ric64_id = result.rows[0].id;

    if (inspecciones) {
      await client.query(
        `
        INSERT INTO ric64_inspecciones (
          ric64_id, inspeccion_visual, limpieza_exterior,
          limpieza_interior, observaciones
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          ric64_id,
          inspecciones.inspeccion_visual || null,
          inspecciones.limpieza_exterior || null,
          inspecciones.limpieza_interior || null,
          inspecciones.observaciones || null
        ]
      );
    }

    for (const item of temperaturas || []) {
      await client.query(
        `
        INSERT INTO ric64_temperaturas (
          ric64_id, orden, temp_seteada, temp_sensada,
          temp_medida, error_porcentaje, rango_aceptacion,
          conforme, no_aplica, observaciones
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `,
        [
          ric64_id,
          item.orden,
          item.temp_seteada === "" ? null : item.temp_seteada,
          item.temp_sensada === "" ? null : item.temp_sensada,
          item.temp_medida === "" ? null : item.temp_medida,
          item.error_porcentaje === "" || item.error_porcentaje == null ? null : item.error_porcentaje,
          item.rango_aceptacion || "5%",
          item.no_aplica ? null : item.conforme ?? null,
          item.no_aplica ?? false,
          item.observaciones || null
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      mensaje: "RIC64 guardado correctamente",
      ric64_id
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC64:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC64(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC64 inválido" });
    res.json(await obtenerRIC64(id));
  } catch (error) {
    console.error("Error obteniendo RIC64:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC64(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC64 inválido" });
    const resultado = await generarRIC64PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${resultado.nombreArchivo}"`);
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC64:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC64Drive(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "ID RIC64 inválido" });

    const datos = await obtenerRIC64(id);
    const resultadoPDF = await generarRIC64PDF(id);
    const carpeta = await obtenerCarpetaRIC29(datos.servicio, datos.sub_servicio);

    const archivo = await subirPDFDrive({
      pdf: resultadoPDF.pdf,
      nombreArchivo: resultadoPDF.nombreArchivo,
      carpetaId: carpeta.id
    });

    res.json({
      ok: true,
      mensaje: "RIC64 enviado correctamente a Google Drive",
      ric64_id: id,
      archivo: {
        id: archivo.id,
        name: archivo.name,
        webViewLink: archivo.webViewLink
      },
      carpeta: {
        id: carpeta.id,
        nombre: carpeta.name
      }
    });
  } catch (error) {
    console.error("Error enviando RIC64 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
