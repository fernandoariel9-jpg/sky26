import pool from "../db.js";

// ============================================================
// CATÁLOGO
// ============================================================
export async function listarStockItems(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        codigo,
        descripcion,
        categoria,
        unidad,
        stock_minimo,
        activo,
        created_at
      FROM stock_items
      ORDER BY descripcion ASC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Error al listar stock_items:", error);
    res.status(500).json({ error: "Error al obtener el catálogo de stock" });
  }
}

export async function crearStockItem(req, res) {
  try {
    const {
      codigo,
      descripcion,
      categoria = null,
      unidad = "unidad",
      stock_minimo = 0
    } = req.body;

    if (!descripcion?.trim()) {
      return res.status(400).json({ error: "La descripción es obligatoria" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO stock_items (
        codigo,
        descripcion,
        categoria,
        unidad,
        stock_minimo
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        codigo?.trim() || null,
        descripcion.trim(),
        categoria?.trim() || null,
        unidad?.trim() || "unidad",
        stock_minimo
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Ya existe un artículo con ese código" });
    }

    console.error("Error al crear stock_item:", error);
    res.status(500).json({ error: "Error al crear el artículo de stock" });
  }
}

// ============================================================
// EXISTENCIAS
// ============================================================
export async function listarExistencias(req, res) {
  try {
    const { area } = req.query;
    const valores = [];
    let filtroArea = "";

    if (area) {
      valores.push(area);
      filtroArea = `WHERE e.area = $${valores.length}`;
    }

    const { rows } = await pool.query(
      `
      SELECT
        e.id,
        e.item_id,
        i.codigo,
        i.descripcion,
        i.categoria,
        i.unidad,
        i.stock_minimo,
        e.area,
        e.cantidad,
        e.updated_at,
        CASE
          WHEN e.cantidad <= i.stock_minimo THEN TRUE
          ELSE FALSE
        END AS stock_bajo
      FROM stock_existencias e
      INNER JOIN stock_items i ON i.id = e.item_id
      ${filtroArea}
      ORDER BY e.area ASC, i.descripcion ASC
      `,
      valores
    );

    res.json(rows);
  } catch (error) {
    console.error("Error al listar existencias:", error);
    res.status(500).json({ error: "Error al obtener las existencias" });
  }
}

export async function registrarEntradaStock(req, res) {
  const client = await pool.connect();

  try {
    const {
      item_id,
      area,
      cantidad,
      personal_id = null,
      personal_nombre = null,
      observacion = null
    } = req.body;

    const cantidadNumerica = Number(cantidad);

    if (!item_id) {
      return res.status(400).json({ error: "item_id es obligatorio" });
    }

    if (!area?.trim()) {
      return res.status(400).json({ error: "El área es obligatoria" });
    }

    if (!Number.isFinite(cantidadNumerica) || cantidadNumerica <= 0) {
      return res.status(400).json({ error: "La cantidad debe ser mayor que cero" });
    }

    await client.query("BEGIN");

    const item = await client.query(
      `SELECT id FROM stock_items WHERE id = $1 AND activo = TRUE`,
      [item_id]
    );

    if (item.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Artículo de stock no encontrado" });
    }

    const existencia = await client.query(
      `
      INSERT INTO stock_existencias (item_id, area, cantidad, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (item_id, area)
      DO UPDATE SET
        cantidad = stock_existencias.cantidad + EXCLUDED.cantidad,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [item_id, area.trim(), cantidadNumerica]
    );

    const movimiento = await client.query(
      `
      INSERT INTO stock_movimientos (
        item_id,
        tipo,
        cantidad,
        area_destino,
        personal_id,
        personal_nombre,
        observacion
      )
      VALUES ($1, 'ENTRADA', $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        item_id,
        cantidadNumerica,
        area.trim(),
        personal_id,
        personal_nombre?.trim() || null,
        observacion?.trim() || null
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      ok: true,
      existencia: existencia.rows[0],
      movimiento: movimiento.rows[0]
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error al registrar entrada de stock:", error);
    res.status(500).json({ error: "Error al registrar la entrada de stock" });
  } finally {
    client.release();
  }
}
