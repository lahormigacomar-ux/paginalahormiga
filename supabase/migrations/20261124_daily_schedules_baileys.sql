-- Migración Versionada: Programación Diaria por Audio (WhatsApp Baileys + Gemini Audio)
-- Fecha: 2026-11-24
-- Destino: Supabase PostgreSQL (Única fuente de verdad)

CREATE TABLE IF NOT EXISTS public.daily_schedules (
  id VARCHAR(100) PRIMARY KEY,
  fecha VARCHAR(50) NOT NULL,
  estado VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
  resumen_operativo TEXT,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_schedules_fecha ON public.daily_schedules (fecha);
CREATE INDEX IF NOT EXISTS idx_daily_schedules_estado ON public.daily_schedules (estado);

CREATE TABLE IF NOT EXISTS public.whatsapp_audio_logs (
  id VARCHAR(100) PRIMARY KEY,
  fecha VARCHAR(50) NOT NULL,
  sender_jid VARCHAR(100),
  sender_name VARCHAR(255),
  audio_url TEXT,
  transcripcion TEXT,
  schedule_id VARCHAR(100),
  estado VARCHAR(50) NOT NULL DEFAULT 'PROCESANDO',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_audio_logs_fecha ON public.whatsapp_audio_logs (fecha);
CREATE INDEX IF NOT EXISTS idx_whatsapp_audio_logs_schedule_id ON public.whatsapp_audio_logs (schedule_id);

-- Políticas RLS compatibles con el rol postgres/service/authenticated del backend
ALTER TABLE public.daily_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_audio_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_schedules' AND policyname = 'allow_all_daily_schedules'
  ) THEN
    CREATE POLICY allow_all_daily_schedules ON public.daily_schedules FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_audio_logs' AND policyname = 'allow_all_whatsapp_audio_logs'
  ) THEN
    CREATE POLICY allow_all_whatsapp_audio_logs ON public.whatsapp_audio_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;
