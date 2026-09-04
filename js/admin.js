import { supabase } from "./supabase.js";

const ADMIN_MASTER_PASSWORD = "DreamingRose2026!";

export async function openAdminModal() {
    const inputPassword = prompt("🔐 ACCESO RESTRINGIDO\nIngresa la contraseña maestra de administración:");
    if (inputPassword === null) return;

    if (inputPassword !== ADMIN_MASTER_PASSWORD) {
        alert("❌ Contraseña incorrecta. Acceso denegado.");
        return;
    }

    const modal = document.getElementById("adminModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
        await loadUsersList();
    }
}

export function closeAdminModal() {
    const modal = document.getElementById("adminModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
}

async function loadUsersList() {
    const tbody = document.getElementById("adminUsersList");
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='4'>Cargando usuarios...</td></tr>";

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    let isRoot = false;

    if (currentUser) {
        const { data: myProfile } = await supabase
            .from('usuarios')
            .select('role')
            .eq('id', currentUser.id)
            .single();
        
        if (myProfile && myProfile.role?.toLowerCase() === 'root') {
            isRoot = true;
        }
    }

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
        await loadUsersList();
    } catch (err) {
        console.error("Error cambiando el rol:", err);
        alert("⚠️ No se pudo cambiar el rol. Verifica las políticas RLS en Supabase.");
    }
}

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.changeUserRole = changeUserRole;