// js/solicitudes.js
import { supabase } from "./supabase.js";

// Abrir el modal y chequear si ya tiene una solicitud pendiente
window.openSolicitudCreador = async function() {
    const modal = document.getElementById("solicitudCreadorModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
    await cargarEstadoSolicitud();
};

window.closeSolicitudCreador = function() {
    const modal = document.getElementById("solicitudCreadorModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
};

// Muestra si ya tiene una solicitud pendiente, aprobada o rechazada
async function cargarEstadoSolicitud() {
    const contenedor = document.getElementById("solicitudEstado");
    const form = document.getElementById("solicitudForm");
    if (!contenedor) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: solicitud, error } = await supabase
        .from('solicitudes_creador')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error consultando la solicitud:", error);
        return;
    }

    if (!solicitud) {
        contenedor.innerHTML = "";
        if (form) form.style.display = "flex";
        return;
    }

    if (solicitud.estado === 'pendiente') {
        contenedor.innerHTML = `<p style="color: #ffb800; font-size: 0.85rem;">⏳ Tu solicitud está pendiente de revisión.</p>`;
        if (form) form.style.display = "none";
    } else if (solicitud.estado === 'aprobado') {
        contenedor.innerHTML = `<p style="color: #2ecc71; font-size: 0.85rem;">✅ ¡Tu solicitud fue aprobada! Ya sos creador.</p>`;
        if (form) form.style.display = "none";
    } else if (solicitud.estado === 'rechazado') {
        contenedor.innerHTML = `<p style="color: #ff4d6d; font-size: 0.85rem;">❌ Tu solicitud fue rechazada. Podés enviar una nueva.</p>`;
        if (form) form.style.display = "flex";
    }
}

// Enviar la solicitud
window.enviarSolicitudCreador = async function(event) {
    event.preventDefault();

    const mensaje = document.getElementById("solicitudMensaje")?.value.trim();
    const errorMsg = document.getElementById("solicitudError");
    const btn = document.getElementById("btnSolicitudSubmit");

    if (errorMsg) errorMsg.style.display = "none";

    if (!mensaje || mensaje.length < 10) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Contanos un poco más (mínimo 10 caracteres).";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Tenés que iniciar sesión.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (btn) btn.disabled = true;

    const { error } = await supabase
        .from('solicitudes_creador')
        .insert([{
            user_id: user.id,
            mensaje: mensaje,
            estado: 'pendiente'
        }]);

    if (btn) btn.disabled = false;

    if (error) {
        console.error("Error enviando solicitud:", error);
        if (errorMsg) {
            errorMsg.textContent = "Error al enviar: " + error.message;
            errorMsg.style.display = "block";
        }
        return;
    }

    document.getElementById("solicitudForm")?.reset();
    await cargarEstadoSolicitud();
};