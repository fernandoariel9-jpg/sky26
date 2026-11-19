-- AU CARDIO: snapshot del último mantenimiento de usuario y estado pendiente por cuatro etapas.
-- Ejecutar en PostgreSQL/Render antes de probar la nueva versión del backend.
ALTER TABLE public.au_cardio DROP CONSTRAINT IF EXISTS au_cardio_resultado_general_check;
ALTER TABLE public.au_cardio ADD CONSTRAINT au_cardio_resultado_general_check CHECK (resultado_general IN ('CONFORME', 'NO CONFORME', 'PENDIENTE'));
ALTER TABLE public.au_cardio
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_id INTEGER,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_fecha TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_limpieza_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_integridad_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_verificacion_funcional_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_capacitacion_personal_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_observaciones TEXT,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_nombre TEXT,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_mail TEXT,
  ADD COLUMN IF NOT EXISTS mantenimiento_usuario_tarea_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_au_cardio_mantenimiento_usuario_id ON public.au_cardio(mantenimiento_usuario_id);
