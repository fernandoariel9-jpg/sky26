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
