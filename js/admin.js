import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const STAFF_ROLES = new Set(["moderador", "root"]);
const PAGE_SIZE = 30;
let currentAdminRole = null;
let currentAdminId = null;
let activeFilter = "todos";
let currentPage = 0;
let currentUsers = [];
let totalUsers = 0;
let searchDebounce = null;
let previousBodyOverflow = "";
let usersRequestVersion = 0;
let auditEntriesCache = [];

const $ = (id) => document.getElementById(id);
const safe = (value) => escapeHTML(value == null ? "" : String(value));
const formatDate = (value) => {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha desconocida" : date.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
};

function setAdminNotice(message, type = "") {
  const notice = $("adminNotice");
  if (!notice) return;
  notice.className = `admin-notice ${type}`.trim();
  notice.textContent = message;
}

function setBadge(id, count) {
  const badge = $(id);
  if (!badge) return;
  badge.textContent = String(count || 0);
  badge.hidden = !count;
}

export async function openAdminModal() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      alert("Tenés que iniciar sesión para acceder a administración.");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("usuarios")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = String(profile?.role || "").toLowerCase();
    if (profileError || !STAFF_ROLES.has(role)) {
      setAdminNotice("Acceso denegado. Esta sección es exclusiva para moderador y root.", "error");
      alert("No tenés permisos para acceder al panel de administración.");
      return;
    }

    currentAdminRole = role;
    currentAdminId = user.id;
    previousBodyOverflow = document.body.style.overflow;

    const modal = $("adminModal");
    if (!modal) throw new Error("No se encontró el panel administrativo en index.html.");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    mostrarTabAdmin("usuarios");
    await Promise.all([cargarSolicitudes(), cargarApelaciones()]);
    setAdminNotice(`Sesión verificada · rol ${role}. Las acciones se autorizan en la base de datos.`, "success");
  } catch (error) {
    console.error("Error abriendo administración:", error);
    setAdminNotice(`No se pudo abrir el panel: ${error.message || "error inesperado"}`, "error");
  }
}

export function closeAdminModal() {
  const modal = $("adminModal");
  if (modal) {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }
  document.body.style.overflow = previousBodyOverflow;
}

function currentRoleFilter(query) {
  switch (activeFilter) {
    case "admins": return query.in("role", ["moderador", "root"]);
    case "usuarios": return query.eq("role", "usuario");
    case "creadores": return query.eq("role", "creador");
    case "baneados": return query.eq("role", "banned");
    default: return query;
  }
}

async function loadUsersList() {
  const container = $("adminUsersList");
  if (!container) return;
  const requestVersion = ++usersRequestVersion;
  container.innerHTML = '<p class="admin-empty">Cargando usuarios…</p>';

  let query = supabase
    .from("usuarios")
    .select("id,username,email,role,warnings_count,created_at", { count: "exact" })
    .order("username", { ascending: true });

  query = currentRoleFilter(query);
  const search = $("adminUserSearch")?.value?.trim();
  if (search) query = query.ilike("username", `%${search.replace(/[%_]/g, "\\$&")}%`);

  const from = currentPage * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (requestVersion !== usersRequestVersion) return;

  if (error) {
    console.error("Error cargando usuarios:", error);
    container.innerHTML = '<p class="admin-empty error">No se pudo cargar la lista de usuarios. Revisá permisos y conexión.</p>';
    setAdminNotice(`Error al cargar usuarios: ${error.message}`, "error");
    return;
  }

  currentUsers = data || [];
  totalUsers = count || 0;
  renderUsers();
  renderUsersPager();
}

function renderUsers() {
  const container = $("adminUsersList");
  if (!container) return;
  const countLabel = $("adminUsersCount");
  const start = totalUsers ? currentPage * PAGE_SIZE + 1 : 0;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, totalUsers);
  if (countLabel) countLabel.textContent = `${start}–${end} de ${totalUsers} usuarios`;

  if (!currentUsers.length) {
    container.innerHTML = '<p class="admin-empty">No hay usuarios para este filtro.</p>';
    return;
  }

  container.innerHTML = currentUsers.map((item) => {
    const role = String(item.role || "usuario").toLowerCase();
    const isSelf = item.id === currentAdminId;
    const isRootTarget = role === "root";
    const isModeratorTarget = role === "moderador";
    const canEdit = !isSelf && !isRootTarget && (currentAdminRole === "root" || !isModeratorTarget);
    const roleLabels = { usuario: "Usuario", creador: "Creador", moderador: "Moderador", root: "Root", banned: "Suspendido" };
    const roles = ["usuario", "creador", ...(currentAdminRole === "root" ? ["moderador"] : []), "banned"];
    const roleOptions = roles.map((r) => `<option value="${r}" ${r === role ? "selected" : ""}>${roleLabels[r]}</option>`).join("");
    const action = canEdit
      ? `<label class="admin-role-control"><span class="sr-only">Cambiar rol de ${safe(item.username)}</span><select class="role-select" data-user-id="${safe(item.id)}" aria-label="Cambiar rol de ${safe(item.username)}">${roleOptions}</select></label>`
      : `<span class="admin-locked">${isSelf ? "Tu cuenta" : isRootTarget ? "Cuenta protegida" : "Solo root puede modificar staff"}</span>`;

    const warnings = Number(item.warnings_count || 0);
    const joined = item.created_at ? `Alta ${formatDate(item.created_at)}` : "Fecha de alta no disponible";
    return `<article class="admin-user-row ${role === "banned" ? "is-banned" : ""} ${STAFF_ROLES.has(role) ? "is-staff" : ""}">
      <div class="admin-user-main"><strong>@${safe(item.username || "sin_nombre")}</strong><span>${safe(item.email || "Sin correo")} · ${safe(joined)}</span>${warnings ? `<small class="admin-warning-count">⚠ ${warnings} advertencia${warnings === 1 ? "" : "s"}</small>` : ""}</div>
      <span class="admin-role-badge badge-${safe(role)}">${safe(roleLabels[role] || role)}</span>
      <div class="admin-user-action">${action}</div>
    </article>`;
  }).join("");

  container.querySelectorAll("select[data-user-id]").forEach((select) => {
    select.addEventListener("change", () => {
      const userId = select.dataset.userId;
      const newRole = select.value;
      const previousRole = currentUsers.find((user) => user.id === userId)?.role || "usuario";
      select.value = previousRole;
      changeUserRole(userId, newRole, select);
    });
  });
}

function renderUsersPager() {
  const pager = $("adminUsersPager");
  if (!pager) return;
  const pages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));
  pager.innerHTML = `
    <button type="button" class="admin-page-button" data-page="prev" ${currentPage <= 0 ? "disabled" : ""}>← Anterior</button>
    <span>Página ${currentPage + 1} de ${pages}</span>
    <button type="button" class="admin-page-button" data-page="next" ${currentPage + 1 >= pages ? "disabled" : ""}>Siguiente →</button>`;
  pager.querySelector('[data-page="prev"]')?.addEventListener("click", () => { currentPage -= 1; loadUsersList(); });
  pager.querySelector('[data-page="next"]')?.addEventListener("click", () => { currentPage += 1; loadUsersList(); });
}

window.filtrarUsuariosAdmin = function (filter, button) {
  activeFilter = ["todos", "admins", "usuarios", "creadores", "baneados"].includes(filter) ? filter : "todos";
  currentPage = 0;
  document.querySelectorAll(".admin-subtab").forEach((item) => item.classList.toggle("active", item === button));
  loadUsersList();
};

export async function changeUserRole(userId, newRole, control = null) {
  const allowed = ["usuario", "creador", "moderador", "banned"];
  if (!allowed.includes(newRole)) return;
  const target = currentUsers.find((user) => user.id === userId);
  if (!target) return;

  const label = newRole === "banned" ? "suspender" : `cambiar el rol a ${newRole}`;
  if (!confirm(`¿Confirmás ${label} a @${target.username || "sin_nombre"}?`)) return;

  let reason = "";
  if (newRole === "banned") {
    reason = (prompt("Motivo de la suspensión (obligatorio, mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) {
      alert("La suspensión necesita un motivo de al menos 10 caracteres.");
      return;
    }
  } else {
    reason = (prompt("Motivo o nota administrativa (opcional):") || "").trim();
  }

  if (control) control.disabled = true;
  try {
    const { data, error } = await supabase.rpc("admin_change_user_role", {
      p_user_id: userId,
      p_new_role: newRole,
      p_reason: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || "La base de datos no confirmó el cambio.");
    setAdminNotice(data.changed ? `Rol de @${target.username} actualizado a ${newRole}.` : "El usuario ya tenía ese rol.", "success");
    await loadUsersList();
  } catch (error) {
    console.error("Error cambiando rol:", error);
    setAdminNotice(`No se pudo cambiar el rol: ${error.message || "error inesperado"}`, "error");
    if (control) control.disabled = false;
    await loadUsersList();
  }
}

window.mostrarTabAdmin = function (tab) {
  const tabs = {
    usuarios: ["tabContentUsuarios", "tabAdminUsuarios"],
    solicitudes: ["tabContentSolicitudes", "tabAdminSolicitudes"],
    apelaciones: ["tabContentApelaciones", "tabAdminApelaciones"],
    auditoria: ["tabContentAuditoria", "tabAdminAuditoria"]
  };
  if (!tabs[tab]) tab = "usuarios";
  Object.entries(tabs).forEach(([key, [panelId, buttonId]]) => {
    const panel = $(panelId);
    const button = $(buttonId);
    const active = key === tab;
    if (panel) panel.hidden = !active;
    if (button) {
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    }
  });
  if (tab === "usuarios") loadUsersList();
  if (tab === "solicitudes") cargarSolicitudes();
  if (tab === "apelaciones") cargarApelaciones();
  if (tab === "auditoria") cargarAuditoria();
};

async function cargarSolicitudes() {
  const container = $("listaSolicitudes");
  if (!container) return;
  container.innerHTML = '<p class="admin-empty">Cargando solicitudes…</p>';
  const { data, error } = await supabase
    .from("solicitudes_creador")
    .select("id,user_id,mensaje,estado,created_at,usuarios!solicitudes_creador_user_id_fkey(username,email)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("Error cargando solicitudes:", error);
    container.innerHTML = '<p class="admin-empty error">No se pudieron cargar las solicitudes.</p>';
    setAdminNotice(`Error en solicitudes: ${error.message}`, "error");
    return;
  }
  setBadge("badgeSolicitudes", data?.length || 0);
  if (!data?.length) {
    container.innerHTML = '<p class="admin-empty">No hay solicitudes pendientes.</p>';
    return;
  }
  container.innerHTML = data.map((item) => `
    <article class="admin-review-card">
      <div class="admin-review-head"><div><strong>@${safe(item.usuarios?.username || "sin_nombre")}</strong><span>${safe(item.usuarios?.email || "Sin correo")}</span></div><time>${safe(formatDate(item.created_at))}</time></div>
      <p>${safe(item.mensaje || "Sin mensaje")}</p>
      <div class="admin-review-actions"><button type="button" class="admin-action approve" data-request-id="${Number(item.id)}" data-status="aprobado">Aprobar solicitud</button><button type="button" class="admin-action reject" data-request-id="${Number(item.id)}" data-status="rechazado">Rechazar</button></div>
    </article>`).join("");
  container.querySelectorAll("button[data-request-id]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await resolverSolicitud(Number(button.dataset.requestId), button.dataset.status); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
}

window.resolverSolicitud = async function (id, status) {
  if (!["aprobado", "rechazado"].includes(status)) return;
  const action = status === "aprobado" ? "aprobar" : "rechazar";
  if (!confirm(`¿Confirmás ${action} esta solicitud?`)) return;
  let reason = "";
  if (status === "rechazado") {
    reason = (prompt("Motivo del rechazo (obligatorio, mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) { alert("El rechazo necesita un motivo de al menos 10 caracteres."); return; }
  }
  try {
    const { data, error } = await supabase.rpc("admin_resolver_solicitud_creador", { p_solicitud_id: Number(id), p_estado: status, p_motivo: reason });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || "No se confirmó la operación.");
    setAdminNotice(`Solicitud ${status === "aprobado" ? "aprobada" : "rechazada"}.`, "success");
    await cargarSolicitudes();
    if (status === "aprobado") await loadUsersList();
  } catch (error) {
    console.error("Error resolviendo solicitud:", error);
    setAdminNotice(`No se pudo resolver la solicitud: ${error.message}`, "error");
  }
};

async function cargarApelaciones() {
  const container = $("listaApelaciones");
  if (!container) return;
  container.innerHTML = '<p class="admin-empty">Cargando apelaciones…</p>';
  const { data, error } = await supabase
    .from("apelaciones")
    .select("id,user_id,mensaje,estado,created_at,usuarios!apelaciones_user_id_fkey(username,email)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) {
    console.error("Error cargando apelaciones:", error);
    container.innerHTML = '<p class="admin-empty error">No se pudieron cargar las apelaciones.</p>';
    setAdminNotice(`Error en apelaciones: ${error.message}`, "error");
    return;
  }
  setBadge("badgeApelaciones", data?.length || 0);
  if (!data?.length) {
    container.innerHTML = '<p class="admin-empty">No hay apelaciones pendientes.</p>';
    return;
  }
  container.innerHTML = data.map((item) => `
    <article class="admin-review-card">
      <div class="admin-review-head"><div><strong>@${safe(item.usuarios?.username || "sin_nombre")}</strong><span>${safe(item.usuarios?.email || "Sin correo")}</span></div><time>${safe(formatDate(item.created_at))}</time></div>
      <p>${safe(item.mensaje || "Sin mensaje")}</p>
      <div class="admin-review-actions"><button type="button" class="admin-action approve" data-appeal-id="${Number(item.id)}" data-status="aprobada">Aprobar apelación</button><button type="button" class="admin-action reject" data-appeal-id="${Number(item.id)}" data-status="rechazada">Rechazar</button></div>
    </article>`).join("");
  container.querySelectorAll("button[data-appeal-id]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await resolverApelacion(Number(button.dataset.appealId), button.dataset.status); }
    finally { if (button.isConnected) button.disabled = false; }
  }));
}

window.resolverApelacion = async function (id, status) {
  if (!["aprobada", "rechazada"].includes(status)) return;
  const promptText = status === "aprobada"
    ? "¿Aprobar esta apelación? La cuenta volverá al rol usuario."
    : "¿Rechazar esta apelación? El usuario no podrá volver a apelar.";
  if (!confirm(promptText)) return;
  let reason = "";
  if (status === "rechazada") {
    reason = (prompt("Motivo del rechazo (obligatorio, mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) { alert("El rechazo necesita un motivo de al menos 10 caracteres."); return; }
  }
  try {
    const { data, error } = await supabase.rpc("admin_resolver_apelacion", { p_apelacion_id: Number(id), p_estado: status, p_motivo: reason });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || "No se confirmó la operación.");
    setAdminNotice(`Apelación ${status === "aprobada" ? "aprobada" : "rechazada"}.`, "success");
    await Promise.all([cargarApelaciones(), loadUsersList()]);
  } catch (error) {
    console.error("Error resolviendo apelación:", error);
    setAdminNotice(`No se pudo resolver la apelación: ${error.message}`, "error");
  }
};

const actionLabels = {
  "user.role_changed": "Cambio de rol",
  "game.moderation_changed": "Decisión de moderación",
  "game.deleted": "Publicación eliminada",
  "creator_request.resolved": "Solicitud de creador resuelta",
  "appeal.resolved": "Apelación resuelta"
};

const auditGroups = {
  todas: null,
  usuarios: new Set(["user.role_changed"]),
  juegos: new Set(["game.moderation_changed", "game.deleted"]),
  solicitudes: new Set(["creator_request.resolved"]),
  apelaciones: new Set(["appeal.resolved"])
};

function renderAuditoria() {
  const container = $("adminAuditList");
  if (!container) return;
  const group = $("adminAuditFilter")?.value || "todas";
  const search = ($("adminAuditSearch")?.value || "").trim().toLocaleLowerCase("es-AR");
  const allowed = auditGroups[group] || null;
  const data = auditEntriesCache.filter((entry) => {
    if (allowed && !allowed.has(entry.action_key)) return false;
    if (!search) return true;
    const haystack = [entry.actor_username, entry.actor_role, entry.target_label, entry.target_id, entry.reason, actionLabels[entry.action_key]]
      .filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
    return haystack.includes(search);
  });
  const count = $("adminAuditCount");
  if (count) count.textContent = `${data.length} de ${auditEntriesCache.length} acciones recientes`;
  if (!data.length) {
    container.innerHTML = '<p class="admin-empty">No hay acciones que coincidan con el filtro.</p>';
    return;
  }
  container.innerHTML = data.map((entry) => {
    const before = entry.before_data || {};
    const after = entry.after_data || {};
    const field = Object.prototype.hasOwnProperty.call(after, "role") ? "role" : Object.prototype.hasOwnProperty.call(after, "estado_moderacion") ? "estado_moderacion" : Object.prototype.hasOwnProperty.call(after, "estado") ? "estado" : null;
    const transition = field ? `${before[field] || "—"} → ${after[field] || "—"}` : "";
    return `<article class="admin-audit-entry">
      <div class="admin-audit-top"><strong>${safe(actionLabels[entry.action_key] || entry.action_key)}</strong><time>${safe(formatDate(entry.created_at))}</time></div>
      <div class="admin-audit-target">${safe(entry.target_label || `${entry.target_type} #${entry.target_id}`)} ${transition ? `<span>${safe(transition)}</span>` : ""}</div>
      <div class="admin-audit-meta">Por <strong>${safe(entry.actor_username || "Sistema")}</strong> · ${safe(entry.actor_role || "sin rol")}</div>
      ${entry.reason ? `<p class="admin-audit-reason">Motivo: ${safe(entry.reason)}</p>` : ""}
    </article>`;
  }).join("");
}

async function cargarAuditoria() {
  const container = $("adminAuditList");
  if (!container) return;
  container.innerHTML = '<p class="admin-empty">Cargando actividad…</p>';
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("id,actor_username,actor_role,action_key,target_type,target_label,target_id,reason,before_data,after_data,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Error cargando auditoría:", error);
    container.innerHTML = '<p class="admin-empty error">No se pudo cargar el historial. Comprobá la última migración en Supabase.</p>';
    setAdminNotice(`Error en auditoría: ${error.message}`, "error");
    return;
  }
  auditEntriesCache = data || [];
  renderAuditoria();
}

// Refresh controls and search.
$("adminUsersRefresh")?.addEventListener("click", loadUsersList);
$("adminRequestsRefresh")?.addEventListener("click", cargarSolicitudes);
$("adminAppealsRefresh")?.addEventListener("click", cargarApelaciones);
$("adminAuditRefresh")?.addEventListener("click", cargarAuditoria);
$("adminAuditFilter")?.addEventListener("change", renderAuditoria);
$("adminAuditSearch")?.addEventListener("input", renderAuditoria);
$("adminUserSearch")?.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { currentPage = 0; loadUsersList(); }, 250);
});

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
window.changeUserRole = changeUserRole;
window.cargarSolicitudes = cargarSolicitudes;
window.cargarApelaciones = cargarApelaciones;
