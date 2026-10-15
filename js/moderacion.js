import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

const ALLOWED_ROLES = ["moderador", "root"];
const $ = (id) => document.getElementById(id);
let currentUser = null;
let games = [];
let busy = false;

function setNotice(message, type = "") {
  const el = $("notice");
  el.className = `notice ${type}`.trim();
  el.textContent = message;
}

function safeDate(value) {
  if (!value) return "Sin fecha";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Fecha desconocida" : d.toLocaleString("es-AR");
}

function visibleStatusCount(status) {
  return games.filter((g) => g.estado_moderacion === status).length;
}

function updateStats() {
  $("pendingCount").textContent = visibleStatusCount("pendiente");
  $("approvedCount").textContent = visibleStatusCount("aprobado");
  $("rejectedCount").textContent = visibleStatusCount("rechazado");
}

function filteredGames() {
  const status = $("statusFilter").value;
  const term = $("searchInput").value.trim().toLocaleLowerCase("es-AR");
  return games.filter((g) => {
    const statusOk = status === "todos" || g.estado_moderacion === status;
    const haystack = [g.title, g.author, g.description].filter(Boolean).join(" ").toLocaleLowerCase("es-AR");
    return statusOk && (!term || haystack.includes(term));
  });
}

function renderGames() {
  const container = $("gamesList");
  const items = filteredGames();

  if (!items.length) {
    container.innerHTML = '<div class="empty">No hay publicaciones para este filtro.</div>';
    return;
  }

  container.innerHTML = items.map((g) => {
    const title = escapeHTML(g.title || "Juego sin título");
    const author = escapeHTML(g.author || "Creador no indicado");
    const desc = escapeHTML(g.description || "Sin descripción.");
    const image = escapeHTML(g.image_url || "");
    const download = escapeHTML(g.download_url || "");
    const status = escapeHTML(g.estado_moderacion || "pendiente");
    const reason = escapeHTML(g.motivo_revision || "");
    const official = g.es_proyecto_oficial ? '<span class="badge">Proyecto oficial</span>' : "";
    const imageHTML = image
      ? `<img class="cover" src="${image}" alt="Portada de ${title}" loading="lazy" referrerpolicy="no-referrer">`
      : '<div class="cover" style="display:grid;place-items:center;color:#8a93aa">Sin portada</div>';
    const downloadHTML = download
      ? `<a href="${download}" target="_blank" rel="noopener noreferrer">Abrir enlace de descarga ↗</a>`
      : "<span>Sin enlace de descarga</span>";

    return `
      <article class="game" data-game-id="${Number(g.id)}">
        ${imageHTML}
        <div class="game-body">
          <div class="game-head">
            <div><h2>${title}</h2><span class="badge">Estado: ${status}</span> ${official}</div>
            <span class="meta">ID #${Number(g.id)}</span>
          </div>
          <div class="meta">
            <span>Autor: ${author}</span>
            <span>Creado: ${safeDate(g.created_at)}</span>
            <span>Programación: ${safeDate(g.publish_at)}</span>
          </div>
          <p class="desc">${desc}</p>
          <div class="links">${downloadHTML}</div>
          ${g.estado_moderacion === "pendiente" || g.estado_moderacion === "rechazado"
            ? `<label for="reason-${Number(g.id)}">Motivo (obligatorio para rechazar; opcional para aprobar)</label>
               <textarea class="reason" id="reason-${Number(g.id)}" maxlength="1000" placeholder="Escribí el motivo de la decisión…">${reason}</textarea>`
            : `<p class="meta">Motivo registrado: ${reason || "Sin motivo"}</p>`}
          <div class="actions">
            ${g.estado_moderacion !== "aprobado" ? `<button class="btn btn-primary" type="button" data-action="approve" data-id="${Number(g.id)}">✓ Aprobar publicación</button>` : ""}
            ${g.estado_moderacion !== "rechazado" ? `<button class="btn btn-danger" type="button" data-action="reject" data-id="${Number(g.id)}">✕ Rechazar publicación</button>` : ""}
            ${g.estado_moderacion !== "pendiente" ? `<button class="btn" type="button" data-action="pending" data-id="${Number(g.id)}">↺ Volver a pendiente</button>` : ""}
          </div>
        </div>
      </article>`;
  }).join("");
}

async function verifyAccess() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    setNotice("Tenés que iniciar sesión con una cuenta moderador o root para entrar.", "error");
    $("gamesList").innerHTML = '<div class="empty">Iniciá sesión en la web y después volvé a abrir este panel.</div>';
    return false;
  }

  const { data: profile, error } = await supabase
    .from("usuarios")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = (profile?.role || "").toLowerCase();
  if (error || !ALLOWED_ROLES.includes(role)) {
    setNotice("Acceso denegado. Este panel es exclusivo para moderador y root.", "error");
    $("gamesList").innerHTML = '<div class="empty">Tu cuenta no tiene permisos de moderación.</div>';
    return false;
  }

  currentUser = user;
  setNotice(`Sesión verificada. Rol: ${role}. Los cambios quedan registrados en la base de datos.`, "success");
  return true;
}

async function loadGames() {
  if (busy) return;
  busy = true;
  $("refreshBtn").disabled = true;
  $("gamesList").innerHTML = '<div class="empty">Cargando publicaciones…</div>';

  try {
    const { data, error } = await supabase
      .from("juegos")
      .select("id,title,description,created_at,author,image_url,download_url,user_id,publish_at,es_proyecto_oficial,estado_moderacion,revisado_por,revisado_at,motivo_revision")
      .order("created_at", { ascending: false });

    if (error) throw error;
    games = data || [];
    updateStats();
    renderGames();
  } catch (error) {
    console.error("Error cargando juegos para moderación:", error);
    $("gamesList").innerHTML = '<div class="empty">No se pudieron cargar las publicaciones. Revisá las políticas RLS de la tabla juegos y la consola (F12).</div>';
    setNotice(`Error al cargar: ${error.message || "fallo desconocido"}`, "error");
  } finally {
    busy = false;
    $("refreshBtn").disabled = false;
  }
}

async function setModerationStatus(gameId, newStatus) {
  const game = games.find((g) => Number(g.id) === Number(gameId));
  if (!game) return;

  const reasonField = $(`reason-${gameId}`);
  const reason = reasonField?.value.trim() || "";

  if (newStatus === "rechazado" && !reason) {
    alert("Para rechazar una publicación, escribí el motivo.");
    reasonField?.focus();
    return;
  }

  const actionLabel = newStatus === "aprobado" ? "aprobar" : newStatus === "rechazado" ? "rechazar" : "dejar pendiente";
  if (!confirm(`¿Confirmás ${actionLabel} «${game.title}»?`)) return;

  const buttons = document.querySelectorAll(`[data-id="${gameId}"]`);
  buttons.forEach((b) => b.disabled = true);

  try {
    // El trigger de la base completa revisado_por y revisado_at al cambiar el estado.
    const { error } = await supabase
      .from("juegos")
      .update({
        estado_moderacion: newStatus,
        motivo_revision: reason || null
      })
      .eq("id", gameId);

    if (error) throw error;
    setNotice(`La publicación «${game.title}» ahora está ${newStatus}.`, "success");
    await loadGames();
  } catch (error) {
    console.error("Error guardando decisión de moderación:", error);
    setNotice(`No se pudo guardar la decisión: ${error.message || "revisá las políticas RLS"}`, "error");
    alert("No se pudo guardar la decisión. Verificá que la política UPDATE de juegos permita a moderador/root y revisá la consola (F12).");
  } finally {
    buttons.forEach((b) => b.disabled = false);
  }
}

$("refreshBtn").addEventListener("click", loadGames);
$("searchInput").addEventListener("input", renderGames);
$("statusFilter").addEventListener("change", renderGames);
$("gamesList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);
  const action = button.dataset.action;
  const status = action === "approve" ? "aprobado" : action === "reject" ? "rechazado" : "pendiente";
  setModerationStatus(id, status);
});

if (await verifyAccess()) {
  await loadGames();
}
