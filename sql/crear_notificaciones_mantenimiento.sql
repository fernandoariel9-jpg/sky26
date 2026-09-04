-- ============================================================
-- NOTIFICACIONES INTERNAS DE MANTENIMIENTO PREVENTIVO
-- ============================================================

CREATE TABLE IF NOT EXISTS notificaciones_mantenimiento (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  protocolo VARCHAR(20) NOT NULL,
  protocolo_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  numero_serie TEXT,
  descripcion TEXT,
  marca_modelo TEXT,
  servicio TEXT,
  fecha_mantenimiento TIMESTAMP,
  fecha_notificacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resultado TEXT,
  observaciones TEXT,
  link_drive TEXT NOT NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_lectura TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notificaciones_mantenimiento_usuario_protocolo
ON notificaciones_mantenimiento (usuario_id, protocolo, protocolo_id);

CREATE INDEX IF NOT EXISTS ix_notificaciones_mantenimiento_usuario
ON notificaciones_mantenimiento (usuario_id, fecha_notificacion DESC);

CREATE INDEX IF NOT EXISTS ix_notificaciones_mantenimiento_no_leidas
ON notificaciones_mantenimiento (usuario_id, leida, fecha_notificacion DESC);
