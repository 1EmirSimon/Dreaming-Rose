// js/apelaciones.js
import { supabase } from "./supabase.js";

// Se llama desde auth.js cuando detecta que el usuario está baneado.
// Muestra el modal de apelación con el estado correspondiente.
export async function mostrarModalApelacion(userId) {
    const modal = document.getElementById("apelacionModal");
    if (!modal) return;

    modal.classList.add("active");
    document.body.style.overflow = "hidden";

    // Ocultar todos los estados al principio
    document.getElementById("apelacionFormContainer").style.display = "none";
    document.getElementById("apelacionPendiente").style.display = "none";
    document.getElementById("apelacionRechazada").style.display = "none";
    document.getElementById("apelacionAprobada").style.display = "none";

    // Buscar si ya tiene una apelación
    const { data: apelacion, error } = await supabase
        .from('apelaciones')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error("Error consultando apelación:", error);
    }

    if (!apelacion) {
        // No apeló nunca → mostrar formulario
        document.getElementById("apelacionFormContainer").style.display = "block";
    } else if (apelacion.estado === 'pendiente') {
        document.getElementById("apelacionPendiente").style.display = "block";
    } else if (apelacion.estado === 'rechazada') {
        document.getElementById("apelacionRechazada").style.display = "block";
    } else if (apelacion.estado === 'aprobada') {
        document.getElementById("apelacionAprobada").style.display = "block";
    }
}

// Envía la apelación
window.enviarApelacion = async function(event) {
    event.preventDefault();

    const mensaje = document.getElementById("apelacionMensaje")?.value.trim();
    const errorMsg = document.getElementById("apelacionError");
    const btn = document.getElementById("btnApelacionSubmit");

    if (errorMsg) errorMsg.style.display = "none";

    if (!mensaje || mensaje.length < 20) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Contanos un poco más (mínimo 20 caracteres).";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (btn) btn.disabled = true;

    const { error } = await supabase
        .from('apelaciones')
        .insert([{
            user_id: user.id,
            mensaje: mensaje,
            estado: 'pendiente'
        }]);

    if (btn) btn.disabled = false;

    if (error) {
        console.error("Error enviando apelación:", error);
        if (errorMsg) {
            if (error.code === '23505') {
                errorMsg.textContent = "⚠️ Ya enviaste una apelación anteriormente. No podés volver a apelar.";
            } else {
                errorMsg.textContent = "Error al enviar: " + error.message;
            }
            errorMsg.style.display = "block";
        }
        return;
    }

    // Recargar el estado del modal
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    await mostrarModalApelacion(currentUser.id);
};

window.mostrarModalApelacion = mostrarModalApelacion;

// Cierra el modal de apelación y desloguea al usuario.
// Se llama desde el botón "CERRAR SESIÓN" del modal.
window.cerrarApelacionYLogout = async function() {
    const modal = document.getElementById("apelacionModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
    // Pequeña espera para que la animación termine antes de desloguear
    setTimeout(async () => {
        await supabase.auth.signOut();
    }, 200);
};