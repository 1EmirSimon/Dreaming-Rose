import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const ADMIN_ROLES = new Set(["moderador", "root"]);
const PAGE_SIZE_USERS = 25;
const PAGE_SIZE_AUDIT = 25;
const $ = (id) => document.getElementById(id);

let currentAdminRole = null;
let currentAdminId = null;
let userFilter = "todos";
let userPage = 0;
let userTotal = 0;
let auditPage = 0;
let auditTotal = 0;
let busyAction = false;
let previousBodyOverflow = "";

function text(value, fallback = "—") {
  return escapeHTML(value == null || value === "" ? fallback : String(value));
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha desconocida" : date.toLocaleString("es-AR");
}

function setContainerMessage(id, message, kind = "muted") {
  const container = $(id);
  if (!container) return;
  container.innerHTML = `<p class="admin-state admin-state-${kind}" role="status">${text(message)}</p>`;
}

function showAdminError(context, error) {
  console.error(`[Dreaming Rose admin] ${context}`, error);
  const message = error?.message || "Ocurrió un error inesperado.";
  alert(`${context}: ${message}`);
}

async function getVerifiedAdmin() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Tenés que iniciar sesión primero.");

  const { data: profile, error } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error) throw error;
  const role = String(profile?.role || "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) throw new Error("Tu cuenta no tiene permisos para abrir la administración.");

  return { user, role };
}

export async function openAdminModal() {
  const modal = $("adminModal");
  if (!modal) return;

  try {
    const { user, role } = await getVerifiedAdmin();
    currentAdminId = user.id;
    currentAdminRole = role;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modal.classList.add("active");

    userFilter = "todos";
    userPage = 0;
    if ($("adminUserSearch")) $("adminUserSearch").value = "";
    await Promise.all([cargarSolicitudes(), cargarApelaciones()]);
    await mostrarTabAdmin("usuarios");
  } catch (error) {
    showAdminError("No se pudo abrir la administración", error);
  }
}

export function closeAdminModal() {
  const modal = $("adminModal");
  modal?.classList.remove("active");
  document.body.style.overflow = previousBodyOverflow;
  currentAdminRole = null;
  currentAdminId = null;
}

function applyUserQuery(query) {
  if (userFilter === "admins") return query.in("role", ["moderador", "root"]);
  if (userFilter === "usuarios") return query.eq("role", "usuario");
  if (userFilter === "baneados") return query.eq("role", "banned");
  return query;
}

function renderUserAction(user) {
  const role = String(user.role || "usuario").toLowerCase();
  const isSelf = user.id === currentAdminId;
  const isProtected = role === "root" || (role === "moderador" && currentAdminRole !== "root");

  let blockedReason = "";
  if (isSelf) blockedReason = "Tu propia cuenta";
  else if (role === "root") blockedReason = "Cuenta root protegida";
  else if (role === "moderador" && currentAdminRole !== "root") blockedReason = "Solo root administra moderadores";

  if (isSelf || isProtected) return `<span class="admin-blocked-msg">${text(blockedReason)}</span>`;

  const allowedRoles = currentAdminRole === "root"
    ? ["usuario", "creador", "moderador", "banned"]
    : ["usuario", "creador", "banned"];

  const options = allowedRoles.map((item) => {
    const label = item === "banned" ? "Suspender cuenta" : item[0].toUpperCase() + item.slice(1);
    return `<option value="${item}" ${role === item ? "selected" : ""}>${label}</option>`;
  }).join("");

  return `<select class="role-select" aria-label="Cambiar rol de @${text(user.username, "usuario")}" onchange="changeUserRole('${user.id}', this.value, this)">${options}</select>`;
}

function renderUsers(users) {
  const container = $("adminUsersList");
  if (!container) return;

  if (!users.length) {
    setContainerMessage("adminUsersList", "No hay usuarios que coincidan con este filtro.");
    return;
  }

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  container.innerHTML = users.map((user) => {
    const role = String(user.role || "usuario").toLowerCase();
    const classes = ["admin-user-row"];
    if (role === "banned") classes.push("admin-user-banned");
    if (ADMIN_ROLES.has(role)) classes.push("admin-user-staff");

    const username = text(user.username, "sin_nombre");
    const email = text(user.email, "Correo no disponible");
    const warnings = Number.isFinite(Number(user.warnings_count)) ? Number(user.warnings_count) : 0;
    const roleBadge = `<span class="badge-role badge-${role}">${text(role.toUpperCase())}</span>`;
    const action = renderUserAction(user);

    if (mobile) {
      return `<article class="admin-user-card ${classes.slice(1).join(" ")}">
        <div class="admin-user-card-header"><strong>@${username}</strong>${roleBadge}</div>
        <div class="admin-user-card-email">${email}</div>
        <div class="admin-user-card-meta">Advertencias: ${warnings} · Alta: ${text(user.created_at ? new Date(user.created_at).toLocaleDateString("es-AR") : "Sin dato")}</div>
        <div class="admin-user-card-action">${action}</div>
      </article>`;
    }

    return `<article class="admin-user-row ${classes.slice(1).join(" ")}">
      <div class="admin-cell admin-cell-user"><strong>@${username}</strong><small>${text(user.created_at ? new Date(user.created_at).toLocaleDateString("es-AR") : "Sin fecha")}</small></div>
      <div class="admin-cell admin-cell-email">${email}</div>
      <div class="admin-cell admin-cell-role">${roleBadge}<small>${warnings} advertencia${warnings === 1 ? "" : "s"}</small></div>
      <div class="admin-cell admin-cell-action">${action}</div>
    </article>`;
  }).join("");
}

function updateUserPagination() {
  const start = userTotal === 0 ? 0 : userPage * PAGE_SIZE_USERS + 1;
  const end = Math.min((userPage + 1) * PAGE_SIZE_USERS, userTotal);
  const meta = $("adminUsersMeta");
  if (meta) meta.textContent = `${start}–${end} de ${userTotal} usuarios`;
  const prev = $("adminUsersPrev");
  const next = $("adminUsersNext");
  if (prev) prev.disabled = userPage <= 0;
  if (next) next.disabled = end >= userTotal;
}

async function loadUsersList() {
  const container = $("adminUsersList");
  if (!container) return;
  setContainerMessage("adminUsersList", "Cargando usuarios…");

  const search = String($("adminUserSearch")?.value || "").trim().slice(0, 64);
  let query = supabase
    .from("usuarios")
    .select("id,username,email,role,warnings_count,created_at", { count: "exact" })
    .order("username", { ascending: true });

  query = applyUserQuery(query);
  if (search) query = query.ilike("username", `%${search.replace(/[%_*]/g, "")}%`);

  const from = userPage * PAGE_SIZE_USERS;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE_USERS - 1);
  if (error) {
    setContainerMessage("adminUsersList", "No se pudo cargar la lista de usuarios.", "error");
    showAdminError("Error al cargar usuarios", error);
    return;
  }

  userTotal = count || 0;
  renderUsers(data || []);
  updateUserPagination();
}

window.filtrarUsuariosAdmin = async function (filter, button) {
  if (!["todos", "admins", "usuarios", "baneados"].includes(filter)) return;
  userFilter = filter;
  userPage = 0;
  document.querySelectorAll(".admin-subtab").forEach((item) => item.classList.toggle("active", item === button));
  await loadUsersList();
};

export async function changeUserRole(userId, newRole, selectElement = null) {
  const allowed = ["usuario", "creador", "moderador", "banned"];
  if (!allowed.includes(newRole)) {
    await loadUsersList();
    return;
  }
  if (currentAdminRole !== "root" && newRole === "moderador") {
    alert("Solo root puede asignar el rol de moderador.");
    await loadUsersList();
    return;
  }

  let reason = "";
  if (newRole === "banned") {
    reason = (window.prompt("Motivo de suspensión (mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) {
      alert("Para suspender una cuenta, el motivo debe tener al menos 10 caracteres.");
      await loadUsersList();
      return;
    }
  } else {
    const response = window.prompt("Motivo del cambio de rol (opcional):", "");
    if (response === null) {
      await loadUsersList();
      return;
    }
    reason = response.trim().slice(0, 500);
  }

  const actionName = newRole === "banned" ? "suspender" : `asignar el rol ${newRole}`;
  if (!window.confirm(`¿Confirmás ${actionName} a esta cuenta?`)) {
    await loadUsersList();
    return;
  }

  if (busyAction) return;
  busyAction = true;
  if (selectElement) selectElement.disabled = true;

  try {
    const { data, error } = await supabase.rpc("admin_change_user_role", {
      p_user_id: userId,
      p_new_role: newRole,
      p_reason: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Supabase no confirmó el cambio de rol.");
    userPage = 0;
    await loadUsersList();
    await loadAuditLog();
    alert(data.changed ? `Rol actualizado: ${newRole.toUpperCase()}.` : "La cuenta ya tenía ese rol.");
  } catch (error) {
    showAdminError("No se pudo cambiar el rol", error);
    await loadUsersList();
  } finally {
    busyAction = false;
    if (selectElement) selectElement.disabled = false;
  }
}

window.changeUserRole = changeUserRole;

const ADMIN_TABS = {
  usuarios: { panel: "tabContentUsuarios", button: "tabAdminUsuarios" },
  solicitudes: { panel: "tabContentSolicitudes", button: "tabAdminSolicitudes" },
  apelaciones: { panel: "tabContentApelaciones", button: "tabAdminApelaciones" },
  historial: { panel: "tabContentHistorial", button: "tabAdminHistorial" }
};

window.mostrarTabAdmin = async function (tab) {
  if (!ADMIN_TABS[tab]) return;
  Object.values(ADMIN_TABS).forEach(({ panel, button }) => {
    const panelElement = $(panel);
    const buttonElement = $(button);
    if (panelElement) panelElement.hidden = true;
    if (buttonElement) buttonElement.classList.remove("active");
  });

  const selected = ADMIN_TABS[tab];
  if ($(selected.panel)) $(selected.panel).hidden = false;
  if ($(selected.button)) $(selected.button).classList.add("active");

  if (tab === "usuarios") await loadUsersList();
  if (tab === "solicitudes") await cargarSolicitudes();
  if (tab === "apelaciones") await cargarApelaciones();
  if (tab === "historial") await loadAuditLog();
};

function setBadge(id, count) {
  const badge = $(id);
  if (!badge) return;
  const value = Number(count) || 0;
  badge.textContent = String(value);
  badge.style.display = value > 0 ? "inline-block" : "none";
}

async function cargarSolicitudes() {
  const container = $("listaSolicitudes");
  if (!container) return;
  setContainerMessage("listaSolicitudes", "Cargando solicitudes…");

  const { data, error } = await supabase
    .from("solicitudes_creador")
    .select("id,user_id,mensaje,estado,created_at,usuarios!solicitudes_creador_user_id_fkey(username,email)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) {
    setContainerMessage("listaSolicitudes", "No se pudieron cargar las solicitudes.", "error");
    console.error("Error al cargar solicitudes:", error);
    setBadge("badgeSolicitudes", 0);
    return;
  }

  const requests = data || [];
  setBadge("badgeSolicitudes", requests.length);
  if (!requests.length) {
    setContainerMessage("listaSolicitudes", "No hay solicitudes pendientes.");
    return;
  }

  container.innerHTML = requests.map((item) => `<article class="solicitud-card">
    <div class="solicitud-header">
      <div><strong>@${text(item.usuarios?.username, "sin_nombre")}</strong><div class="solicitud-email">${text(item.usuarios?.email, "Correo no disponible")}</div></div>
      <span class="solicitud-fecha">${formatDate(item.created_at)}</span>
    </div>
    <p class="solicitud-mensaje">${text(item.mensaje, "Sin mensaje")}</p>
    <div class="solicitud-acciones">
      <button type="button" onclick="resolverSolicitud(${Number(item.id)}, 'aprobado')" class="btn-primary solicitud-btn">Aprobar</button>
      <button type="button" onclick="resolverSolicitud(${Number(item.id)}, 'rechazado')" class="btn-outline solicitud-btn">Rechazar</button>
    </div>
  </article>`).join("");
}

window.resolverSolicitud = async function (requestId, newStatus) {
  if (!currentAdminRole || busyAction) return;
  let reason = "";
  if (newStatus === "rechazado") {
    reason = (window.prompt("Motivo del rechazo (mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) {
      alert("El motivo debe tener al menos 10 caracteres.");
      return;
    }
  }
  if (!window.confirm(newStatus === "aprobado" ? "¿Aprobar la solicitud y convertir la cuenta en creador?" : "¿Rechazar esta solicitud?")) return;

  busyAction = true;
  try {
    const { data, error } = await supabase.rpc("admin_resolver_solicitud_creador", {
      p_solicitud_id: Number(requestId),
      p_estado: newStatus,
      p_motivo: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Supabase no confirmó la resolución.");
    userPage = 0;
    await Promise.all([cargarSolicitudes(), loadUsersList(), loadAuditLog()]);
  } catch (error) {
    showAdminError("No se pudo resolver la solicitud", error);
  } finally {
    busyAction = false;
  }
};

async function cargarApelaciones() {
  const container = $("listaApelaciones");
  if (!container) return;
  setContainerMessage("listaApelaciones", "Cargando apelaciones…");

  const { data, error } = await supabase
    .from("apelaciones")
    .select("id,user_id,mensaje,estado,created_at,usuarios!apelaciones_user_id_fkey(username,email)")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });

  if (error) {
    setContainerMessage("listaApelaciones", "No se pudieron cargar las apelaciones.", "error");
    console.error("Error al cargar apelaciones:", error);
    setBadge("badgeApelaciones", 0);
    return;
  }

  const appeals = data || [];
  setBadge("badgeApelaciones", appeals.length);
  if (!appeals.length) {
    setContainerMessage("listaApelaciones", "No hay apelaciones pendientes.");
    return;
  }

  container.innerHTML = appeals.map((item) => `<article class="solicitud-card">
    <div class="solicitud-header">
      <div><strong>@${text(item.usuarios?.username, "sin_nombre")}</strong><div class="solicitud-email">${text(item.usuarios?.email, "Correo no disponible")}</div></div>
      <span class="solicitud-fecha">${formatDate(item.created_at)}</span>
    </div>
    <p class="solicitud-mensaje">${text(item.mensaje, "Sin mensaje")}</p>
    <div class="solicitud-acciones">
      <button type="button" onclick="resolverApelacion(${Number(item.id)}, 'aprobada')" class="btn-primary solicitud-btn">Aprobar</button>
      <button type="button" onclick="resolverApelacion(${Number(item.id)}, 'rechazada')" class="btn-outline solicitud-btn">Rechazar</button>
    </div>
  </article>`).join("");
}

window.resolverApelacion = async function (appealId, newStatus) {
  if (!currentAdminRole || busyAction) return;
  let reason = "";
  if (newStatus === "rechazada") {
    reason = (window.prompt("Motivo del rechazo (mínimo 10 caracteres):") || "").trim();
    if (reason.length < 10) {
      alert("El motivo debe tener al menos 10 caracteres.");
      return;
    }
  }
  const message = newStatus === "aprobada"
    ? "¿Aprobar esta apelación y restablecer el acceso de la cuenta?"
    : "¿Rechazar esta apelación? La decisión quedará registrada.";
  if (!window.confirm(message)) return;

  busyAction = true;
  try {
    const { data, error } = await supabase.rpc("admin_resolver_apelacion", {
      p_apelacion_id: Number(appealId),
      p_estado: newStatus,
      p_motivo: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Supabase no confirmó la resolución.");
    userPage = 0;
    await Promise.all([cargarApelaciones(), loadUsersList(), loadAuditLog()]);
  } catch (error) {
    showAdminError("No se pudo resolver la apelación", error);
  } finally {
    busyAction = false;
  }
};

function actionLabel(action) {
  const labels = {
    "user.role_changed": "Cambio de rol",
    "game.moderation_changed": "Decisión de moderación",
    "game.deleted": "Juego eliminado",
    "creator_request.resolved": "Solicitud de creador resuelta",
    "appeal.resolved": "Apelación resuelta"
  };
  return labels[action] || action || "Acción administrativa";
}

function describeChange(beforeData, afterData) {
  const before = beforeData && typeof beforeData === "object" ? beforeData : {};
  const after = afterData && typeof afterData === "object" ? afterData : {};
  const beforeValue = before.role || before.estado_moderacion || before.estado || "—";
  const afterValue = after.role || after.estado_moderacion || after.estado || "—";
  return `Antes: ${text(beforeValue)} · Después: ${text(afterValue)}`;
}

function updateAuditPagination() {
  const start = auditTotal === 0 ? 0 : auditPage * PAGE_SIZE_AUDIT + 1;
  const end = Math.min((auditPage + 1) * PAGE_SIZE_AUDIT, auditTotal);
  const meta = $("adminAuditMeta");
  if (meta) meta.textContent = `${start}–${end} de ${auditTotal} acciones`;
  if ($("adminAuditPrev")) $("adminAuditPrev").disabled = auditPage <= 0;
  if ($("adminAuditNext")) $("adminAuditNext").disabled = end >= auditTotal;
}

async function loadAuditLog() {
  const container = $("adminAuditList");
  if (!container) return;
  setContainerMessage("adminAuditList", "Cargando historial administrativo…");

  let query = supabase
    .from("admin_audit_log")
    .select("id,actor_username,actor_role,action_key,target_type,target_id,target_label,reason,before_data,after_data,created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  const filter = $("adminAuditFilter")?.value || "todos";
  const search = String($("adminAuditSearch")?.value || "").trim().slice(0, 60);
  if (filter !== "todos") query = query.eq("action_key", filter);
  if (search) query = query.ilike("target_label", `%${search.replace(/[%_*]/g, "")}%`);

  const from = auditPage * PAGE_SIZE_AUDIT;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE_AUDIT - 1);
  if (error) {
    setContainerMessage("adminAuditList", "No se pudo consultar el historial. Comprobá los permisos administrativos.", "error");
    console.error("Error consultando auditoría:", error);
    return;
  }

  auditTotal = count || 0;
  const entries = data || [];
  if (!entries.length) {
    setContainerMessage("adminAuditList", "Todavía no hay acciones registradas para este filtro.");
    updateAuditPagination();
    return;
  }

  container.innerHTML = entries.map((entry) => `<article class="admin-audit-entry">
    <div class="admin-audit-entry-top">
      <strong>${text(actionLabel(entry.action_key))}</strong>
      <time datetime="${text(entry.created_at, "")}">${formatDate(entry.created_at)}</time>
    </div>
    <div class="admin-audit-entry-meta">
      <span>Responsable: <b>@${text(entry.actor_username, "sistema")}</b></span>
      <span>Rol: ${text(String(entry.actor_role || "system").toUpperCase())}</span>
      <span>Destino: ${text(entry.target_type)} #${text(entry.target_id)}</span>
    </div>
    <p class="admin-audit-target">${text(entry.target_label, "Elemento sin nombre")}</p>
    <p class="admin-audit-transition">${describeChange(entry.before_data, entry.after_data)}</p>
    ${entry.reason ? `<p class="admin-audit-reason"><b>Motivo:</b> ${text(entry.reason)}</p>` : ""}
  </article>`).join("");
  updateAuditPagination();
}

// Keep the functions available for the existing inline HTML and refresh controls.
window.cargarSolicitudes = cargarSolicitudes;
window.cargarApelaciones = cargarApelaciones;

$("adminUserSearch")?.addEventListener("input", () => {
  userPage = 0;
  clearTimeout(window.__drAdminSearchTimer);
  window.__drAdminSearchTimer = setTimeout(loadUsersList, 220);
});
$("adminUsersPrev")?.addEventListener("click", async () => { if (userPage > 0) { userPage--; await loadUsersList(); } });
$("adminUsersNext")?.addEventListener("click", async () => { if ((userPage + 1) * PAGE_SIZE_USERS < userTotal) { userPage++; await loadUsersList(); } });
$("adminAuditFilter")?.addEventListener("change", () => { auditPage = 0; loadAuditLog(); });
$("adminAuditSearch")?.addEventListener("input", () => {
  auditPage = 0;
  clearTimeout(window.__drAuditSearchTimer);
  window.__drAuditSearchTimer = setTimeout(loadAuditLog, 220);
});
$("adminAuditPrev")?.addEventListener("click", async () => { if (auditPage > 0) { auditPage--; await loadAuditLog(); } });
$("adminAuditNext")?.addEventListener("click", async () => { if ((auditPage + 1) * PAGE_SIZE_AUDIT < auditTotal) { auditPage++; await loadAuditLog(); } });
$("adminAuditRefresh")?.addEventListener("click", loadAuditLog);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("adminModal")?.classList.contains("active")) closeAdminModal();
});

window.openAdminModal = openAdminModal;
window.closeAdminModal = closeAdminModal;
