import pool from "../db.js";
import { obtenerRIC48 } from "../pdf/protocolosConsultas.js";
import { generarRIC48PDF } from "../pdf/ric48PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

export async function guardarRIC48(req, res) {
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
      INSERT INTO ric48 (
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

    const ric48_id = result.rows[0].id;

    if (inspecciones) {
      await client.query(
        `
        INSERT INTO ric48_inspecciones (
          ric48_id, limpieza_exterior, papel_registro,
          estado_cables, observaciones
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          ric48_id,
          inspecciones.limpieza_exterior || null,
          inspecciones.papel_registro || null,
          inspecciones.estado_cables || null,
          inspecciones.observaciones || null
        ]
      );
    }

    for (const item of mediciones || []) {
      await client.query(
        `
        INSERT INTO ric48_mediciones (
          ric48_id, grupo, orden, parametro, valor_nominal,
          medicion, rango_aceptacion, incertidumbre,
          conforme, no_aplica, observaciones
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          ric48_id,
          item.grupo,
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
      mensaje: "RIC 48 guardado correctamente",
      ric48_id
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC48:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC48(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID RIC48 inválido" });
    }

    const datos = await obtenerRIC48(id);
    res.json(datos);
  } catch (error) {
    console.error("Error obteniendo RIC48:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC48(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID RIC48 inválido" });
    }

    const resultado = await generarRIC48PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${resultado.nombreArchivo}"`
    );
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC48:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC48Drive(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, error: "ID RIC48 inválido" });
    }

    const datos = await obtenerRIC48(id);
    const resultadoPDF = await generarRIC48PDF(id);

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
      mensaje: "RIC48 enviado correctamente a Google Drive",
      ric48_id: id,
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
    console.error("Error enviando RIC48 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
