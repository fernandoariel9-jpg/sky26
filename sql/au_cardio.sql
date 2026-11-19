-- =====================================================
-- AU CARDIO - APTITUD DE USO DE CARDIODESFIBRILADORES
-- Ejecutar una sola vez en PostgreSQL (Render).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.au_cardio (
  id SERIAL PRIMARY KEY,
  ric01_id INTEGER REFERENCES public.ric01(id) ON DELETE SET NULL,
  equipo_id INTEGER NOT NULL REFERENCES public.equipos(id) ON DELETE RESTRICT,
  numero_serie TEXT NOT NULL,
  descripcion TEXT,
  marca_modelo TEXT,
  area TEXT,
  servicio TEXT,
  fecha TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'),
  personal_id INTEGER REFERENCES public.personal(id) ON DELETE SET NULL,
  tecnico TEXT NOT NULL,
  resultado_general TEXT NOT NULL CHECK (resultado_general IN ('CONFORME', 'NO CONFORME')),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')
);

CREATE INDEX IF NOT EXISTS idx_au_cardio_equipo_id ON public.au_cardio(equipo_id);
CREATE INDEX IF NOT EXISTS idx_au_cardio_ric01_id ON public.au_cardio(ric01_id);
CREATE INDEX IF NOT EXISTS idx_au_cardio_fecha ON public.au_cardio(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_au_cardio_numero_serie ON public.au_cardio(numero_serie);

CREATE TABLE IF NOT EXISTS public.au_cardio_mediciones (
  id SERIAL PRIMARY KEY,
  au_cardio_id INTEGER NOT NULL REFERENCES public.au_cardio(id) ON DELETE CASCADE,
  grupo TEXT NOT NULL,
  orden INTEGER NOT NULL,
  parametro TEXT NOT NULL,
  valor_nominal TEXT,
  medicion TEXT,
  unidad TEXT,
  rango_aceptacion TEXT,
  conforme BOOLEAN NOT NULL,
  observaciones TEXT
);

CREATE INDEX IF NOT EXISTS idx_au_cardio_mediciones_padre
  ON public.au_cardio_mediciones(au_cardio_id, grupo, orden);
