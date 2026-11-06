-- Permite que cada creador actualice solamente los enlaces de sus propios juegos.
-- Evita conceder UPDATE directo sobre public.juegos, que está restringido por seguridad.
CREATE OR REPLACE FUNCTION public.actualizar_ports_juego(
  p_juego_id bigint,
  p_download_url_pc text,
  p_download_url_mobile text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text := private.mi_rol();
  v_game public.juegos%ROWTYPE;
  v_pc text := NULLIF(trim(coalesce(p_download_url_pc, '')), '');
  v_mobile text := NULLIF(trim(coalesce(p_download_url_mobile, '')), '');
  v_legacy text;
  v_platform text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Tenés que iniciar sesión.';
  END IF;
  IF v_role NOT IN ('root', 'moderador', 'creador') THEN
    RAISE EXCEPTION 'No tenés permisos para actualizar ports.';
  END IF;
  IF v_pc IS NULL AND v_mobile IS NULL THEN
    RAISE EXCEPTION 'El juego debe conservar al menos un port.';
  END IF;
  IF v_pc IS NOT NULL AND v_pc !~* '^https://(drive\.google\.com|([a-z0-9-]+\.)*mediafire\.com)(/|$)' THEN
    RAISE EXCEPTION 'El enlace para PC debe ser HTTPS de Google Drive o MediaFire.';
  END IF;
  IF v_mobile IS NOT NULL AND v_mobile !~* '^https://(drive\.google\.com|([a-z0-9-]+\.)*mediafire\.com)(/|$)' THEN
    RAISE EXCEPTION 'El enlace para móvil debe ser HTTPS de Google Drive o MediaFire.';
  END IF;

  SELECT j.* INTO v_game
  FROM public.juegos AS j
  WHERE j.id = p_juego_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la publicación.';
  END IF;
  IF v_role <> 'root' AND v_game.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Solo podés actualizar los ports de tus propias publicaciones.';
  END IF;

  v_legacy := coalesce(v_pc, v_mobile);
  v_platform := CASE WHEN v_pc IS NOT NULL THEN 'PC' ELSE 'Móvil' END;
  UPDATE public.juegos AS j
  SET download_url_pc = v_pc,
      download_url_mobile = v_mobile,
      download_url = v_legacy,
      plataforma = v_platform
  WHERE j.id = p_juego_id;

  RETURN jsonb_build_object(
    'ok', true,
    'download_url_pc', v_pc,
    'download_url_mobile', v_mobile,
    'download_url', v_legacy,
    'plataforma', v_platform
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.actualizar_ports_juego(bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_ports_juego(bigint, text, text) TO authenticated;
