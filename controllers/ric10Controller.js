import pool from "../db.js";
import { obtenerRIC10, generarRIC10PDF } from "../pdf/ric10PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

async function asegurarTablasRIC10(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ric10 (
      id SERIAL PRIMARY KEY,
      ric01_id INTEGER,
      equipo_id INTEGER,
      numero_serie TEXT,
      descripcion TEXT,
      marca_modelo TEXT,
      area TEXT,
      servicio TEXT,
      sub_servicio TEXT,
      encargado TEXT,
      fecha TIMESTAMP,
      tecnico TEXT,
      resultado_general TEXT,
      observaciones TEXT,
      verificador_equipo TEXT,
      verificador_numero_serie TEXT,
      verificador_certificado TEXT,
      verificador_vigencia DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ric10_verificaciones (
      id SERIAL PRIMARY KEY,
      ric10_id INTEGER NOT NULL REFERENCES ric10(id) ON DELETE CASCADE,
      orden INTEGER,
      parametro TEXT,
      estado TEXT,
      observaciones TEXT
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ric10_mediciones (
      id SERIAL PRIMARY KEY,
      ric10_id INTEGER NOT NULL REFERENCES ric10(id) ON DELETE CASCADE,
      orden INTEGER,
      parametro TEXT,
      referencia TEXT,
      valor TEXT,
      unidad TEXT,
      estado TEXT,
      observaciones TEXT
    )
  `);
}

export async function guardarRIC10(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await asegurarTablasRIC10(client);

    const {
      ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
      area, servicio, sub_servicio, encargado, fecha, tecnico,
      resultado_general, observaciones,
      verificador_equipo, verificador_numero_serie,
      verificador_certificado, verificador_vigencia,
      verificaciones, mediciones
    } = req.body;

    const result = await client.query(`
      INSERT INTO ric10 (
        ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
        area, servicio, sub_servicio, encargado, fecha, tecnico,
        resultado_general, observaciones, verificador_equipo,
        verificador_numero_serie, verificador_certificado, verificador_vigencia
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id
    `, [
      ric01_id || null, equipo_id || null, numero_serie || null,
      descripcion || null, marca_modelo || null, area || null,
      servicio || null, sub_servicio || null, encargado || null,
      fecha || new Date(), tecnico || null, resultado_general || null,
      observaciones || null, verificador_equipo || null,
      verificador_numero_serie || null, verificador_certificado || null,
      verificador_vigencia || null
    ]);

    const ric10Id = result.rows[0].id;

    for (const item of verificaciones || []) {
      await client.query(`
        INSERT INTO ric10_verificaciones (ric10_id, orden, parametro, estado, observaciones)
        VALUES ($1,$2,$3,$4,$5)
      `, [ric10Id, item.orden || null, item.nombre || item.parametro || null, item.estado || null, item.observaciones || null]);
    }

    for (const item of mediciones || []) {
      await client.query(`
        INSERT INTO ric10_mediciones (ric10_id, orden, parametro, referencia, valor, unidad, estado, observaciones)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        ric10Id, item.orden || null, item.parametro || null,
        item.referencia || null, item.valor || null, item.unidad || null,
        item.estado || null, item.observaciones || null
      ]);
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, mensaje: "RIC10 guardado correctamente", ric10_id: ric10Id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC10:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC10(req, res) {
  try {
    await asegurarTablasRIC10();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC10 inválido" });
    res.json(await obtenerRIC10(id));
  } catch (error) {
    console.error("Error obteniendo RIC10:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC10(req, res) {
  try {
    await asegurarTablasRIC10();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC10 inválido" });
    const resultado = await generarRIC10PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${resultado.nombreArchivo}"`);
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC10:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC10Drive(req, res) {
  try {
    await asegurarTablasRIC10();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "ID RIC10 inválido" });

    const datos = await obtenerRIC10(id);
    const resultadoPDF = await generarRIC10PDF(id);
    const carpeta = await obtenerCarpetaRIC29(datos.servicio, datos.sub_servicio);
    const archivo = await subirPDFDrive({ pdf: resultadoPDF.pdf, nombreArchivo: resultadoPDF.nombreArchivo, carpetaId: carpeta.id });

    res.json({
      ok: true,
      mensaje: "RIC10 enviado correctamente a Google Drive",
      ric10_id: id,
      archivo,
      carpeta: { id: carpeta.id, nombre: carpeta.name }
    });
  } catch (error) {
    console.error("Error enviando RIC10 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
