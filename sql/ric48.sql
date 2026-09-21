-- =====================================================
-- RIC48 - VERIFICACION DE ELECTROCARDIOGRAFOS
-- =====================================================

CREATE TABLE IF NOT EXISTS ric48 (
  id SERIAL PRIMARY KEY,
  ric01_id INTEGER REFERENCES ric01(id) ON DELETE SET NULL,
  ric37_id INTEGER REFERENCES ric37(id) ON DELETE SET NULL,
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
  verificador_etyc DATE,
  verificador_vigencia DATE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
);

CREATE INDEX IF NOT EXISTS idx_ric48_ric01_id ON ric48(ric01_id);
CREATE INDEX IF NOT EXISTS idx_ric48_equipo_id ON ric48(equipo_id);
CREATE INDEX IF NOT EXISTS idx_ric48_numero_serie ON ric48(numero_serie);

CREATE TABLE IF NOT EXISTS ric48_inspecciones (
  id SERIAL PRIMARY KEY,
  ric48_id INTEGER NOT NULL REFERENCES ric48(id) ON DELETE CASCADE,
  limpieza_exterior TEXT,
  papel_registro TEXT,
  estado_cables TEXT,
  observaciones TEXT
);

CREATE INDEX IF NOT EXISTS idx_ric48_inspecciones_ric48_id
  ON ric48_inspecciones(ric48_id);

CREATE TABLE IF NOT EXISTS ric48_mediciones (
  id SERIAL PRIMARY KEY,
  ric48_id INTEGER NOT NULL REFERENCES ric48(id) ON DELETE CASCADE,
  grupo TEXT NOT NULL,
  orden INTEGER NOT NULL,
  parametro TEXT NOT NULL,
  valor_nominal TEXT,
  medicion TEXT,
  rango_aceptacion TEXT,
  incertidumbre TEXT,
  conforme BOOLEAN,
  no_aplica BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones TEXT
);

CREATE INDEX IF NOT EXISTS idx_ric48_mediciones_ric48_id
  ON ric48_mediciones(ric48_id);

CREATE INDEX IF NOT EXISTS idx_ric48_mediciones_grupo
  ON ric48_mediciones(ric48_id, grupo, orden);
