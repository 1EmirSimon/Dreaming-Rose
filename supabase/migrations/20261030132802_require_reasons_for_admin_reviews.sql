-- Dreaming Rose: motivos obligatorios para rechazos administrativos.
-- Aplicada al proyecto Supabase nqrolhsojifnaaptibgk.

CREATE OR REPLACE FUNCTION public.admin_resolver_solicitud_creador(
    p_solicitud_id bigint,
    p_estado text,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_actor_role text := private.mi_rol();
    v_user_id uuid;
    v_updated_id uuid;
    v_reason text := left(trim(coalesce(p_motivo,'')),1000);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tenés que iniciar sesión.'; END IF;
    IF v_actor_role NOT IN ('moderador','root') THEN RAISE EXCEPTION 'No tenés permisos para resolver solicitudes.'; END IF;
    IF p_estado NOT IN ('aprobado','rechazado') THEN RAISE EXCEPTION 'Estado de solicitud no válido.'; END IF;
    IF p_estado = 'rechazado' AND length(v_reason) < 10 THEN
        RAISE EXCEPTION 'Para rechazar una solicitud, escribí un motivo de al menos 10 caracteres.';
    END IF;

    SELECT s.user_id INTO v_user_id
      FROM public.solicitudes_creador s
     WHERE s.id = p_solicitud_id AND s.estado = 'pendiente'
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La solicitud no existe o ya fue resuelta.'; END IF;

    PERFORM set_config('app.admin_action_reason',v_reason,true);

    IF p_estado = 'aprobado' THEN
        UPDATE public.usuarios u
           SET role = 'creador'
         WHERE u.id = v_user_id AND u.role IN ('usuario','creador')
        RETURNING u.id INTO v_updated_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo asignar el rol de creador. La operación fue cancelada.'; END IF;
    END IF;

    UPDATE public.solicitudes_creador s
       SET estado = p_estado, revisado_por = auth.uid(), revisado_at = now()
     WHERE s.id = p_solicitud_id AND s.estado = 'pendiente';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar la solicitud. La operación fue cancelada.'; END IF;

    RETURN jsonb_build_object('ok',true,'estado',p_estado,'user_id',v_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolver_apelacion(
    p_apelacion_id bigint,
    p_estado text,
    p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_actor_role text := private.mi_rol();
    v_user_id uuid;
    v_updated_id uuid;
    v_reason text := left(trim(coalesce(p_motivo,'')),1000);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Tenés que iniciar sesión.'; END IF;
    IF v_actor_role NOT IN ('moderador','root') THEN RAISE EXCEPTION 'No tenés permisos para resolver apelaciones.'; END IF;
    IF p_estado NOT IN ('aprobada','rechazada') THEN RAISE EXCEPTION 'Estado de apelación no válido.'; END IF;
    IF p_estado = 'rechazada' AND length(v_reason) < 10 THEN
        RAISE EXCEPTION 'Para rechazar una apelación, escribí un motivo de al menos 10 caracteres.';
    END IF;

    SELECT a.user_id INTO v_user_id
      FROM public.apelaciones a
     WHERE a.id = p_apelacion_id AND a.estado = 'pendiente'
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La apelación no existe o ya fue resuelta.'; END IF;

    PERFORM set_config('app.admin_action_reason',v_reason,true);

    IF p_estado = 'aprobada' THEN
        UPDATE public.usuarios u
           SET role = 'usuario'
         WHERE u.id = v_user_id AND u.role = 'banned'
        RETURNING u.id INTO v_updated_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'El usuario ya no está suspendido. La operación fue cancelada.'; END IF;
    END IF;

    UPDATE public.apelaciones a
       SET estado = p_estado, revisado_por = auth.uid(), revisado_at = now()
     WHERE a.id = p_apelacion_id AND a.estado = 'pendiente';
    IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo actualizar la apelación. La operación fue cancelada.'; END IF;

    RETURN jsonb_build_object('ok',true,'estado',p_estado,'user_id',v_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_resolver_solicitud_creador(bigint,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolver_apelacion(bigint,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolver_solicitud_creador(bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolver_apelacion(bigint,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_auditoria_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_actor_role text;
    v_actor_username text;
    v_action text;
    v_target_type text;
    v_target_id text;
    v_target_label text;
    v_reason text;
    v_before jsonb := '{}'::jsonb;
    v_after jsonb := '{}'::jsonb;
BEGIN
    v_actor_role := coalesce(private.mi_rol(),nullif(current_setting('request.jwt.claim.role',true),''),'system');
    IF v_actor_id IS NOT NULL THEN
        SELECT u.username INTO v_actor_username FROM public.usuarios u WHERE u.id = v_actor_id;
    END IF;

    IF TG_TABLE_NAME = 'usuarios' THEN
        IF OLD.role IS NOT DISTINCT FROM NEW.role THEN RETURN NEW; END IF;
        v_action := 'user.role_changed'; v_target_type := 'usuario'; v_target_id := NEW.id::text; v_target_label := NEW.username;
        v_before := jsonb_build_object('role',OLD.role); v_after := jsonb_build_object('role',NEW.role);
        v_reason := nullif(current_setting('app.admin_action_reason',true),'');
    ELSIF TG_TABLE_NAME = 'juegos' AND TG_OP = 'DELETE' THEN
        v_action := 'game.deleted'; v_target_type := 'juego'; v_target_id := OLD.id::text; v_target_label := OLD.title;
        v_before := jsonb_build_object('title',OLD.title,'estado_moderacion',OLD.estado_moderacion,'user_id',OLD.user_id);
    ELSIF TG_TABLE_NAME = 'juegos' THEN
        IF OLD.estado_moderacion IS NOT DISTINCT FROM NEW.estado_moderacion THEN RETURN NEW; END IF;
        v_action := 'game.moderation_changed'; v_target_type := 'juego'; v_target_id := NEW.id::text; v_target_label := NEW.title;
        v_before := jsonb_build_object('estado_moderacion',OLD.estado_moderacion);
        v_after := jsonb_build_object('estado_moderacion',NEW.estado_moderacion,'revisado_por',NEW.revisado_por,'revisado_at',NEW.revisado_at);
        v_reason := nullif(NEW.motivo_revision,'');
    ELSIF TG_TABLE_NAME = 'solicitudes_creador' THEN
        IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN RETURN NEW; END IF;
        v_action := 'creator_request.resolved'; v_target_type := 'solicitud_creador'; v_target_id := NEW.id::text;
        SELECT u.username INTO v_target_label FROM public.usuarios u WHERE u.id = NEW.user_id;
        v_before := jsonb_build_object('estado',OLD.estado);
        v_after := jsonb_build_object('estado',NEW.estado,'user_id',NEW.user_id,'revisado_por',NEW.revisado_por,'revisado_at',NEW.revisado_at);
        v_reason := nullif(current_setting('app.admin_action_reason',true),'');
    ELSIF TG_TABLE_NAME = 'apelaciones' THEN
        IF OLD.estado IS NOT DISTINCT FROM NEW.estado THEN RETURN NEW; END IF;
        v_action := 'appeal.resolved'; v_target_type := 'apelacion'; v_target_id := NEW.id::text;
        SELECT u.username INTO v_target_label FROM public.usuarios u WHERE u.id = NEW.user_id;
        v_before := jsonb_build_object('estado',OLD.estado);
        v_after := jsonb_build_object('estado',NEW.estado,'user_id',NEW.user_id,'revisado_por',NEW.revisado_por,'revisado_at',NEW.revisado_at);
        v_reason := nullif(current_setting('app.admin_action_reason',true),'');
    ELSE
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    INSERT INTO public.admin_audit_log(
        actor_id,actor_username,actor_role,action_key,target_type,target_id,
        target_label,reason,before_data,after_data
    ) VALUES (
        v_actor_id,v_actor_username,v_actor_role,v_action,v_target_type,v_target_id,
        v_target_label,v_reason,coalesce(v_before,'{}'::jsonb),coalesce(v_after,'{}'::jsonb)
    );
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_auditoria_admin() FROM PUBLIC, anon, authenticated;

-- Legacy clients can still approve, but rejections require the new reason-aware RPC.
CREATE OR REPLACE FUNCTION public.resolver_solicitud_creador(p_solicitud_id bigint,p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
    IF p_estado = 'rechazado' THEN
        RAISE EXCEPTION 'Actualizá el panel: ahora se requiere motivo para rechazar solicitudes.';
    END IF;
    RETURN public.admin_resolver_solicitud_creador(p_solicitud_id,p_estado,'');
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolver_apelacion(p_apelacion_id bigint,p_estado text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
    IF p_estado = 'rechazada' THEN
        RAISE EXCEPTION 'Actualizá el panel: ahora se requiere motivo para rechazar apelaciones.';
    END IF;
    RETURN public.admin_resolver_apelacion(p_apelacion_id,p_estado,'');
END;
$function$;

REVOKE ALL ON FUNCTION public.resolver_solicitud_creador(bigint,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_apelacion(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_solicitud_creador(bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_apelacion(bigint,text) TO authenticated;
