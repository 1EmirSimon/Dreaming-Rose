import { supabase } from "./supabase.js";

const $ = (id) => document.getElementById(id);
let myGames = [];
let visitCounts = new Map();
let visitsAvailable = true;
let currentUserId = null;
let currentRole = "usuario";

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

function isOfficial(game) {
  return game.es_proyecto_oficial === true;
}

function renderSummary() {
  const likes = myGames.reduce((sum, g) => sum + (Number(g.likes_count) || 0), 0);
  const approved = myGames.filter(g => g.estado_moderacion === "aprobado").length;
  const visits = myGames.reduce((sum, g) => sum + (visitCounts.get(Number(g.id)) || 0), 0);
  $("metricGames").textContent = fmt(myGames.length);
  $("metricLikes").textContent = fmt(likes);
  $("metricApproved").textContent = fmt(approved);
  $("metricVisits").textContent = visitsAvailable ? fmt(visits) : "N/D";
  $("visitsHelp").textContent = visitsAvailable
    ? (currentRole === "root" ? "Visitas de los juegos visibles para root" : "Registros encontrados en visitas_juegos")
    : "No disponible: la consulta está bloqueada o falló";
  $("gamesMetricHelp").textContent = currentRole === "root"
    ? "Juegos oficiales y publicaciones de la comunidad"
    : "Publicaciones asociadas a tu cuenta";
}

function gameCard(g) {
  const status = statusLabel(g);
  const image = g.image_url
    ? `<img class="creator-game-cover" src="${escapeHTML(g.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="creator-game-cover creator-no-cover">✿</div>`;
  const visits = visitsAvailable ? fmt(visitCounts.get(Number(g.id)) || 0) : "N/D";
  const published = g.created_at ? new Date(g.created_at).toLocaleDateString("es-AR") : "Sin fecha";
  const reason = g.motivo_revision ? `<p class="creator-reason"><strong>Motivo de revisión:</strong> ${escapeHTML(g.motivo_revision)}</p>` : "";
  const missingCategory = !g.categoria || g.categoria_confirmada !== true;
  const missingPlatform = !g.plataforma;
  const missingAge = !g.clasificacion_edad || g.clasificacion_edad === "Pendiente de clasificación";
  const missingMeta = missingCategory || missingPlatform || missingAge;
  const canEditMetadata = !isOfficial(g) && g.user_id === currentUserId;
  const metadataNotice = missingMeta ? `<div class="creator-metadata-alert" role="status"><strong>⚠ Falta completar la ficha de este juego.</strong><p>${[missingCategory ? "confirmar categoría" : "", missingPlatform ? "plataforma" : "", missingAge ? "clasificación por edad" : ""].filter(Boolean).join(", ")}.</p>${canEditMetadata ? `<button class="creator-button creator-complete-toggle" type="button" data-game-id="${Number(g.id)}" aria-expanded="false">Completar ficha</button><form class="creator-metadata-form" data-game-form="${Number(g.id)}" hidden><label>Categoría<select name="categoria" required><option value="">Elegí una categoría</option>${["Acción y lucha","Aventura y RPG","Plataformas","Carreras","Estrategia","Puzzle y lógica","Terror","Simulación","Deportes","Casual","Otro"].map(value => `<option value="${value}" ${g.categoria === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Plataforma<select name="plataforma" required><option value="">Elegí una plataforma</option>${["PC","Móvil","Linux","Mac","Otra"].map(value => `<option value="${value}" ${g.plataforma === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="creator-age-field">Clasificación por edad<select name="clasificacion_edad" required><option value="Pendiente de clasificación" ${g.clasificacion_edad === "Pendiente de clasificación" ? "selected" : ""}>Pendiente de clasificación</option>${["Menores de 13","13+","16+","18+"].map(value => `<option value="${value}" ${g.clasificacion_edad === value ? "selected" : ""}>${value}</option>`).join("")}</select><small>Elegí según el contenido real del juego. Si no lo sabés, dejalo pendiente y consultá a moderación.</small></label><div class="creator-metadata-actions"><button class="creator-button" type="submit">Guardar cambios</button><button class="creator-button creator-button-quiet" type="button" data-game-cancel="${Number(g.id)}">Cancelar</button></div><p class="creator-metadata-feedback" data-game-feedback="${Number(g.id)}" aria-live="polite"></p></form>` : ""}</div>` : "";
  const download = g.download_url
    ? `<a class="creator-text-link" href="${escapeHTML(g.download_url)}" target="_blank" rel="noopener noreferrer">Abrir enlace de descarga ↗</a>`
    : `<span class="creator-muted">Sin enlace de descarga</span>`;
  const ownership = isOfficial(g) ? "Proyecto oficial Dreaming Rose" : (g.user_id === currentUserId ? "Tu publicación" : `Comunidad · ${escapeHTML(g.author || "Creador")}`);

  return `<article class="creator-game-card">
    ${image}
    <div class="creator-game-content">
      <div class="creator-game-topline">
        <div><p class="creator-game-id">JUEGO #${Number(g.id)} · ${escapeHTML(published)}</p><h3>${escapeHTML(g.title || "Juego sin título")}</h3></div>
        <span class="creator-status ${status.cls}">${escapeHTML(status.text)}</span>
      </div>
      <p class="creator-game-description">${escapeHTML(g.description || "Sin descripción.")}</p>
      <p class="creator-game-id">${escapeHTML(g.categoria || "Sin categoría")} · ${escapeHTML(g.plataforma || "PC")}</p>
      ${reason}
      ${metadataNotice}
      <div class="creator-game-stats">
        <div><span>Likes</span><strong>♥ ${fmt(g.likes_count)}</strong></div>
        <div><span>Visitas</span><strong>${visits}</strong></div>
        <div><span>Vistas contador</span><strong>${fmt(g.views_count)}</strong></div>
      </div>
      <div class="creator-game-footer">${download}<span class="creator-muted">${ownership}</span></div>
    </div>
  </article>`;
}

function renderGames() {
  const term = $("creatorSearch").value.trim().toLocaleLowerCase("es-AR");
  const filtered = myGames.filter(g =>
    [g.title, g.description, g.author, g.categoria, g.plataforma].filter(Boolean).join(" ").toLocaleLowerCase("es-AR").includes(term)
  );
  const container = $("creatorGames");
  if (!filtered.length) {
    container.innerHTML = `<div class="creator-empty">${myGames.length ? "No hay juegos que coincidan con la búsqueda." : (currentRole === "root" ? "No se encontraron juegos visibles. Revisá la consulta y las políticas de lectura." : "Todavía no tenés juegos asociados a esta cuenta.")}</div>`;
    return;
  }

  const official = filtered.filter(isOfficial);
  const own = filtered.filter(g => !isOfficial(g) && g.user_id === currentUserId);
  const community = currentRole === "root"
    ? filtered.filter(g => !isOfficial(g) && g.user_id !== currentUserId)
    : [];
  const sections = [];
  const addSection = (title, subtitle, games, key) => {
    if (!games.length) return;
    sections.push(`<section id="creatorGroup-${key}" class="creator-game-group"><div class="creator-group-heading"><div><h3>${title}</h3><p>${subtitle}</p></div><span>${games.length}</span></div><div class="creator-games-list">${games.map(gameCard).join("")}</div></section>`);
  };
  addSection("Juegos oficiales de Dreaming Rose", "Catálogo oficial, incluso si no tiene un usuario creador asociado.", official, "official");
  addSection(currentRole === "root" ? "Publicaciones de tu cuenta" : "Tus publicaciones", "Juegos enviados desde el botón Publicar.", own, "own");
  if (currentRole === "root") addSection("Publicaciones de la comunidad", "Visión general de los juegos enviados por otros usuarios.", community, "community");
  container.innerHTML = sections.join("") || `<div class="creator-empty">No hay juegos para mostrar.</div>`;
}

async function loadDashboard(user) {
  $("creatorRefresh").disabled = true;
  setNotice("Actualizando datos del dashboard…");
  try {
    let gamesQuery = supabase
      .from("juegos")
      .select("id,title,description,created_at,author,image_url,download_url,user_id,publish_at,likes_count,views_count,playing_count,es_proyecto_oficial,estado_moderacion,motivo_revision,categoria,plataforma,clasificacion_edad,categoria_confirmada")
      .order("es_proyecto_oficial", { ascending: false })
      .order("created_at", { ascending: false });

    // Root is the site owner: load official Dreaming Rose games (including user_id NULL)
    // plus all community submissions. Other roles only see their own submissions.
    if (currentRole !== "root") gamesQuery = gamesQuery.eq("user_id", user.id);
    const { data, error } = await gamesQuery;

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
    setNotice(currentRole === "root"
      ? `Datos actualizados. ${myGames.length} juego(s) visibles: catálogo oficial y publicaciones de la comunidad.`
      : `Datos actualizados. ${myGames.length} juego(s) asociado(s) a tu cuenta.`, "success");
  } catch (error) {
    console.error("Error del dashboard de creador:", error);
    setNotice(`No se pudieron cargar tus juegos: ${error.message || "error desconocido"}. Verificá las políticas RLS de juegos.`, "error");
    $("creatorGames").innerHTML = `<div class="creator-empty">No se pudieron cargar las publicaciones. Revisá la consola del navegador (F12).</div>`;
  } finally {
    $("creatorRefresh").disabled = false;
  }
}

async function saveGameMetadata(event) {
  const form = event.target.closest("form[data-game-form]");
  if (!form) return;
  event.preventDefault();
  const gameId = Number(form.dataset.gameForm);
  const game = myGames.find(item => Number(item.id) === gameId);
  if (!game || game.user_id !== currentUserId || isOfficial(game)) {
    setNotice("Solo podés completar los datos de tus propias publicaciones.", "error");
    return;
  }
  const category = form.elements.categoria.value.trim();
  const platform = form.elements.plataforma.value.trim();
  const ageRating = form.elements.clasificacion_edad.value.trim();
  const feedback = document.querySelector(`[data-game-feedback="${gameId}"]`);
  const submit = form.querySelector('button[type="submit"]');
  if (!category || !platform || !ageRating) {
    if (feedback) feedback.textContent = "Elegí una categoría, una plataforma y una clasificación por edad.";
    return;
  }
  submit.disabled = true;
  if (feedback) feedback.textContent = "Guardando…";
  try {
    const { data, error } = await supabase
      .from("juegos")
      .update({ categoria: category, plataforma: platform, clasificacion_edad: ageRating, categoria_confirmada: true })
      .eq("id", gameId)
      .eq("user_id", currentUserId)
      .select("id,categoria,plataforma,clasificacion_edad,categoria_confirmada")
      .single();
    if (error) throw error;
    Object.assign(game, data);
    renderGames();
    setNotice(`Ficha de “${game.title}” guardada correctamente.`, "success");
  } catch (error) {
    console.error("No se pudieron guardar categoría y plataforma:", error);
    if (feedback) feedback.textContent = `No se pudo guardar: ${error.message || "error desconocido"}. Revisá los permisos RLS de juegos.`;
  } finally {
    submit.disabled = false;
  }
}

function handleMetadataActions(event) {
  const toggle = event.target.closest("[data-game-id]");
  if (toggle && toggle.classList.contains("creator-complete-toggle")) {
    const form = document.querySelector(`[data-game-form="${toggle.dataset.gameId}"]`);
    if (form) {
      form.hidden = !form.hidden;
      toggle.setAttribute("aria-expanded", String(!form.hidden));
      toggle.textContent = form.hidden ? "Completar ficha" : "Ocultar formulario";
    }
    return;
  }
  const cancel = event.target.closest("[data-game-cancel]");
  if (cancel) {
    const id = cancel.dataset.gameCancel;
    const form = document.querySelector(`[data-game-form="${id}"]`);
    const toggleButton = document.querySelector(`.creator-complete-toggle[data-game-id="${id}"]`);
    if (form) form.hidden = true;
    if (toggleButton) {
      toggleButton.setAttribute("aria-expanded", "false");
      toggleButton.textContent = "Completar ficha";
    }
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
    currentUserId = user.id;
    currentRole = role;
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
$("creatorGames").addEventListener("click", handleMetadataActions);
$("creatorGames").addEventListener("submit", saveGameMetadata);
await init();
