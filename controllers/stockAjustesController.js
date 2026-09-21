import pool from "../db.js";

export async function ajustarExistenciaStock(req, res) {
  const client = await pool.connect();

  try {
    const {
      existencia_id,
      nueva_cantidad,
      personal_id = null,
      personal_nombre = null,
      observacion = null
    } = req.body || {};

    const existenciaId = Number(existencia_id);
    const nuevaCantidad = Number(nueva_cantidad);

    if (!Number.isInteger(existenciaId) || existenciaId <= 0) {
      return res.status(400).json({ error: "existencia_id inválido" });
    }

    if (!Number.isFinite(nuevaCantidad) || nuevaCantidad < 0) {
      return res.status(400).json({ error: "La nueva cantidad debe ser cero o mayor" });
    }

    if (!String(observacion || "").trim()) {
      return res.status(400).json({ error: "Debe indicar el motivo del ajuste" });
    }

    await client.query("BEGIN");

    const actual = await client.query(
      `
      SELECT e.id, e.item_id, e.area, e.cantidad, i.codigo, i.descripcion, i.unidad
      FROM stock_existencias e
      INNER JOIN stock_items i ON i.id = e.item_id
      WHERE e.id = $1
      FOR UPDATE
      `,
      [existenciaId]
    );

    if (actual.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Existencia no encontrada" });
    }

    const fila = actual.rows[0];
    const cantidadAnterior = Number(fila.cantidad);
    const diferencia = nuevaCantidad - cantidadAnterior;

    if (diferencia === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "La nueva cantidad es igual a la existencia actual" });
    }

    const existencia = await client.query(
      `
      UPDATE stock_existencias
      SET cantidad = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
      `,
      [nuevaCantidad, existenciaId]
    );

    const detalle = `AJUSTE DE STOCK: ${cantidadAnterior} -> ${nuevaCantidad}. ${String(observacion).trim()}`;

    const movimiento = await client.query(
      `
      INSERT INTO stock_movimientos (
        item_id,
        tipo,
        cantidad,
        area_origen,
        area_destino,
        personal_id,
        personal_nombre,
        observacion
      )
      VALUES ($1, 'AJUSTE', $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        fila.item_id,
        Math.abs(diferencia),
        diferencia < 0 ? fila.area : null,
        diferencia > 0 ? fila.area : null,
        personal_id,
        personal_nombre?.trim() || null,
        detalle
      ]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      anterior: cantidadAnterior,
      nueva_cantidad: nuevaCantidad,
      diferencia,
      existencia: existencia.rows[0],
      movimiento: movimiento.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al ajustar existencia de stock:", error);
    return res.status(500).json({ error: "Error al ajustar la existencia" });
  } finally {
    client.release();
  }
}
