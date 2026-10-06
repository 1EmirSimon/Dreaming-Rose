// js/username.js
import { supabase } from "./supabase.js";

window.openUsernameModal = async function() {
    const modal = document.getElementById("usernameModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
        .from('usuarios')
        .select('username')
        .eq('id', user.id)
        .single();

    const input = document.getElementById("newUsernameInput");
    if (input && profile?.username) input.value = profile.username;
};

window.closeUsernameModal = function() {
    const modal = document.getElementById("usernameModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
    const err = document.getElementById("usernameError");
    const ok = document.getElementById("usernameSuccess");
    if (err) err.style.display = "none";
    if (ok) ok.style.display = "none";
};

window.guardarNuevoUsername = async function(event) {
    event.preventDefault();

    const nuevo = document.getElementById("newUsernameInput")?.value.trim();
    const errorMsg = document.getElementById("usernameError");
    const successMsg = document.getElementById("usernameSuccess");

    if (errorMsg) errorMsg.style.display = "none";
    if (successMsg) successMsg.style.display = "none";

    if (!nuevo || nuevo.length < 3) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ El nombre tiene que tener al menos 3 caracteres.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (nuevo.length > 20) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Máximo 20 caracteres.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(nuevo)) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Solo letras, números, guiones y guiones bajos.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Verificar que no esté en uso
    const { data: existente } = await supabase
        .from('usuarios')
        .select('id')
        .eq('username', nuevo)
        .neq('id', user.id)
        .maybeSingle();

    if (existente) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Ese nombre ya está en uso.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { error: errorPerfil } = await supabase
        .from('usuarios')
        .update({ username: nuevo })
        .eq('id', user.id);

    if (errorPerfil) {
        console.error("Error actualizando perfil:", errorPerfil);
        if (errorMsg) {
            errorMsg.textContent = "Error: " + errorPerfil.message;
            errorMsg.style.display = "block";
        }
        return;
    }

    await supabase.auth.updateUser({ data: { username: nuevo } });

    if (successMsg) {
        successMsg.textContent = "✅ Nombre actualizado. Recargá la página para verlo.";
        successMsg.style.display = "block";
    }

    const badge = document.getElementById("userBadge");
    if (badge) {
        const roleTag = badge.textContent.match(/\[.*\]/)?.[0] || '';
        badge.textContent = `@${nuevo} ${roleTag}`.trim();
    }
};