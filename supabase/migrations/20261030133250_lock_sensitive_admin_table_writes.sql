-- Dreaming Rose: los estados sensibles solo se modifican por RPCs validados.
-- Aplicada al proyecto Supabase nqrolhsojifnaaptibgk.

REVOKE UPDATE ON TABLE public.juegos FROM authenticated;
GRANT UPDATE (categoria, plataforma, clasificacion_edad, categoria_confirmada)
ON TABLE public.juegos TO authenticated;

REVOKE UPDATE ON TABLE public.solicitudes_creador FROM authenticated;
REVOKE UPDATE ON TABLE public.apelaciones FROM authenticated;

DROP POLICY IF EXISTS "solicitudes: admin actualiza" ON public.solicitudes_creador;
DROP POLICY IF EXISTS "apelaciones: admin actualiza" ON public.apelaciones;

-- SEC DEFINER is intentionally limited to these operations because authenticated
-- no longer has direct UPDATE privileges on the sensitive columns/tables.
-- The functions validate auth.uid(), staff role and accepted state transitions,
-- use an empty search_path and qualify every database object.
CREATE OR REPLACE FUNCTION public.admin_resolver_juego(p_juego_id bigint,p_estado text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_actor_role text := private.mi_rol();
    v_title text;
    v_old_status text;
    v_reason text := left(trim(coalesce(p_motivo,'')),1000);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tenés que iniciar sesión.'; END IF;
    IF v_actor_role NOT IN ('moderador','root') THEN RAISE EXCEPTION 'No tenés permisos para moderar publicaciones.'; END IF;
    IF p_estado NOT IN ('pendiente','aprobado','rechazado') THEN RAISE EXCEPTION 'Estado de moderación no válido.'; END IF;
    IF p_estado = 'rechazado' AND length(v_reason) < 10 THEN RAISE EXCEPTION 'Para rechazar una publicación, escribí un motivo de al menos 10 caracteres.'; END IF;
    SELECT j.title,j.estado_moderacion INTO v_title,v_old_status FROM public.juegos j WHERE j.id = p_juego_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No se encontró la publicación.'; END IF;
    IF v_old_status = p_estado THEN RAISE EXCEPTION 'La publicación ya tiene ese estado.'; END IF;
    PERFORM set_config('app.admin_action_reason',v_reason,true);
    UPDATE public.juegos j SET estado_moderacion = p_estado, motivo_revision = CASE WHEN p_estado = 'rechazado' THEN v_reason ELSE NULL END WHERE j.id = p_juego_id;
    RETURN jsonb_build_object('ok',true,'id',p_juego_id,'title',v_title,'estado',p_estado);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_resolver_juego(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolver_juego(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolver_solicitud_creador(p_solicitud_id bigint,p_estado text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_actor_role text := private.mi_rol();
    v_user_id uuid;
    v_reason text := left(trim(coalesce(p_motivo,'')),1000);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tenés que iniciar sesión.'; END IF;
    IF v_actor_role NOT IN ('moderador','root') THEN RAISE EXCEPTION 'No tenés permisos para resolver solicitudes.'; END IF;
    IF p_estado NOT IN ('aprobado','rechazado') THEN RAISE EXCEPTION 'Estado de solicitud no válido.'; END IF;
    IF p_estado = 'rechazado' AND length(v_reason) < 10 THEN RAISE EXCEPTION 'Para rechazar una solicitud, escribí un motivo de al menos 10 caracteres.'; END IF;
    SELECT s.user_id INTO v_user_id FROM public.solicitudes_creador s WHERE s.id=p_solicitud_id AND s.estado='pendiente' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La solicitud no existe o ya fue resuelta.'; END IF;
    PERFORM set_config('app.admin_action_reason',v_reason,true);
    IF p_estado='aprobado' THEN
        UPDATE public.usuarios u SET role='creador' WHERE u.id=v_user_id AND u.role IN ('usuario','creador');
        IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo asignar el rol de creador. La operación fue cancelada.'; END IF;
    END IF;
    UPDATE public.solicitudes_creador s SET estado=p_estado,revisado_por=auth.uid(),revisado_at=now() WHERE s.id=p_solicitud_id AND s.estado='pendiente';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar la solicitud. La operación fue cancelada.'; END IF;
    RETURN jsonb_build_object('ok',true,'estado',p_estado,'user_id',v_user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_resolver_solicitud_creador(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolver_solicitud_creador(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolver_apelacion(p_apelacion_id bigint,p_estado text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
    v_actor_role text := private.mi_rol();
    v_user_id uuid;
    v_reason text := left(trim(coalesce(p_motivo,'')),1000);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tenés que iniciar sesión.'; END IF;
    IF v_actor_role NOT IN ('moderador','root') THEN RAISE EXCEPTION 'No tenés permisos para resolver apelaciones.'; END IF;
    IF p_estado NOT IN ('aprobada','rechazada') THEN RAISE EXCEPTION 'Estado de apelación no válido.'; END IF;
    IF p_estado='rechazada' AND length(v_reason)<10 THEN RAISE EXCEPTION 'Para rechazar una apelación, escribí un motivo de al menos 10 caracteres.'; END IF;
    SELECT a.user_id INTO v_user_id FROM public.apelaciones a WHERE a.id=p_apelacion_id AND a.estado='pendiente' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La apelación no existe o ya fue resuelta.'; END IF;
    PERFORM set_config('app.admin_action_reason',v_reason,true);
    IF p_estado='aprobada' THEN
        UPDATE public.usuarios u SET role='usuario' WHERE u.id=v_user_id AND u.role='banned';
        IF NOT FOUND THEN RAISE EXCEPTION 'El usuario ya no está suspendido. La operación fue cancelada.'; END IF;
    END IF;
    UPDATE public.apelaciones a SET estado=p_estado,revisado_por=auth.uid(),revisado_at=now() WHERE a.id=p_apelacion_id AND a.estado='pendiente';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar la apelación. La operación fue cancelada.'; END IF;
    RETURN jsonb_build_object('ok',true,'estado',p_estado,'user_id',v_user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_resolver_apelacion(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolver_apelacion(bigint,text,text) TO authenticated;
