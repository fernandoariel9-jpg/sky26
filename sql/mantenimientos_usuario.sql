-- ============================================================
-- MANTENIMIENTO DE USUARIO - SKY26
-- Etapa 2: estructura para almacenar checklists e historial.
-- Ejecutar una sola vez sobre la base PostgreSQL de Sky26.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mantenimientos_usuario (
    id BIGSERIAL PRIMARY KEY,

    -- Vínculo al equipo y número de serie histórico al momento del registro.
    equipo_id INTEGER NOT NULL
        REFERENCES public.equipos(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    numero_serie TEXT NOT NULL,

    -- Fecha y hora reales del registro.
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Resultado de cada punto del checklist.
    limpieza_ok BOOLEAN NOT NULL,
    integridad_ok BOOLEAN NOT NULL,
    verificacion_funcional_ok BOOLEAN NOT NULL,
    capacitacion_personal_ok BOOLEAN NOT NULL,

    -- Obligatoria desde la aplicación cuando algún punto no es conforme.
    observaciones TEXT,

    -- Trazabilidad del usuario que completa el checklist.
    usuario_nombre TEXT,
    usuario_mail TEXT,

    -- Se completará en la etapa 4 si el checklist genera una tarea.
    tarea_id INTEGER
        REFERENCES public.ric01(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mantenimientos_usuario_equipo_fecha
    ON public.mantenimientos_usuario (equipo_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_mantenimientos_usuario_numero_serie
    ON public.mantenimientos_usuario (numero_serie);

CREATE INDEX IF NOT EXISTS idx_mantenimientos_usuario_tarea
    ON public.mantenimientos_usuario (tarea_id)
    WHERE tarea_id IS NOT NULL;
