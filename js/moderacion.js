import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const ALLOWED_ROLES = new Set(["moderador", "root"]);
const $ = (id) => document.getElementById(id);
let games = [];
let loading = false;
const activeActions = new Set();

function safeText(value, fallback = "—") {
  return escapeHTML(value == null || value === "" ? fallback : String(value));
}

function safeDate(value) {
  if (!value) return "No programada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha desconocida" : date.toLocaleString("es-AR");
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function statusLabel(status) {
  return ({ pendiente: "PENDIENTE", aprobado: "APROBADO", rechazado: "RECHAZADO" })[status] || "PENDIENTE";
}

function setNotice(message, type = "") {
  const element = $("notice");
  if (!element) return;
  element.className = `moderation-notice ${type}`.trim();
  element.textContent = message;
}

function updateStats() {
  $("pendingCount").textContent = String(games.filter((game) => game.estado_moderacion === "pendiente").length);
  $("approvedCount").textContent = String(games.filter((game) => game.estado_moderacion === "aprobado").length);
  $("rejectedCount").textContent = String(games.filter((game) => game.estado_moderacion === "rechazado").length);
}

function filteredGames() {
  const status = $("statusFilter").value;
  const term = $("searchInput").value.trim().toLocaleLowerCase("es-AR");
  return games.filter((game) => {
    const statusMatches = status === "todos" || game.estado_moderacion === status;
    const searchable = [
      game.title, game.author, game.description, game.categoria,
      game.plataforma, game.clasificacion_edad, ...(Array.isArray(game.etiquetas) ? game.etiquetas : [])
    ].filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
    return statusMatches && (!term || searchable.includes(term));
  });
}

function renderScreenshots(game) {
  const screenshots = Array.isArray(game.screenshots) ? game.screenshots : [];
  const valid = screenshots.map(safeHttpsUrl).filter(Boolean).slice(0, 4);
  if (!valid.length) return "";

  return `<div class="moderation-screenshots" aria-label="Capturas del juego">
    ${valid.map((url, index) => `<a href="${safeText(url)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir captura ${index + 1}">
      <img src="${safeText(url)}" alt="Captura ${index + 1} de ${safeText(game.title)}" loading="lazy" referrerpolicy="no-referrer">
    </a>`).join("")}
  </div>`;
}

function renderGame(game) {
  const id = Number(game.id);
  const title = safeText(game.title, "Juego sin título");
  const author = safeText(game.author, "Creador no indicado");
  const description = safeText(game.description, "Sin descripción.");
  const imageUrl = safeHttpsUrl(game.image_url);
  const downloadPC = safeHttpsUrl(game.download_url_pc || game.download_url);
  const downloadMobile = safeHttpsUrl(game.download_url_mobile);
  const status = game.estado_moderacion || "pendiente";
  const reason = safeText(game.motivo_revision || "", "");
  const statusClass = status === "aprobado" ? "approved" : status === "rechazado" ? "rejected" : "pending";
  const official = game.es_proyecto_oficial ? '<span class="moderation-badge">PROYECTO OFICIAL</span>' : "";
  const categoryConfirmed = game.categoria_confirmada ? "Ficha completada" : "Ficha sin confirmar";
  const tags = Array.isArray(game.etiquetas) ? game.etiquetas.slice(0, 3) : [];
  const cover = imageUrl
    ? `<img class="moderation-cover" src="${safeText(imageUrl)}" alt="Portada de ${title}" loading="lazy" referrerpolicy="no-referrer">`
    : '<div class="moderation-cover moderation-cover-empty">SIN PORTADA</div>';
  const download = [
    downloadPC ? `<a href="${safeText(downloadPC)}" target="_blank" rel="noopener noreferrer">Descarga PC ↗</a>` : "",
    downloadMobile ? `<a href="${safeText(downloadMobile)}" target="_blank" rel="noopener noreferrer">Descarga móvil ↗</a>` : ""
  ].filter(Boolean).join(" · ") || "<span>Sin enlaces HTTPS válidos</span>";

  const reasonEditor = status === "aprobado"
    ? `<p class="moderation-review-note">${reason ? `Motivo registrado: ${reason}` : "Sin observaciones registradas."}</p>`
    : `<label for="reason-${id}" class="moderation-reason-label">Motivo de revisión <span>(obligatorio para rechazar)</span></label>
       <textarea class="moderation-reason" id="reason-${id}" maxlength="1000" placeholder="Explicá brevemente qué debe corregirse…">${reason}</textarea>`;

  return `<article class="moderation-game" data-game-id="${id}">
    ${cover}
    <div class="moderation-game-body">
      <div class="moderation-game-head">
        <div class="moderation-game-title-wrap">
          <h2>${title}</h2>
          <span class="moderation-badge ${statusClass}">${statusLabel(status)}</span> ${official}
        </div>
        <span class="moderation-id">ID #${id}</span>
      </div>

      <div class="moderation-meta">
        <span>Autor: <b>${author}</b></span>
        <span>Creado: ${safeDate(game.created_at)}</span>
        <span>Publicación: ${safeDate(game.publish_at)}</span>
      </div>

      <p class="moderation-description">${description}</p>

      <div class="moderation-data-grid">
        <div><small>CATEGORÍA</small><strong>${safeText(game.categoria, "Sin categoría")}</strong></div>
        <div><small>PLATAFORMA</small><strong>${safeText(game.plataforma, "Sin definir")}</strong></div>
        <div><small>CLASIFICACIÓN</small><strong>${safeText(game.clasificacion_edad, "Pendiente")}</strong></div>
        <div><small>FICHA</small><strong>${safeText(categoryConfirmed)}</strong></div>
      </div>

      ${tags.length ? `<div class="moderation-tags">${tags.map((tag) => `<span class="moderation-tag">#${safeText(tag)}</span>`).join("")}</div>` : ""}
      ${renderScreenshots(game)}
      <div class="moderation-links">${download}</div>
      ${reasonEditor}
      ${game.revisado_at ? `<p class="moderation-reviewed">Última revisión: ${safeDate(game.revisado_at)}</p>` : ""}

      <div class="moderation-buttons">
        ${status !== "aprobado" ? `<button class="moderation-button primary" type="button" data-action="approve" data-id="${id}">✓ APROBAR</button>` : ""}
        ${status !== "rechazado" ? `<button class="moderation-button reject" type="button" data-action="reject" data-id="${id}">✕ RECHAZAR</button>` : ""}
        ${status !== "pendiente" ? `<button class="moderation-button" type="button" data-action="pending" data-id="${id}">↺ VOLVER A PENDIENTE</button>` : ""}
      </div>
    </div>
  </article>`;
}

function renderGames() {
  const container = $("gamesList");
  const items = filteredGames();
  if (!items.length) {
    container.innerHTML = '<div class="moderation-empty">No hay publicaciones para este filtro.</div>';
    return;
  }
  container.innerHTML = items.map(renderGame).join("");
}

async function verifyAccess() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    setNotice("Iniciá sesión en Dreaming Rose con una cuenta moderador o root y volvé a esta página.", "error");
    $("gamesList").innerHTML = '<div class="moderation-empty">No hay una sesión activa.</div>';
    return false;
  }

  const { data: profile, error } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = String(profile?.role || "").toLowerCase();
  if (error || !ALLOWED_ROLES.has(role)) {
    setNotice("Acceso denegado. Esta sección es exclusiva para moderador y root.", "error");
    $("gamesList").innerHTML = '<div class="moderation-empty">Tu cuenta no tiene permisos de moderación.</div>';
    return false;
  }

  setNotice(`Sesión verificada · Rol ${role}. Las decisiones se registran en el historial administrativo.`, "success");
  return true;
}

async function loadGames() {
  if (loading) return;
  loading = true;
  $("refreshBtn").disabled = true;
  $("gamesList").innerHTML = '<div class="moderation-empty">Cargando publicaciones…</div>';

  try {
    const { data, error } = await supabase.from("juegos")
      .select("id,title,description,created_at,author,image_url,download_url,download_url_pc,download_url_mobile,user_id,publish_at,es_proyecto_oficial,estado_moderacion,revisado_por,revisado_at,motivo_revision,categoria,plataforma,screenshots,clasificacion_edad,etiquetas,categoria_confirmada")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    games = data || [];
    updateStats();
    renderGames();
  } catch (error) {
    console.error("Error cargando publicaciones:", error);
    $("gamesList").innerHTML = '<div class="moderation-empty">No se pudieron cargar las publicaciones. Revisá los permisos del usuario y la conexión.</div>';
    setNotice(`Error al cargar: ${error.message || "fallo desconocido"}`, "error");
  } finally {
    loading = false;
    $("refreshBtn").disabled = false;
  }
}

async function setModerationStatus(gameId, newStatus, button) {
  const game = games.find((item) => Number(item.id) === Number(gameId));
  if (!game || activeActions.has(gameId)) return;

  const reason = $(`reason-${gameId}`)?.value.trim() || "";
  if (newStatus === "rechazado" && reason.length < 10) {
    alert("Para rechazar una publicación, escribí un motivo de al menos 10 caracteres.");
    $(`reason-${gameId}`)?.focus();
    return;
  }

  const actionLabel = newStatus === "aprobado" ? "aprobar" : newStatus === "rechazado" ? "rechazar" : "devolver a pendientes";
  if (!window.confirm(`¿Confirmás ${actionLabel} «${game.title}»?`)) return;

  activeActions.add(gameId);
  const card = button?.closest(".moderation-game");
  card?.querySelectorAll("button").forEach((item) => { item.disabled = true; });

  try {
    const { data, error } = await supabase.rpc("admin_resolver_juego", {
      p_juego_id: Number(gameId),
      p_estado: newStatus,
      p_motivo: reason
    });
    if (error) throw error;
    if (!data?.ok) throw new Error("Supabase no confirmó la decisión.");

    setNotice(`«${game.title}» quedó ${statusLabel(newStatus).toLowerCase()}.`, "success");
    await loadGames();
  } catch (error) {
    console.error("Error guardando decisión:", error);
    setNotice(`No se pudo guardar: ${error.message || "error desconocido"}`, "error");
  } finally {
    activeActions.delete(gameId);
    card?.querySelectorAll("button").forEach((item) => { item.disabled = false; });
  }
}

$("refreshBtn")?.addEventListener("click", loadGames);
$("searchInput")?.addEventListener("input", renderGames);
$("statusFilter")?.addEventListener("change", renderGames);
$("gamesList")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const status = button.dataset.action === "approve" ? "aprobado"
    : button.dataset.action === "reject" ? "rechazado" : "pendiente";
  void setModerationStatus(Number(button.dataset.id), status, button);
});

if (await verifyAccess()) await loadGames();
