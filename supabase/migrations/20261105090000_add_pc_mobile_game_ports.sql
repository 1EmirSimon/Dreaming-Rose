-- Dreaming Rose: puertos independientes para PC y móvil.
-- Ejecutar en Supabase SQL Editor antes de desplegar esta versión.
ALTER TABLE public.juegos
  ADD COLUMN IF NOT EXISTS download_url_pc text,
  ADD COLUMN IF NOT EXISTS download_url_mobile text;

-- Conserva los enlaces existentes y los asigna según la plataforma histórica.
UPDATE public.juegos
SET download_url_pc = CASE
      WHEN lower(coalesce(plataforma, '')) IN ('móvil', 'movil', 'mobile', 'android', 'ios') THEN download_url_pc
      ELSE coalesce(download_url_pc, download_url)
    END,
    download_url_mobile = CASE
      WHEN lower(coalesce(plataforma, '')) IN ('móvil', 'movil', 'mobile', 'android', 'ios') THEN coalesce(download_url_mobile, download_url)
      ELSE download_url_mobile
    END
WHERE download_url IS NOT NULL
  AND download_url_pc IS NULL
  AND download_url_mobile IS NULL;

-- El campo histórico download_url se mantiene por compatibilidad con módulos antiguos.
CREATE INDEX IF NOT EXISTS juegos_download_url_pc_idx ON public.juegos (id) WHERE download_url_pc IS NOT NULL;
CREATE INDEX IF NOT EXISTS juegos_download_url_mobile_idx ON public.juegos (id) WHERE download_url_mobile IS NOT NULL;
