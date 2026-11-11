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
  const missingAge = !g.clasificacion_edad || g.clasificacion_edad === "Pendiente de clasificación";
  const missingMeta = missingCategory || missingAge;
  const canEditMetadata = currentRole === "root" || (!isOfficial(g) && g.user_id === currentUserId);
  const metadataNotice = missingMeta ? `<div class="creator-metadata-alert" role="status"><strong>⚠ Falta completar la ficha de este juego.</strong><p>${[missingCategory ? "confirmar categoría" : "", missingAge ? "clasificación por edad" : ""].filter(Boolean).join(", ")}.</p>${canEditMetadata ? `<button class="creator-button creator-complete-toggle" type="button" data-game-id="${Number(g.id)}" aria-expanded="false">Completar ficha</button><form class="creator-metadata-form" data-game-form="${Number(g.id)}" hidden><label>Categoría<select name="categoria" required><option value="">Elegí una categoría</option>${["Acción y lucha","Aventura y RPG","Plataformas","Carreras","Estrategia","Puzzle y lógica","Terror","Simulación","Deportes","Casual","Otro"].map(value => `<option value="${value}" ${g.categoria === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><p class="creator-muted">Disponibilidad de ports: ${g.download_url_pc && g.download_url_mobile ? "PC + Móvil" : (g.download_url_mobile || String(g.plataforma || "").toLowerCase().includes("móvil")) ? "Móvil" : "PC"}. Se actualiza automáticamente según los enlaces cargados.</p><label class="creator-age-field">Clasificación por edad<select name="clasificacion_edad" required><option value="Pendiente de clasificación" ${g.clasificacion_edad === "Pendiente de clasificación" ? "selected" : ""}>Pendiente de clasificación</option>${["Menores de 13","13+","16+","18+"].map(value => `<option value="${value}" ${g.clasificacion_edad === value ? "selected" : ""}>${value}</option>`).join("")}</select><small>Elegí según el contenido real del juego. Si no lo sabés, dejalo pendiente y consultá a moderación.</small></label><div class="creator-metadata-actions"><button class="creator-button" type="submit">Guardar cambios</button><button class="creator-button creator-button-quiet" type="button" data-game-cancel="${Number(g.id)}">Cancelar</button></div><p class="creator-metadata-feedback" data-game-feedback="${Number(g.id)}" aria-live="polite"></p></form>` : ""}</div>` : "";
  const legacyMobile = /m[oó]vil/i.test(String(g.plataforma || ""));
  const pcPort = g.download_url_pc || (!g.download_url_mobile && !legacyMobile ? g.download_url : "");
  const mobilePort = g.download_url_mobile || (legacyMobile ? g.download_url : "");
  const download = `<div class="creator-port-links">${pcPort ? `<a class="creator-text-link" href="${escapeHTML(pcPort)}" target="_blank" rel="noopener noreferrer">Ver port PC ↗</a>` : `<span class="creator-muted">Sin port PC</span>`}${mobilePort ? `<a class="creator-text-link" href="${escapeHTML(mobilePort)}" target="_blank" rel="noopener noreferrer">Ver port móvil ↗</a>` : `<span class="creator-muted">Sin port móvil</span>`}</div>`;
  const portEditor = canEditMetadata ? `<button class="creator-button creator-port-toggle" type="button" data-port-toggle="${Number(g.id)}" aria-expanded="false">Agregar o actualizar ports</button><form class="creator-metadata-form creator-port-form" data-port-form="${Number(g.id)}" hidden><label>Enlace para PC<input type="url" name="download_url_pc" value="${escapeHTML(pcPort)}" placeholder="https://..." /></label><label>Enlace para móvil<input type="url" name="download_url_mobile" value="${escapeHTML(mobilePort)}" placeholder="https://..." /></label><small>Dejá vacío el port que todavía no exista. Tiene que quedar al menos uno.</small><div class="creator-metadata-actions"><button class="creator-button" type="submit">Guardar ports</button><button class="creator-button creator-button-quiet" type="button" data-port-cancel="${Number(g.id)}">Cancelar</button></div><p class="creator-metadata-feedback" data-port-feedback="${Number(g.id)}" aria-live="polite"></p></form>` : "";
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
      ${portEditor}
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
      .select("id,title,description,created_at,author,image_url,download_url,download_url_pc,download_url_mobile,user_id,publish_at,likes_count,views_count,playing_count,es_proyecto_oficial,estado_moderacion,motivo_revision,categoria,plataforma,clasificacion_edad,categoria_confirmada")
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
  const portForm = event.target.closest("form[data-port-form]");
  if (portForm) {
    event.preventDefault();
    const gameId = Number(portForm.dataset.portForm);
    const game = myGames.find(item => Number(item.id) === gameId);
    const canManage = game && (currentRole === "root" || (!isOfficial(game) && game.user_id === currentUserId));
    if (!canManage) return;
    const pc = portForm.elements.download_url_pc.value.trim();
    const mobile = portForm.elements.download_url_mobile.value.trim();
    const feedback = document.querySelector(`[data-port-feedback="${gameId}"]`);
    const valid = value => { if (!value) return true; try { const u = new URL(value); return u.protocol === "https:" && ["drive.google.com","mediafire.com"].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)); } catch { return false; } };
    if ((!pc && !mobile) || !valid(pc) || !valid(mobile)) { if (feedback) feedback.textContent = "Ingresá al menos un enlace HTTPS válido de Google Drive o MediaFire."; return; }
    const submit = portForm.querySelector('button[type="submit"]'); submit.disabled = true; if (feedback) feedback.textContent = "Guardando…";
    try {
      // Los permisos UPDATE directos de juegos están restringidos por RLS.
      // La RPC valida propietario/rol en servidor y actualiza únicamente los ports.
      const { data, error } = await supabase.rpc("actualizar_ports_juego", {
        p_juego_id: gameId,
        p_download_url_pc: pc || null,
        p_download_url_mobile: mobile || null
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "No se pudieron actualizar los ports.");
      Object.assign(game, {
        download_url_pc: data.download_url_pc,
        download_url_mobile: data.download_url_mobile,
        download_url: data.download_url,
        plataforma: data.plataforma
      });
      renderGames(); setNotice(`Ports de “${game.title}” actualizados.`, "success");
    } catch (error) {
      const missingRpc = error?.code === "PGRST202" || /actualizar_ports_juego.*(not found|schema cache)|could not find the function/i.test(error?.message || "");
      const message = missingRpc
        ? "Falta aplicar la migración 20261106150000_add_secure_game_ports_rpc.sql en Supabase."
        : (error.message || "error desconocido");
      if (feedback) feedback.textContent = `No se pudieron guardar los ports: ${message}`;
    }
    finally { submit.disabled = false; }
    return;
  }
  const form = event.target.closest("form[data-game-form]");
  if (!form) return;
  event.preventDefault();
  const gameId = Number(form.dataset.gameForm);
  const game = myGames.find(item => Number(item.id) === gameId);
  const canManageGame = game && (
    currentRole === "root" || (!isOfficial(game) && game.user_id === currentUserId)
  );
  if (!canManageGame) {
    setNotice("Solo podés editar tus publicaciones. La edición de juegos de la comunidad y oficiales está reservada a root.", "error");
    return;
  }
  const category = form.elements.categoria.value.trim();
  const platform = game.download_url_pc ? "PC" : (game.download_url_mobile || String(game.plataforma || "").toLowerCase().includes("móvil")) ? "Móvil" : "PC";
  const ageRating = form.elements.clasificacion_edad.value.trim();
  const feedback = document.querySelector(`[data-game-feedback="${gameId}"]`);
  const submit = form.querySelector('button[type="submit"]');
  if (!category || !ageRating) {
    if (feedback) feedback.textContent = "Elegí una categoría y una clasificación por edad.";
    return;
  }
  submit.disabled = true;
  if (feedback) feedback.textContent = "Guardando…";
  try {
    let updateQuery = supabase
      .from("juegos")
      .update({ categoria: category, plataforma: platform, clasificacion_edad: ageRating, categoria_confirmada: true })
      .eq("id", gameId);

    // Root puede corregir juegos oficiales y publicaciones de cualquier creador.
    // Los demás roles quedan limitados a sus propias publicaciones.
    if (currentRole !== "root") updateQuery = updateQuery.eq("user_id", currentUserId);

    const { data, error } = await updateQuery
      .select("id,categoria,plataforma,clasificacion_edad,categoria_confirmada")
      .single();
    if (error) throw error;
    Object.assign(game, data);
    renderGames();
    setNotice(`Ficha de “${game.title}” guardada correctamente.`, "success");
  } catch (error) {
    console.error("No se pudo guardar la ficha del juego:", error);
    const permissionHint = error.code === "42501" || /permission|policy|row-level security|rls/i.test(error.message || "")
      ? " La base de datos está bloqueando la edición por sus políticas RLS; hay que habilitar UPDATE para root en la tabla juegos."
      : "";
    if (feedback) feedback.textContent = `No se pudo guardar: ${error.message || "error desconocido"}.${permissionHint}`;
  } finally {
    submit.disabled = false;
  }
}

function handleMetadataActions(event) {
  const portToggle = event.target.closest("[data-port-toggle]");
  if (portToggle) { const form = document.querySelector(`[data-port-form="${portToggle.dataset.portToggle}"]`); if (form) { form.hidden = !form.hidden; portToggle.setAttribute("aria-expanded", String(!form.hidden)); } return; }
  const portCancel = event.target.closest("[data-port-cancel]");
  if (portCancel) { const id = portCancel.dataset.portCancel; const form = document.querySelector(`[data-port-form="${id}"]`); if (form) form.hidden = true; return; }
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
    const moderationShortcut = $("creatorModerationShortcut");
    if (moderationShortcut) moderationShortcut.hidden = !["moderador", "root"].includes(role);
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
