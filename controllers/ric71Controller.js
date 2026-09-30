import pool from "../db.js";
import { obtenerRIC71, generarRIC71PDF } from "../pdf/ric71PDF.js";
import { obtenerCarpetaRIC29, subirPDFDrive } from "../googleDrive.js";

async function asegurarTablasRIC71(client = pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ric71 (
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
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ric71_acciones (
      id SERIAL PRIMARY KEY,
      ric71_id INTEGER NOT NULL REFERENCES ric71(id) ON DELETE CASCADE,
      orden INTEGER,
      parametro TEXT,
      estado TEXT,
      observaciones TEXT
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ric71_verificaciones (
      id SERIAL PRIMARY KEY,
      ric71_id INTEGER NOT NULL REFERENCES ric71(id) ON DELETE CASCADE,
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

export async function guardarRIC71(req, res) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await asegurarTablasRIC71(client);

    const {
      ric01_id,
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
      acciones,
      verificaciones
    } = req.body;

    const ric01Id = Number(ric01_id);
    if (!Number.isInteger(ric01Id) || ric01Id <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "ric01_id inválido" });
    }

    // Evita duplicados aun si llegan dos solicitudes simultáneas.
    await client.query("SELECT pg_advisory_xact_lock($1)", [710000000 + ric01Id]);

    const existente = await client.query(
      `SELECT id FROM ric71 WHERE ric01_id = $1 ORDER BY id ASC LIMIT 1`,
      [ric01Id]
    );

    if (existente.rows.length > 0) {
      const ric71IdExistente = existente.rows[0].id;
      await client.query("COMMIT");
      return res.status(200).json({
        ok: true,
        mensaje: "RIC71 ya estaba guardado",
        ric71_id: ric71IdExistente,
        existente: true
      });
    }

    const result = await client.query(`
      INSERT INTO ric71 (
        ric01_id, equipo_id, numero_serie, descripcion, marca_modelo,
        area, servicio, sub_servicio, encargado, fecha, tecnico,
        resultado_general, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id
    `, [
      ric01Id,
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
      observaciones || null
    ]);

    const ric71Id = result.rows[0].id;

    for (const item of acciones || []) {
      await client.query(`
        INSERT INTO ric71_acciones (ric71_id, orden, parametro, estado, observaciones)
        VALUES ($1,$2,$3,$4,$5)
      `, [
        ric71Id,
        item.orden || null,
        item.nombre || item.parametro || null,
        item.estado || null,
        item.observaciones || null
      ]);
    }

    for (const item of verificaciones || []) {
      await client.query(`
        INSERT INTO ric71_verificaciones (
          ric71_id, orden, parametro, referencia, valor, unidad, estado, observaciones
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        ric71Id,
        item.orden || null,
        item.parametro || null,
        item.referencia || null,
        item.valor || null,
        item.unidad || null,
        item.estado || null,
        item.observaciones || null
      ]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      mensaje: "RIC71 guardado correctamente",
      ric71_id: ric71Id
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error guardando RIC71:", error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    client.release();
  }
}

export async function obtenerDetalleRIC71(req, res) {
  try {
    await asegurarTablasRIC71();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC71 inválido" });
    res.json(await obtenerRIC71(id));
  } catch (error) {
    console.error("Error obteniendo RIC71:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function generarPDFRIC71(req, res) {
  try {
    await asegurarTablasRIC71();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID RIC71 inválido" });

    const resultado = await generarRIC71PDF(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${resultado.nombreArchivo}"`);
    res.send(resultado.pdf);
  } catch (error) {
    console.error("Error generando PDF RIC71:", error);
    res.status(500).json({ error: error.message });
  }
}

export async function enviarRIC71Drive(req, res) {
  try {
    await asegurarTablasRIC71();
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "ID RIC71 inválido" });

    const datos = await obtenerRIC71(id);
    const resultadoPDF = await generarRIC71PDF(id);
    const carpeta = await obtenerCarpetaRIC29(datos.servicio, datos.sub_servicio);
    const archivo = await subirPDFDrive({
      pdf: resultadoPDF.pdf,
      nombreArchivo: resultadoPDF.nombreArchivo,
      carpetaId: carpeta.id
    });

    res.json({
      ok: true,
      mensaje: "RIC71 enviado correctamente a Google Drive",
      ric71_id: id,
      archivo,
      carpeta: { id: carpeta.id, nombre: carpeta.name }
    });
  } catch (error) {
    console.error("Error enviando RIC71 a Drive:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
}
