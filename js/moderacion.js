import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const ALLOWED_ROLES = ["moderador", "root"];
const $ = (id) => document.getElementById(id);
let games = [];
let busy = false;

function setNotice(message, type = "") {
  const el = $("notice");
  el.className = `moderation-notice ${type}`.trim();
  el.textContent = message;
}

function safeDate(value) {
  if (!value) return "No programada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha desconocida" : date.toLocaleString("es-AR");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function statusLabel(status) {
  const labels = { pendiente: "PENDIENTE", aprobado: "APROBADO", rechazado: "RECHAZADO" };
  return labels[status] || "PENDIENTE";
}

function updateStats() {
  $("pendingCount").textContent = games.filter(g => g.estado_moderacion === "pendiente").length;
  $("approvedCount").textContent = games.filter(g => g.estado_moderacion === "aprobado").length;
  $("rejectedCount").textContent = games.filter(g => g.estado_moderacion === "rechazado").length;
}

function filteredGames() {
  const status = $("statusFilter").value;
  const term = $("searchInput").value.trim().toLocaleLowerCase("es-AR");
  return games.filter(g => {
    const statusOK = status === "todos" || g.estado_moderacion === status;
    const haystack = [g.title, g.author, g.description, g.categoria, g.plataforma, g.clasificacion_edad, ...(Array.isArray(g.etiquetas) ? g.etiquetas : [])].filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
    return statusOK && (!term || haystack.includes(term));
  });
}

function renderGames() {
  const container = $("gamesList");
  const items = filteredGames();

  if (!items.length) {
    container.innerHTML = '<div class="moderation-empty">No hay publicaciones para este filtro.</div>';
    return;
  }

  container.innerHTML = items.map(g => {
    const id = Number(g.id);
    const title = escapeHTML(g.title || "Juego sin título");
    const author = escapeHTML(g.author || "Creador no indicado");
    const description = escapeHTML(g.description || "Sin descripción.");
    const imageUrl = safeHttpUrl(g.image_url || "");
    const downloadUrl = safeHttpUrl(g.download_url || "");
    const status = g.estado_moderacion || "pendiente";
    const reason = escapeHTML(g.motivo_revision || "");
    const category = g.categoria || "Sin categoría";
    const platform = g.plataforma || "Sin plataforma";
    const ageRating = g.clasificacion_edad || "Sin clasificación";
    const tags = Array.isArray(g.etiquetas) ? g.etiquetas.slice(0, 3) : [];
    const screenshotUrls = (Array.isArray(g.screenshots) ? g.screenshots : [])
      .map(item => typeof item === "string" ? item : item?.url || item?.src || "")
      .map(safeHttpUrl).filter(Boolean).slice(0, 4);
    const screenshotsMarkup = screenshotUrls.length
      ? `<div class="moderation-screenshots">${screenshotUrls.map((url, index) => `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir captura ${index + 1}"><img src="${escapeHTML(url)}" alt="Captura ${index + 1} de ${title}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>`
      : `<p class="moderation-meta">Sin capturas adicionales</p>`;
    const statusClass = status === "aprobado" ? "approved" : status === "rechazado" ? "rejected" : "pending";
    const official = g.es_proyecto_oficial ? '<span class="moderation-badge">PROYECTO OFICIAL</span>' : "";
    const cover = imageUrl
      ? `<img class="moderation-cover" src="${escapeHTML(imageUrl)}" alt="Portada de ${title}" loading="lazy" referrerpolicy="no-referrer">`
      : '<div class="moderation-cover" style="display:grid;place-items:center;color:#8a93aa">SIN PORTADA</div>';
    const download = downloadUrl
      ? `<a href="${escapeHTML(downloadUrl)}" target="_blank" rel="noopener noreferrer">Abrir enlace de descarga ↗</a>`
      : '<span>Sin enlace de descarga válido</span>';
    const reasonEditor = status !== "aprobado"
      ? `<label for="reason-${id}" class="moderation-meta">Motivo (obligatorio para rechazar)</label><textarea class="moderation-reason" id="reason-${id}" maxlength="1000" placeholder="Escribí el motivo de la decisión…">${reason}</textarea>`
      : `<p class="moderation-meta">Motivo registrado: ${reason || "Sin motivo"}</p>`;

    return `<article class="moderation-game" data-game-id="${id}">
      ${cover}
      <div class="moderation-game-body">
        <div class="moderation-game-head">
          <div><h2>${title}</h2><span class="moderation-badge ${statusClass}">${statusLabel(status)}</span> ${official}</div>
          <span class="moderation-meta">ID #${id}</span>
        </div>
        <div class="moderation-meta"><span>Autor: ${author}</span><span>Creado: ${safeDate(g.created_at)}</span><span>Publicación: ${safeDate(g.publish_at)}</span></div>
        <div class="moderation-data-grid">
          <div><small>CATEGORÍA</small><strong>${escapeHTML(category)}</strong></div>
          <div><small>PLATAFORMA</small><strong>${escapeHTML(platform)}</strong></div>
          <div><small>EDAD RECOMENDADA</small><strong>${escapeHTML(ageRating)}</strong></div>
          <div><small>VERIFICACIÓN</small><strong>${g.categoria_confirmada ? "Confirmada" : "Pendiente"}</strong></div>
        </div>
        ${tags.length ? `<div class="moderation-tags">${tags.map(tag => `<span>#${escapeHTML(tag)}</span>`).join("")}</div>` : ""}
        <p class="moderation-description">${description}</p>
        <div class="moderation-screenshots-wrap"><strong>Capturas del juego</strong>${screenshotsMarkup}</div>
        ${g.revisado_at ? `<p class="moderation-meta">Última revisión: ${safeDate(g.revisado_at)}</p>` : ""}
        <div class="moderation-links">${download}</div>
        ${reasonEditor}
        <div class="moderation-buttons">
          ${status !== "aprobado" ? `<button class="moderation-button primary" type="button" data-action="approve" data-id="${id}">✓ APROBAR</button>` : ""}
          ${status !== "rechazado" ? `<button class="moderation-button reject" type="button" data-action="reject" data-id="${id}">✕ RECHAZAR</button>` : ""}
          ${status !== "pendiente" ? `<button class="moderation-button" type="button" data-action="pending" data-id="${id}">↺ VOLVER A PENDIENTE</button>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");
}

async function verifyAccess() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    setNotice("Iniciá sesión en Dreaming Rose con una cuenta moderador o root y volvé a esta página.", "error");
    $("gamesList").innerHTML = '<div class="moderation-empty">No hay una sesión activa.</div>';
    return false;
  }

  const { data: profile, error } = await supabase
    .from("usuarios").select("role").eq("id", user.id).single();

  const role = (profile?.role || "").toLowerCase();
  if (error || !ALLOWED_ROLES.includes(role)) {
    setNotice("Acceso denegado. Esta sección es exclusiva para moderador y root.", "error");
    $("gamesList").innerHTML = '<div class="moderation-empty">Tu cuenta no tiene permisos de moderación.</div>';
    return false;
  }

  setNotice(`Sesión verificada · Rol ${role}. Las decisiones se guardan en Supabase.`, "success");
  return true;
}

async function loadGames() {
  if (busy) return;
  busy = true;
  $("refreshBtn").disabled = true;
  $("gamesList").innerHTML = '<div class="moderation-empty">Cargando publicaciones…</div>';

  try {
    const { data, error } = await supabase.from("juegos")
      .select("id,title,description,created_at,author,image_url,download_url,user_id,publish_at,es_proyecto_oficial,estado_moderacion,revisado_por,revisado_at,motivo_revision,categoria,plataforma,screenshots,clasificacion_edad,etiquetas,categoria_confirmada")
      .order("created_at", { ascending: false });
    if (error) throw error;
    games = data || [];
    updateStats();
    renderGames();
  } catch (error) {
    console.error("Error cargando publicaciones:", error);
    $("gamesList").innerHTML = '<div class="moderation-empty">No se pudieron cargar las publicaciones. Revisá RLS y la consola del navegador (F12).</div>';
    setNotice(`Error al cargar: ${error.message || "fallo desconocido"}`, "error");
  } finally {
    busy = false;
    $("refreshBtn").disabled = false;
  }
}

async function setModerationStatus(gameId, newStatus) {
  const game = games.find(g => Number(g.id) === Number(gameId));
  if (!game) return;

  const reasonField = $(`reason-${gameId}`);
  const reason = reasonField?.value.trim() || "";
  if (newStatus === "rechazado" && reason.length < 10) {
    alert("Para rechazar una publicación, escribí un motivo de al menos 10 caracteres.");
    reasonField?.focus();
    return;
  }
  const actionLabel = newStatus === "aprobado" ? "aprobar" : newStatus === "rechazado" ? "rechazar" : "devolver a pendientes";
  if (!confirm(`¿Confirmás ${actionLabel} «${game.title}»?`)) return;

  const buttons = document.querySelectorAll(`[data-id="${gameId}"]`);
  buttons.forEach(button => button.disabled = true);
  try {
    const { data, error } = await supabase.rpc("admin_resolver_juego", {
      p_juego_id: Number(gameId),
      p_estado: newStatus,
      p_motivo: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.message || "La base de datos no confirmó la decisión.");
    setNotice(`«${game.title}» quedó ${newStatus}.`, "success");
    await loadGames();
  } catch (error) {
    console.error("Error guardando decisión:", error);
    setNotice(`No se pudo guardar: ${error.message || "revisá las políticas RLS"}`, "error");
    alert("No se pudo guardar la decisión. Revisá que el usuario tenga rol moderador/root y mirá la consola (F12).");
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

$("refreshBtn").addEventListener("click", loadGames);
$("searchInput").addEventListener("input", renderGames);
$("statusFilter").addEventListener("change", renderGames);
$("gamesList").addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const status = button.dataset.action === "approve" ? "aprobado"
    : button.dataset.action === "reject" ? "rechazado" : "pendiente";
  setModerationStatus(Number(button.dataset.id), status);
});

if (await verifyAccess()) await loadGames();
