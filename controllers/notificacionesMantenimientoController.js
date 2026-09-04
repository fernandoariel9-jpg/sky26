import pool from "../db.js";

// ============================================================
// NORMALIZAR SERVICIO
// Permite comparar, por ejemplo: "Imágenes", "IMAGENES" e "imagenes"
// ============================================================
function normalizarServicioSQL(campo) {
  return `translate(lower(trim(${campo})), 'áéíóúüñ', 'aeiouun')`;
}

// ============================================================
// CREAR NOTIFICACIONES DE MANTENIMIENTO
// Uso genérico para RIC29, RIC37, RIC44 y futuros protocolos.
// Se llama solamente después de que el PDF fue subido a Drive.
// ============================================================
export async function crearNotificacionesMantenimiento({
  protocolo,
  protocoloId,
  equipoId,
  fechaMantenimiento,
  resultado,
  observaciones,
  linkDrive
}) {
  if (!protocolo || !protocoloId || !equipoId || !linkDrive) {
    throw new Error("Datos insuficientes para crear la notificación de mantenimiento");
  }

  const equipoResult = await pool.query(
    `
    SELECT
      id,
      numero_serie,
      descripcion,
      marca_modelo,
      servicio
    FROM equipos
    WHERE id = $1
    LIMIT 1
    `,
    [equipoId]
  );

  if (!equipoResult.rows.length) {
    throw new Error(`Equipo no encontrado: ${equipoId}`);
  }

  const equipo = equipoResult.rows[0];

  if (!equipo.servicio) {
    console.warn(`Equipo ${equipoId} sin servicio. No se generaron notificaciones.`);
    return { creadas: 0, usuarios: [] };
  }

  const servicioEquipo = normalizarServicioSQL("e.servicio");
  const servicioUsuario = normalizarServicioSQL("u.servicio");

  const usuariosResult = await pool.query(
    `
    SELECT u.id, u.nombre, u.mail, u.servicio
    FROM usuarios u
    CROSS JOIN equipos e
    WHERE e.id = $1
      AND u.servicio IS NOT NULL
      AND ${servicioUsuario} = ${servicioEquipo}
    ORDER BY u.nombre
    `,
    [equipoId]
  );

  if (!usuariosResult.rows.length) {
    console.warn(
      `No se encontraron usuarios para el servicio del equipo ${equipoId}: ${equipo.servicio}`
    );
    return { creadas: 0, usuarios: [] };
  }

  const creados = [];

  for (const usuario of usuariosResult.rows) {
    const result = await pool.query(
      `
      INSERT INTO notificaciones_mantenimiento (
        usuario_id,
        protocolo,
        protocolo_id,
        equipo_id,
        numero_serie,
        descripcion,
        marca_modelo,
        servicio,
        fecha_mantenimiento,
        fecha_notificacion,
        resultado,
        observaciones,
        link_drive,
        leida,
        fecha_lectura
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP,$10,$11,$12,false,NULL
      )
      ON CONFLICT (usuario_id, protocolo, protocolo_id)
      DO UPDATE SET
        link_drive = EXCLUDED.link_drive,
        fecha_notificacion = EXCLUDED.fecha_notificacion,
        resultado = EXCLUDED.resultado,
        observaciones = EXCLUDED.observaciones
      RETURNING id
      `,
      [
        usuario.id,
        protocolo,
        protocoloId,
        equipo.id,
        equipo.numero_serie || null,
        equipo.descripcion || null,
        equipo.marca_modelo || null,
        equipo.servicio || null,
        fechaMantenimiento || null,
        resultado || null,
        observaciones || null,
        linkDrive
      ]
    );

    creados.push({
      id: result.rows[0].id,
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      mail: usuario.mail
    });
  }

  return {
    creadas: creados.length,
    usuarios: creados
  };
}

// ============================================================
// LISTAR NOTIFICACIONES DE UN USUARIO
// ============================================================
export async function listarNotificacionesMantenimiento(req, res) {
  try {
    const usuarioId = Number(req.query.usuario_id);

    if (!Number.isInteger(usuarioId)) {
      return res.status(400).json({
        ok: false,
        error: "usuario_id inválido"
      });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        protocolo,
        protocolo_id,
        equipo_id,
        numero_serie,
        descripcion,
        marca_modelo,
        servicio,
        fecha_mantenimiento,
        fecha_notificacion,
        resultado,
        observaciones,
        link_drive,
        leida,
        fecha_lectura
      FROM notificaciones_mantenimiento
      WHERE usuario_id = $1
      ORDER BY fecha_notificacion DESC, id DESC
      `,
      [usuarioId]
    );

    const noLeidas = rows.filter((n) => !n.leida).length;

    res.json({
      ok: true,
      total: rows.length,
      no_leidas: noLeidas,
      notificaciones: rows
    });
  } catch (error) {
    console.error("Error listando notificaciones de mantenimiento:", error);
    res.status(500).json({
      ok: false,
      error: "Error obteniendo notificaciones"
    });
  }
}

// ============================================================
// MARCAR UNA NOTIFICACIÓN COMO LEÍDA
// ============================================================
export async function marcarNotificacionMantenimientoLeida(req, res) {
  try {
    const id = Number(req.params.id);
    const usuarioId = Number(req.body.usuario_id);

    if (!Number.isInteger(id) || !Number.isInteger(usuarioId)) {
      return res.status(400).json({
        ok: false,
        error: "Datos inválidos"
      });
    }

    const { rows } = await pool.query(
      `
      UPDATE notificaciones_mantenimiento
      SET
        leida = true,
        fecha_lectura = COALESCE(fecha_lectura, CURRENT_TIMESTAMP)
      WHERE id = $1
        AND usuario_id = $2
      RETURNING id, leida, fecha_lectura
      `,
      [id, usuarioId]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        error: "Notificación no encontrada"
      });
    }

    res.json({
      ok: true,
      notificacion: rows[0]
    });
  } catch (error) {
    console.error("Error marcando notificación como leída:", error);
    res.status(500).json({
      ok: false,
      error: "Error actualizando notificación"
    });
  }
}

// ============================================================
// MARCAR TODAS COMO LEÍDAS
// ============================================================
export async function marcarTodasNotificacionesMantenimientoLeidas(req, res) {
  try {
    const usuarioId = Number(req.body.usuario_id);

    if (!Number.isInteger(usuarioId)) {
      return res.status(400).json({
        ok: false,
        error: "usuario_id inválido"
      });
    }

    const result = await pool.query(
      `
      UPDATE notificaciones_mantenimiento
      SET
        leida = true,
        fecha_lectura = COALESCE(fecha_lectura, CURRENT_TIMESTAMP)
      WHERE usuario_id = $1
        AND leida = false
      `,
      [usuarioId]
    );

    res.json({
      ok: true,
      actualizadas: result.rowCount
    });
  } catch (error) {
    console.error("Error marcando todas las notificaciones como leídas:", error);
    res.status(500).json({
      ok: false,
      error: "Error actualizando notificaciones"
    });
  }
}
