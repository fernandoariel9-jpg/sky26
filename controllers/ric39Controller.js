import pool from "../db.js";

import { obtenerRIC39 } from "../pdf/protocolosConsultas.js";
import { generarRIC39PDF } from "../pdf/ric39PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

export async function guardarRIC39(req, res) {
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
      resultado_general,
      observaciones,
      verificador_equipo,
      verificador_numero_serie,
      verificador_etyc,
      verificador_vigencia,
      inspecciones,
      mediciones
    } = req.body;

    const result = await client.query(
      `
      INSERT INTO ric39 (
        ric01_id, ric37_id, equipo_id, numero_serie, descripcion,
        marca_modelo, area, servicio, sub_servicio, encargado,
        fecha, tecnico, resultado_general, observaciones,
        verificador_equipo, verificador_numero_serie,
        verificador_etyc, verificador_vigencia
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
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
        resultado_general || null,
        observaciones || null,
        verificador_equipo || "ANALIZADOR DE MONITORES FLUKE PROSIM 8",
        verificador_numero_serie || "2496025",
        verificador_etyc || null,
        verificador_vigencia || null
      ]
    );

    const ric39_id = result.rows[0].id;

    if (inspecciones) {
      await client.query(
        `
        INSERT INTO ric39_inspecciones (
          ric39_id, limpieza_exterior, estado_baterias,
          estado_cables, aceptacion_visual, observaciones
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          ric39_id,
          inspecciones.limpieza_exterior || null,
          inspecciones.estado_baterias || null,
          inspecciones.estado_cables || null,
          inspecciones.aceptacion_visual || null,
          inspecciones.observaciones || null
        ]
      );
    }

    for (const item of mediciones || []) {
      await client.query(
        `
        INSERT INTO ric39_mediciones (
          ric39_id, escenario, orden, parametro, valor_nominal,
          medicion, rango_aceptacion, incertidumbre,
          conforme, no_aplica, observaciones
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          ric39_id,
          item.escenario,
          item.orden,
          item.parametro,
          item.valor_nominal || null,
          item.medicion || null,
          item.rango_aceptacion || null,
          item.incertidumbre || null,
          item.no_aplica ? null : item.conforme ?? null,
          item.no_aplica ?? false,
          item.observaciones || null
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      mensaje: "RIC 39 guardado correctamente",
      ric39_id
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC39:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC39(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID RIC39 inválido" });
    }

    const datos = await obtenerRIC39(id);
    res.json(datos);
  } catch (error) {
    console.error("Error obteniendo RIC39:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC39(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID RIC39 inválido" });
    }

    const resultado = await generarRIC39PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${resultado.nombreArchivo}"`
    );
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC39:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC39Drive(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "ID RIC39 inválido" });
    }

    const datos = await obtenerRIC39(id);
    const resultadoPDF = await generarRIC39PDF(id);

    const carpeta = await obtenerCarpetaRIC29(
      datos.servicio,
      datos.sub_servicio
    );

    const archivo = await subirPDFDrive({
      pdf: resultadoPDF.pdf,
      nombreArchivo: resultadoPDF.nombreArchivo,
      carpetaId: carpeta.id
    });

    res.json({
      ok: true,
      mensaje: "RIC39 enviado correctamente a Google Drive",
      ric39_id: id,
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
    console.error("Error enviando RIC39 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
