import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const ALLOWED_ADMIN_ROLES = ['moderador', 'root'];
let currentAdminRole = null;
let currentAdminId = null;

export async function openAdminModal() {
    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            alert("⚠️ Tenés que iniciar sesión primero.");
            return;
        }

        const { data: profile, error: profileError } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', user.id)
            .single();

        const myRole = (profile?.role || '').toLowerCase();

        if (profileError || !ALLOWED_ADMIN_ROLES.includes(myRole)) {
            console.error("No se pudo verificar el rol:", profileError);
            alert("❌ No tenés permisos para acceder al panel de administración.");
            return;
        }

        currentAdminRole = myRole;
        currentAdminId = user.id;

        const modal = document.getElementById("adminModal");
        if (modal) {
            modal.classList.add("active");
            document.body.style.overflow = "hidden";
            await loadUsersList(currentAdminRole);
        }
    } catch (err) {
        console.error("Error abriendo el panel de admin:", err);
        alert("⚠️ Ocurrió un error al abrir el panel. Mirá la consola (F12) para más detalle.");
    }
}

export function closeAdminModal() {
    const modal = document.getElementById("adminModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
}

async function loadUsersList(currentRole) {
    const tbody = document.getElementById("adminUsersList");
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='4'>Cargando usuarios...</td></tr>";

    const isRoot = currentRole === 'root';

    const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('id, username, email, role')
        .order('username', { ascending: true });

    if (error) {
        console.error("Error al obtener usuarios:", error);
        tbody.innerHTML = "<tr><td colspan='4'>Error al cargar la lista de usuarios.</td></tr>";
        return;
    }

    tbody.innerHTML = "";

    usuarios.forEach(userItem => {
        const tr = document.createElement("tr");
        const currentRole = (userItem.role || 'usuario').toLowerCase();

        // Reglas para bloquear la edición del rol:
        //   - No puedo cambiar mi propio rol
        //   - Un root no puede degradar a otro root
        //   - Un moderador no puede tocar a un root
        const esMiFila = userItem.id === currentAdminId;
        const usuarioEsRoot = currentRole === 'root';

        let puedeEditar = true;
        let motivoBloqueo = "";

        if (esMiFila) {
            puedeEditar = false;
            motivoBloqueo = "No podés cambiar tu propio rol";
        } else if (usuarioEsRoot && !isRoot) {
            puedeEditar = false;
            motivoBloqueo = "Solo otro root puede cambiar a un root";
        } else if (usuarioEsRoot && isRoot) {
            puedeEditar = false;
            motivoBloqueo = "No se puede degradar a otro root";
        }

                tr.innerHTML = `
            <td><strong>@${escapeHTML(userItem.username) || 'sin_nombre'}</strong></td>
            <td>${escapeHTML(userItem.email) || 'N/A'}</td>
            <td><span class="badge-role">${currentRole.toUpperCase()}</span></td>
            <td>
                ${
                    puedeEditar
                        ? `
                            <select class="role-select" onchange="changeUserRole('${userItem.id}', this.value)">
                                <option value="usuario" ${currentRole === 'usuario' ? 'selected' : ''}>Usuario</option>
                                <option value="creador" ${currentRole === 'creador' ? 'selected' : ''}>Creador</option>
                                <option value="moderador" ${currentRole === 'moderador' ? 'selected' : ''}>Moderador</option>
                                ${isRoot ? `<option value="root" ${currentRole === 'root' ? 'selected' : ''}>Root</option>` : ''}
                                <option value="banned" ${currentRole === 'banned' ? 'selected' : ''}>⛔ Banear</option>
                            </select>
                        `
                        : `<span style="color: #666; font-size: 0.75rem;">${motivoBloqueo}</span>`
                }
            </td>
        `;

        tbody.appendChild(tr);
    });
}

export async function changeUserRole(userId, newRole) {
    try {
        const { error } = await supabase
            .from('usuarios')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) throw error;

        alert(`✅ Rol actualizado a [${newRole.toUpperCase()}] exitosamente.`);
        await loadUsersList(currentAdminRole);
    } catch (err) {
        console.error("Error cambiando el rol:", err);
        alert("⚠️ No se pudo cambiar el rol. Verifica las políticas RLS en Supabase.");
    }
}

window.mostrarTabAdmin = function(tab) {
    const tabUsuarios = document.getElementById("tabContentUsuarios");
    const tabSolicitudes = document.getElementById("tabContentSolicitudes");
    const btnUsuarios = document.getElementById("tabAdminUsuarios");
    const btnSolicitudes = document.getElementById("tabAdminSolicitudes");

    if (tab === 'usuarios') {
        tabUsuarios.style.display = "block";
        tabSolicitudes.style.display = "none";
        btnUsuarios.classList.add("active");
        btnSolicitudes.classList.remove("active");
    } else {
        tabUsuarios.style.display = "none";
        tabSolicitudes.style.display = "block";
        btnUsuarios.classList.remove("active");
        btnSolicitudes.classList.add("active");
        cargarSolicitudes();
    }
};

async function cargarSolicitudes() {
    const contenedor = document.getElementById("listaSolicitudes");
    if (!contenedor) return;

    contenedor.innerHTML = "<p style='color:#888;'>Cargando solicitudes...</p>";

    const { data: solicitudes, error } = await supabase
        .from('solicitudes_creador')
        .select('*, usuarios!solicitudes_creador_user_id_fkey(username, email)')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error al cargar solicitudes:", error);
        contenedor.innerHTML = "<p style='color:#ff4d6d;'>Error al cargar solicitudes.</p>";
        return;
    }

    // Actualizar el badge
    const badge = document.getElementById("badgeSolicitudes");
    if (badge) {
        if (solicitudes && solicitudes.length > 0) {
            badge.textContent = solicitudes.length;
            badge.style.display = "inline-block";
        } else {
            badge.style.display = "none";
        }
    }

    if (!solicitudes || solicitudes.length === 0) {
        contenedor.innerHTML = "<p style='color:#888; text-align:center; padding: 20px;'>No hay solicitudes pendientes.</p>";
        return;
    }

    contenedor.innerHTML = solicitudes.map(s => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; padding: 15px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <strong>@${s.usuarios?.username || 'sin_nombre'}</strong>
                    <div style="font-size: 0.75rem; color: #888;">${s.usuarios?.email || 'N/A'}</div>
                </div>
                <span style="font-size: 0.7rem; color: #888;">${new Date(s.created_at).toLocaleDateString('es-AR')}</span>
            </div>
            <p style="font-size: 0.85rem; color: #ccc; margin-bottom: 12px;">"${s.mensaje}"</p>
            <div style="display: flex; gap: 8px;">
                <button onclick="resolverSolicitud(${s.id}, 'aprobado')" class="btn-primary" style="padding: 6px 12px; font-size: 0.7rem;">✅ Aprobar</button>
                <button onclick="resolverSolicitud(${s.id}, 'rechazado')" class="btn-outline" style="padding: 6px 12px; font-size: 0.7rem;">❌ Rechazar</button>
            </div>
        </div>
    `).join("");
}

window.resolverSolicitud = async function(solicitudId, nuevoEstado) {
    const confirmar = confirm(`¿Confirmás ${nuevoEstado === 'aprobado' ? 'aprobar' : 'rechazar'} esta solicitud?`);
    if (!confirmar) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Actualizar la solicitud
    const { data: solicitud, error: errorSolicitud } = await supabase
        .from('solicitudes_creador')
        .update({
            estado: nuevoEstado,
            revisado_por: user.id,
            revisado_at: new Date().toISOString()
        })
        .eq('id', solicitudId)
        .select()
        .single();

    if (errorSolicitud) {
        console.error("Error actualizando solicitud:", errorSolicitud);
        alert("⚠️ No se pudo actualizar la solicitud.");
        return;
    }

    // 2. Si se aprobó, actualizar el rol del usuario
    if (nuevoEstado === 'aprobado' && solicitud?.user_id) {
        const { error: errorRol } = await supabase
            .from('usuarios')
            .update({ role: 'creador' })
            .eq('id', solicitud.user_id);

        if (errorRol) {
            console.error("Error actualizando rol:", errorRol);
            alert("⚠️ Se aprobó la solicitud, pero no se pudo actualizar el rol. Revisalo manualmente.");
            return;
        }
    }

    alert(`✅ Solicitud ${nuevoEstado === 'aprobado' ? 'aprobada' : 'rechazada'}.`);
    await cargarSolicitudes();
};

// Exponer en window
window.openSolicitudCreador = window.openSolicitudCreador || function() {};
window.closeSolicitudCreador = window.closeSolicitudCreador || function() {};

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.changeUserRole = changeUserRole;
