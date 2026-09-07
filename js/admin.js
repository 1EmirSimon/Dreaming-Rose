import { supabase } from "./supabase.js";

const ALLOWED_ADMIN_ROLES = ['moderador', 'root'];
let currentAdminRole = null;

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

        tr.innerHTML = `
            <td><strong>@${userItem.username || 'sin_nombre'}</strong></td>
            <td>${userItem.email || 'N/A'}</td>
            <td><span class="badge-role">${currentRole.toUpperCase()}</span></td>
            <td>
                <select class="role-select" onchange="changeUserRole('${userItem.id}', this.value)">
                    <option value="usuario" ${currentRole === 'usuario' ? 'selected' : ''}>Usuario</option>
                    <option value="creador" ${currentRole === 'creador' ? 'selected' : ''}>Creador</option>
                    <option value="moderador" ${currentRole === 'moderador' ? 'selected' : ''}>Moderador</option>
                    ${isRoot ? `<option value="root" ${currentRole === 'root' ? 'selected' : ''}>Root</option>` : ''}
                    <option value="banned" ${currentRole === 'banned' ? 'selected' : ''}>⛔ Banear</option>
                </select>
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

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.changeUserRole = changeUserRole;