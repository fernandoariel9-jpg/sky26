import pool from "../db.js";

export async function listarTransferenciasStock(req, res) {
  try {
    const { estado, area } = req.query;
    const condiciones = [];
    const valores = [];

    if (estado) {
      valores.push(String(estado).toUpperCase());
      condiciones.push(`t.estado = $${valores.length}`);
    }

    if (area) {
      valores.push(String(area).toUpperCase());
      condiciones.push(`(UPPER(t.area_origen) = $${valores.length} OR UPPER(t.area_destino) = $${valores.length})`);
    }

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `
      SELECT
        t.*,
        i.codigo,
        i.descripcion,
        i.unidad
      FROM stock_transferencias t
      INNER JOIN stock_items i ON i.id = t.item_id
      ${where}
      ORDER BY t.fecha_solicitud DESC, t.id DESC
      `,
      valores
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al listar transferencias:", error);
    res.status(500).json({ error: "Error al obtener las transferencias" });
  }
}

export async function solicitarTransferenciaStock(req, res) {
  try {
    const {
      item_id,
      cantidad,
      area_origen,
      area_destino,
      solicitado_por_id = null,
      solicitado_por_nombre = null,
      observacion = null
    } = req.body;

    const cantidadNumerica = Number(cantidad);
    const origen = area_origen?.trim().toUpperCase();
    const destino = area_destino?.trim().toUpperCase();

    if (!item_id) return res.status(400).json({ error: "item_id es obligatorio" });
    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor que cero" });
    }
    if (!origen || !destino) {
      return res.status(400).json({ error: "Área origen y destino son obligatorias" });
    }
    if (origen === destino) {
      return res.status(400).json({ error: "El área origen y destino deben ser diferentes" });
    }

    const item = await pool.query(
      `SELECT id FROM stock_items WHERE id = $1 AND activo = TRUE`,
      [item_id]
    );
    if (item.rowCount === 0) {
      return res.status(404).json({ error: "Artículo de stock no encontrado" });
    }

    const existencia = await pool.query(
      `SELECT cantidad FROM stock_existencias WHERE item_id = $1 AND UPPER(area) = $2`,
      [item_id, origen]
    );
    const disponible = existencia.rowCount ? Number(existencia.rows[0].cantidad) : 0;
    if (disponible < cantidadNumerica) {
      return res.status(409).json({ error: "Stock insuficiente en el área origen", disponible });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO stock_transferencias (
        item_id, cantidad, area_origen, area_destino,
        solicitado_por_id, solicitado_por_nombre, observacion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        item_id,
        cantidadNumerica,
        origen,
        destino,
        solicitado_por_id,
        solicitado_por_nombre?.trim() || null,
        observacion?.trim().toUpperCase() || null
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al solicitar transferencia:", error);
    res.status(500).json({ error: "Error al solicitar la transferencia" });
  }
}

export async function resolverTransferenciaStock(req, res) {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const {
      accion,
      aprobado_por_id = null,
      aprobado_por_nombre = null,
      aprobado_por_area = null,
      observacion = null
    } = req.body;

    const accionNormalizada = String(accion || "").toUpperCase();

    if (!["APROBAR", "RECHAZAR"].includes(accionNormalizada)) {
      return res.status(400).json({ error: "accion debe ser APROBAR o RECHAZAR" });
    }

    if (!aprobado_por_id) {
      return res.status(400).json({ error: "El personal que resuelve es obligatorio" });
    }

    const personalResult = await client.query(
      `SELECT id, nombre, area FROM personal WHERE id = $1`,
      [aprobado_por_id]
    );

    if (personalResult.rowCount === 0) {
      return res.status(404).json({ error: "Personal no encontrado" });
    }

    const personalDB = personalResult.rows[0];
    const areaAprobador = String(personalDB.area || aprobado_por_area || "").trim().toUpperCase();
    const nombreAprobador = personalDB.nombre?.trim() || aprobado_por_nombre?.trim() || null;

    if (!areaAprobador) {
      return res.status(400).json({ error: "El personal no tiene un área asignada" });
    }

    await client.query("BEGIN");

    const transferencia = await client.query(
      `SELECT * FROM stock_transferencias WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (transferencia.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Transferencia no encontrada" });
    }

    const t = transferencia.rows[0];

    if (t.estado !== "PENDIENTE") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "La transferencia ya fue resuelta" });
    }

    if (String(t.area_origen || "").trim().toUpperCase() !== areaAprobador) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        error: "Solo el personal del área origen puede aprobar o rechazar esta transferencia"
      });
    }

    if (accionNormalizada === "RECHAZAR") {
      const { rows } = await client.query(
        `
        UPDATE stock_transferencias
        SET estado = 'RECHAZADA',
            aprobado_por_id = $2,
            aprobado_por_nombre = $3,
            observacion = COALESCE($4, observacion),
            fecha_resolucion = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
        `,
        [id, aprobado_por_id, nombreAprobador, observacion?.trim().toUpperCase() || null]
      );

      await client.query("COMMIT");
      return res.json({ ok: true, transferencia: rows[0] });
    }

    const origen = await client.query(
      `
      SELECT id, cantidad
      FROM stock_existencias
      WHERE item_id = $1 AND area = $2
      FOR UPDATE
      `,
      [t.item_id, t.area_origen]
    );

    const disponible = origen.rowCount ? Number(origen.rows[0].cantidad) : 0;
    const cantidad = Number(t.cantidad);

    if (disponible < cantidad) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Stock insuficiente al aprobar la transferencia", disponible });
    }

    await client.query(
      `UPDATE stock_existencias SET cantidad = cantidad - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [cantidad, origen.rows[0].id]
    );

    await client.query(
      `
      INSERT INTO stock_existencias (item_id, area, cantidad, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (item_id, area)
      DO UPDATE SET cantidad = stock_existencias.cantidad + EXCLUDED.cantidad,
                    updated_at = CURRENT_TIMESTAMP
      `,
      [t.item_id, t.area_destino, cantidad]
    );

    await client.query(
      `
      INSERT INTO stock_movimientos (
        item_id, tipo, cantidad, area_origen,
        personal_id, personal_nombre, referencia_tipo, referencia_id, observacion
      ) VALUES ($1, 'TRANSFER_OUT', $2, $3, $4, $5, 'TRANSFERENCIA', $6, $7)
      `,
      [t.item_id, cantidad, t.area_origen, aprobado_por_id, nombreAprobador, t.id, observacion?.trim().toUpperCase() || t.observacion]
    );

    await client.query(
      `
      INSERT INTO stock_movimientos (
        item_id, tipo, cantidad, area_destino,
        personal_id, personal_nombre, referencia_tipo, referencia_id, observacion
      ) VALUES ($1, 'TRANSFER_IN', $2, $3, $4, $5, 'TRANSFERENCIA', $6, $7)
      `,
      [t.item_id, cantidad, t.area_destino, aprobado_por_id, nombreAprobador, t.id, observacion?.trim().toUpperCase() || t.observacion]
    );

    const resuelto = await client.query(
      `
      UPDATE stock_transferencias
      SET estado = 'APROBADA',
          aprobado_por_id = $2,
          aprobado_por_nombre = $3,
          observacion = COALESCE($4, observacion),
          fecha_resolucion = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
      `,
      [id, aprobado_por_id, nombreAprobador, observacion?.trim().toUpperCase() || null]
    );

    await client.query("COMMIT");
    res.json({ ok: true, transferencia: resuelto.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al resolver transferencia:", error);
    res.status(500).json({ error: "Error al resolver la transferencia" });
  } finally {
    client.release();
  }
}
