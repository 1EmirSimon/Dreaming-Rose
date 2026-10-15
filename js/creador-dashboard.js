import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
let myGames = [];
let visitCounts = new Map();
let visitsAvailable = true;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

function fmt(value) {
  return new Intl.NumberFormat("es-AR").format(Number(value) || 0);
}

function setNotice(message, type = "") {
  const el = $("creatorNotice");
  el.className = `creator-notice ${type}`.trim();
  el.textContent = message;
}

function statusLabel(game) {
  const status = game.estado_moderacion || "pendiente";
  const scheduled = game.publish_at && new Date(game.publish_at) > new Date();
  if (status === "aprobado" && scheduled) return { text: "Aprobado · programado", cls: "scheduled" };
  const map = {
    pendiente: ["Pendiente de revisión", "pending"],
    aprobado: ["Aprobado", "approved"],
    rechazado: ["Rechazado", "rejected"]
  };
  const pair = map[status] || [status, "pending"];
  return { text: pair[0], cls: pair[1] };
}

function renderSummary() {
  $("metricGames").textContent = fmt(myGames.length);
  $("metricLikes").textContent = fmt(myGames.reduce((sum, g) => sum + (Number(g.likes_count) || 0), 0));
  $("metricApproved").textContent = fmt(myGames.filter(g => g.estado_moderacion === "aprobado").length);
  $("metricVisits").textContent = visitsAvailable
    ? fmt(myGames.reduce((sum, g) => sum + (visitCounts.get(Number(g.id)) || 0), 0))
    : "N/D";
  $("visitsHelp").textContent = visitsAvailable
    ? "Registros encontrados en visitas_juegos"
    : "No disponible: la consulta está bloqueada o falló";
}

function renderGames() {
  const term = $("creatorSearch").value.trim().toLocaleLowerCase("es-AR");
  const filtered = myGames.filter(g =>
    [g.title, g.description, g.author].filter(Boolean).join(" ").toLocaleLowerCase("es-AR").includes(term)
  );
  const container = $("creatorGames");

  if (!filtered.length) {
    container.innerHTML = `<div class="creator-empty">${myGames.length ? "No hay juegos que coincidan con la búsqueda." : "Todavía no tenés juegos asociados a esta cuenta."}</div>`;
    return;
  }

  container.innerHTML = filtered.map(g => {
    const status = statusLabel(g);
    const image = g.image_url
      ? `<img class="creator-game-cover" src="${escapeHTML(g.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="creator-game-cover creator-no-cover">✿</div>`;
    const visits = visitsAvailable ? fmt(visitCounts.get(Number(g.id)) || 0) : "N/D";
    const published = g.created_at ? new Date(g.created_at).toLocaleDateString("es-AR") : "Sin fecha";
    const reason = g.motivo_revision ? `<p class="creator-reason"><strong>Motivo de revisión:</strong> ${escapeHTML(g.motivo_revision)}</p>` : "";
    const download = g.download_url
      ? `<a class="creator-text-link" href="${escapeHTML(g.download_url)}" target="_blank" rel="noopener noreferrer">Abrir enlace de descarga ↗</a>`
      : `<span class="creator-muted">Sin enlace de descarga</span>`;

    return `<article class="creator-game-card">
      ${image}
      <div class="creator-game-content">
        <div class="creator-game-topline">
          <div><p class="creator-game-id">JUEGO #${Number(g.id)} · CREADO ${escapeHTML(published)}</p><h3>${escapeHTML(g.title || "Juego sin título")}</h3></div>
          <span class="creator-status ${status.cls}">${escapeHTML(status.text)}</span>
        </div>
        <p class="creator-game-description">${escapeHTML(g.description || "Sin descripción.")}</p>
        ${reason}
        <div class="creator-game-stats">
          <div><span>Likes</span><strong>♥ ${fmt(g.likes_count)}</strong></div>
          <div><span>Visitas</span><strong>${visits}</strong></div>
          <div><span>Vistas contador</span><strong>${fmt(g.views_count)}</strong></div>
        </div>
        <div class="creator-game-footer">${download}<span class="creator-muted">${g.es_proyecto_oficial ? "Proyecto oficial" : "Juego de comunidad"}</span></div>
      </div>
    </article>`;
  }).join("");
}

async function loadDashboard(user) {
  $("creatorRefresh").disabled = true;
  setNotice("Actualizando datos del dashboard…");
  try {
    const { data, error } = await supabase
      .from("juegos")
      .select("id,title,description,created_at,author,image_url,download_url,user_id,publish_at,likes_count,views_count,playing_count,es_proyecto_oficial,estado_moderacion,motivo_revision")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    myGames = data || [];
    visitCounts = new Map();
    visitsAvailable = true;

    if (myGames.length) {
      const ids = myGames.map(g => Number(g.id));
      const { data: visits, error: visitsError } = await supabase
        .from("visitas_juegos")
        .select("juego_id")
        .in("juego_id", ids);

      if (visitsError) {
        visitsAvailable = false;
        console.warn("No se pudieron consultar visitas_juegos:", visitsError.message);
      } else {
        for (const row of visits || []) {
          const id = Number(row.juego_id);
          visitCounts.set(id, (visitCounts.get(id) || 0) + 1);
        }
      }
    }

    renderSummary();
    renderGames();
    setNotice(`Datos actualizados. ${myGames.length} juego(s) asociado(s) a tu cuenta.`, "success");
  } catch (error) {
    console.error("Error del dashboard de creador:", error);
    setNotice(`No se pudieron cargar tus juegos: ${error.message || "error desconocido"}. Verificá las políticas RLS de juegos.`, "error");
    $("creatorGames").innerHTML = `<div class="creator-empty">No se pudieron cargar las publicaciones. Revisá la consola del navegador (F12).</div>`;
  } finally {
    $("creatorRefresh").disabled = false;
  }
}

async function init() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setNotice("Necesitás iniciar sesión para entrar al dashboard.", "error");
      $("creatorIdentity").textContent = "Sesión no iniciada";
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("usuarios")
      .select("username,role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) throw profileError || new Error("No se encontró el perfil.");
    const role = String(profile.role || "usuario").toLowerCase();
    if (!["creador", "moderador", "root"].includes(role)) {
      setNotice("Tu cuenta todavía no tiene rol de creador. Podés solicitarlo desde la página principal.", "error");
      $("creatorIdentity").textContent = `@${profile.username || "usuario"}`;
      return;
    }

    $("creatorIdentity").textContent = `@${profile.username || "creador"} · ${role.toUpperCase()}`;
    $("creatorDashboard").hidden = false;
    await loadDashboard(user);
  } catch (error) {
    console.error(error);
    setNotice(`No se pudo verificar tu cuenta: ${error.message || "error desconocido"}`, "error");
  }
}

$("creatorRefresh").addEventListener("click", async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await loadDashboard(user);
});
$("creatorSearch").addEventListener("input", renderGames);
await init();
