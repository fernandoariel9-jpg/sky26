CREATE TABLE IF NOT EXISTS impresiones (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(30) NOT NULL DEFAULT 'pdf',
    impresora VARCHAR(50) NOT NULL,
    documento_url TEXT,
    datos JSONB,
    copias INTEGER NOT NULL DEFAULT 1,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    solicitado_por VARCHAR(150),
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_inicio TIMESTAMP,
    fecha_impresion TIMESTAMP,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_impresiones_estado_id
ON impresiones (estado, id);

CREATE TABLE IF NOT EXISTS servidores_impresion (
    id SERIAL PRIMARY KEY,
    equipo VARCHAR(100) NOT NULL UNIQUE,
    version VARCHAR(50),
    ultima_conexion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
