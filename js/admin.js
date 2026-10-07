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
            await cargarSolicitudes();
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

// Carga los usuarios. En desktop se ve como tabla, en mobile como tarjetas.
async function loadUsersList(currentRole) {
    const contenedor = document.getElementById("adminUsersList");
    if (!contenedor) return;

    contenedor.innerHTML = "<p style='color:#888; text-align:center; padding: 20px;'>Cargando usuarios...</p>";

    const isRoot = currentRole === 'root';

    const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('id, username, email, role')
        .order('username', { ascending: true });

    if (error) {
        console.error("Error al obtener usuarios:", error);
        contenedor.innerHTML = "<p style='color:#ff4d6d; text-align:center;'>Error al cargar la lista.</p>";
        return;
    }

    // ¿Estamos en mobile?
    const esMobile = window.innerWidth <= 700;

    contenedor.innerHTML = "";

    usuarios.forEach(userItem => {
        const currentUserRole = (userItem.role || 'usuario').toLowerCase();

        const esMiFila = userItem.id === currentAdminId;
        const usuarioEsRoot = currentUserRole === 'root';

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

        const selectHTML = `
            <select class="role-select" onchange="changeUserRole('${userItem.id}', this.value)">
                <option value="usuario" ${currentUserRole === 'usuario' ? 'selected' : ''}>Usuario</option>
                <option value="creador" ${currentUserRole === 'creador' ? 'selected' : ''}>Creador</option>
                <option value="moderador" ${currentUserRole === 'moderador' ? 'selected' : ''}>Moderador</option>
                ${isRoot ? `<option value="root" ${currentUserRole === 'root' ? 'selected' : ''}>Root</option>` : ''}
                <option value="banned" ${currentUserRole === 'banned' ? 'selected' : ''}>⛔ Banear</option>
            </select>
        `;

        const accionHTML = puedeEditar
            ? selectHTML
            : `<span class="admin-blocked-msg">${motivoBloqueo}</span>`;

        const username = escapeHTML(userItem.username) || 'sin_nombre';
        const email = escapeHTML(userItem.email) || 'N/A';

        if (esMobile) {
            // En mobile: tarjeta
            const card = document.createElement("div");
            card.className = "admin-user-card";
            card.innerHTML = `
                <div class="admin-user-card-header">
                    <strong>@${username}</strong>
                    <span class="badge-role">${currentUserRole.toUpperCase()}</span>
                </div>
                <div class="admin-user-card-email">${email}</div>
                <div class="admin-user-card-action">${accionHTML}</div>
            `;
            contenedor.appendChild(card);
        } else {
            // En desktop: fila tipo tabla
            const row = document.createElement("div");
            row.className = "admin-user-row";
            row.innerHTML = `
                <div class="admin-cell admin-cell-user"><strong>@${username}</strong></div>
                <div class="admin-cell admin-cell-email">${email}</div>
                <div class="admin-cell admin-cell-role"><span class="badge-role">${currentUserRole.toUpperCase()}</span></div>
                <div class="admin-cell admin-cell-action">${accionHTML}</div>
            `;
            contenedor.appendChild(row);
        }
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

// ============================================================
// PESTAÑAS DEL PANEL
// ============================================================

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

    contenedor.innerHTML = "<p style='color:#888; text-align:center; padding: 20px;'>Cargando solicitudes...</p>";

    const { data: solicitudes, error } = await supabase
        .from('solicitudes_creador')
        .select('*, usuarios!solicitudes_creador_user_id_fkey(username, email)')
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error al cargar solicitudes:", error);
        contenedor.innerHTML = "<p style='color:#ff4d6d; text-align:center;'>Error al cargar solicitudes.</p>";
        return;
    }

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
        <div class="solicitud-card">
            <div class="solicitud-header">
                <div>
                    <strong>@${escapeHTML(s.usuarios?.username) || 'sin_nombre'}</strong>
                    <div class="solicitud-email">${escapeHTML(s.usuarios?.email) || 'N/A'}</div>
                </div>
                <span class="solicitud-fecha">${new Date(s.created_at).toLocaleDateString('es-AR')}</span>
            </div>
            <p class="solicitud-mensaje">"${escapeHTML(s.mensaje)}"</p>
            <div class="solicitud-acciones">
                <button onclick="resolverSolicitud(${s.id}, 'aprobado')" class="btn-primary solicitud-btn">✅ Aprobar</button>
                <button onclick="resolverSolicitud(${s.id}, 'rechazado')" class="btn-outline solicitud-btn">❌ Rechazar</button>
            </div>
        </div>
    `).join("");
}

window.resolverSolicitud = async function(solicitudId, nuevoEstado) {
    const confirmar = confirm(`¿Confirmás ${nuevoEstado === 'aprobado' ? 'aprobar' : 'rechazar'} esta solicitud?`);
    if (!confirmar) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

// ============================================================
// RE-RENDER AL ROTAR / CAMBIAR TAMAÑO
// ============================================================
let resizeTimeout;
window.addEventListener("resize", () => {
    const modal = document.getElementById("adminModal");
    if (!modal || !modal.classList.contains("active")) return;

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentAdminRole) loadUsersList(currentAdminRole);
    }, 250);
});

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.changeUserRole = changeUserRole;
window.cargarSolicitudes = cargarSolicitudes;