import pool from "../db.js";
import { obtenerRIC59, generarRIC59PDF } from "../pdf/ric59PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

async function asegurarTablasRIC59(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ric59 (
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
      en_uso BOOLEAN,
      resultado_general TEXT,
      observaciones TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ric59_verificaciones (
      id SERIAL PRIMARY KEY,
      ric59_id INTEGER NOT NULL REFERENCES ric59(id) ON DELETE CASCADE,
      orden INTEGER,
      parametro TEXT,
      estado TEXT,
      observaciones TEXT
    )
  `);
}

export async function guardarRIC59(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await asegurarTablasRIC59(client);

    const {
      ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
      area, servicio, sub_servicio, encargado, fecha, tecnico,
      en_uso, resultado_general, observaciones, verificaciones
    } = req.body;

    const result = await client.query(`
      INSERT INTO ric59 (
        ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
        area, servicio, sub_servicio, encargado, fecha, tecnico,
        en_uso, resultado_general, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    `, [
      ric01_id || null, equipo_id || null, numero_serie || null,
      descripcion || null, marca_modelo || null, area || null,
      servicio || null, sub_servicio || null, encargado || null,
      fecha || new Date(), tecnico || null,
      typeof en_uso === "boolean" ? en_uso : null,
      resultado_general || null, observaciones || null
    ]);

    const ric59Id = result.rows[0].id;

    for (const item of verificaciones || []) {
      await client.query(`
        INSERT INTO ric59_verificaciones (ric59_id, orden, parametro, estado, observaciones)
        VALUES ($1,$2,$3,$4,$5)
      `, [ric59Id, item.orden || null, item.nombre || item.parametro || null, item.estado || null, item.observaciones || null]);
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, mensaje: "RIC59 guardado correctamente", ric59_id: ric59Id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC59:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC59(req, res) {
  try {
    await asegurarTablasRIC59();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC59 inválido" });
    res.json(await obtenerRIC59(id));
  } catch (error) {
    console.error("Error obteniendo RIC59:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC59(req, res) {
  try {
    await asegurarTablasRIC59();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC59 inválido" });
    const resultado = await generarRIC59PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${resultado.nombreArchivo}"`);
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC59:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC59Drive(req, res) {
  try {
    await asegurarTablasRIC59();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "ID RIC59 inválido" });

    const datos = await obtenerRIC59(id);
    const resultadoPDF = await generarRIC59PDF(id);
    const carpeta = await obtenerCarpetaRIC29(datos.servicio, datos.sub_servicio);
    const archivo = await subirPDFDrive({
      pdf: resultadoPDF.pdf,
      nombreArchivo: resultadoPDF.nombreArchivo,
      carpetaId: carpeta.id
    });

    res.json({
      ok: true,
      mensaje: "RIC59 enviado correctamente a Google Drive",
      ric59_id: id,
      archivo,
      carpeta: { id: carpeta.id, nombre: carpeta.name }
    });
  } catch (error) {
    console.error("Error enviando RIC59 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
