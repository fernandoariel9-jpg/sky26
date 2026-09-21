-- =====================================================
-- RIC64 - VERIFICACION DE BAÑO TERMOSTATICO
-- Modelo corregido
-- =====================================================

CREATE TABLE IF NOT EXISTS ric64 (
  id SERIAL PRIMARY KEY,
  ric01_id INTEGER REFERENCES ric01(id) ON DELETE SET NULL,
  equipo_id INTEGER REFERENCES equipos(id) ON DELETE SET NULL,
  numero_serie TEXT,
  descripcion TEXT,
  marca_modelo TEXT,
  area TEXT,
  servicio TEXT,
  sub_servicio TEXT,
  encargado TEXT,
  fecha TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'),
  tecnico TEXT,
  resultado_general TEXT,
  observaciones TEXT,
  verificador_equipo TEXT,
  verificador_numero_serie TEXT,
  verificador_certificado TEXT,
  verificador_vigencia DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
);

CREATE INDEX IF NOT EXISTS idx_ric64_ric01_id ON ric64(ric01_id);
CREATE INDEX IF NOT EXISTS idx_ric64_equipo_id ON ric64(equipo_id);
CREATE INDEX IF NOT EXISTS idx_ric64_numero_serie ON ric64(numero_serie);

CREATE TABLE IF NOT EXISTS ric64_inspecciones (
  id SERIAL PRIMARY KEY,
  ric64_id INTEGER NOT NULL REFERENCES ric64(id) ON DELETE CASCADE,
  inspeccion_visual TEXT,
  limpieza_exterior TEXT,
  limpieza_interior TEXT,
  observaciones TEXT
);

CREATE INDEX IF NOT EXISTS idx_ric64_inspecciones_ric64_id
  ON ric64_inspecciones(ric64_id);

CREATE TABLE IF NOT EXISTS ric64_temperaturas (
  id SERIAL PRIMARY KEY,
  ric64_id INTEGER NOT NULL REFERENCES ric64(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL,
  temp_seteada NUMERIC,
  temp_sensada NUMERIC,
  temp_medida NUMERIC,
  rango_min NUMERIC,
  rango_max NUMERIC,
  rango_aceptacion TEXT,
  conforme BOOLEAN,
  no_aplica BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones TEXT
);

-- Compatibilidad si ya se ejecutó una versión anterior del esquema.
ALTER TABLE ric64_temperaturas
  ADD COLUMN IF NOT EXISTS rango_min NUMERIC;

ALTER TABLE ric64_temperaturas
  ADD COLUMN IF NOT EXISTS rango_max NUMERIC;

ALTER TABLE ric64_temperaturas
  ADD COLUMN IF NOT EXISTS rango_aceptacion TEXT;

CREATE INDEX IF NOT EXISTS idx_ric64_temperaturas_ric64_id
  ON ric64_temperaturas(ric64_id, orden);
