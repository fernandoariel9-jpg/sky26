import pool from "../db.js";
import { obtenerRIC56 } from "../pdf/protocolosConsultas.js";
import { generarRIC56PDF } from "../pdf/ric56PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

async function asegurarTablasRIC56(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ric56 (
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
    CREATE TABLE IF NOT EXISTS ric56_verificaciones (
      id SERIAL PRIMARY KEY,
      ric56_id INTEGER NOT NULL REFERENCES ric56(id) ON DELETE CASCADE,
      orden INTEGER,
      parametro TEXT,
      estado TEXT,
      observaciones TEXT
    )
  `);
}

export async function guardarRIC56(req, res) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await asegurarTablasRIC56(client);

    const {
      ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
      area, servicio, sub_servicio, encargado, fecha, tecnico,
      en_uso, resultado_general, observaciones, verificaciones
    } = req.body;

    const result = await client.query(`
      INSERT INTO ric56 (
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

    const ric56Id = result.rows[0].id;
    for (const item of verificaciones || []) {
      await client.query(`
        INSERT INTO ric56_verificaciones (ric56_id, orden, parametro, estado, observaciones)
        VALUES ($1,$2,$3,$4,$5)
      `, [ric56Id, item.orden || null, item.nombre || item.parametro || null, item.estado || null, item.observaciones || null]);
    }

    await client.query("COMMIT");
    res.status(201).json({ ok: true, mensaje: "RIC 56 guardado correctamente", ric56_id: ric56Id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC56:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC56(req, res) {
  try {
    await asegurarTablasRIC56();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC56 inválido" });
    res.json(await obtenerRIC56(id));
  } catch (error) {
    console.error("Error obteniendo RIC56:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC56(req, res) {
  try {
    await asegurarTablasRIC56();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC56 inválido" });
    const resultado = await generarRIC56PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${resultado.nombreArchivo}"`);
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC56:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC56Drive(req, res) {
  try {
    await asegurarTablasRIC56();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "ID RIC56 inválido" });
    const datos = await obtenerRIC56(id);
    const resultadoPDF = await generarRIC56PDF(id);
    const carpeta = await obtenerCarpetaRIC29(datos.servicio, datos.sub_servicio);
    const archivo = await subirPDFDrive({ pdf: resultadoPDF.pdf, nombreArchivo: resultadoPDF.nombreArchivo, carpetaId: carpeta.id });
    res.json({ ok: true, mensaje: "RIC56 enviado correctamente a Google Drive", ric56_id: id, archivo, carpeta: { id: carpeta.id, nombre: carpeta.name } });
  } catch (error) {
    console.error("Error enviando RIC56 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
