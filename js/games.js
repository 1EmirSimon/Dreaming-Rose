// js/games.js
import { escapeHTML } from "./utils.js";
import { supabase } from "./supabase.js";

let misLikes = new Set();
let allGames = [];
let currentGameId = null;
let publishWidgetId = null;
let BAD_WORDS = ["pelotudo", "boludo", "puto", "imbecil"];
let knownGameIds = new Set();
let knownCommentIds = new Set();

// ============================================================
// CAPTCHA DE PUBLICAR JUEGO
// ============================================================

function initPublishCaptcha() {
    if (!window.turnstile) {
        setTimeout(initPublishCaptcha, 200);
        return;
    }
    const container = document.getElementById("turnstilePublish");
    if (container && publishWidgetId === null) {
        publishWidgetId = window.turnstile.render(container, {
            sitekey: container.dataset.sitekey,
            theme: "dark",
        });
    }
}

// ============================================================
// PALABRAS PROHIBIDAS
// ============================================================

export async function cargarPalabrasProhibidas() {
    try {
        const { data, error } = await supabase
            .from('palabras_prohibidas')
            .select('palabra');

        if (error) {
            console.error("Error cargando palabras prohibidas:", error);
            return;
        }

        if (data && data.length > 0) {
            BAD_WORDS = data.map(row => row.palabra.toLowerCase());
            console.log(`✅ ${BAD_WORDS.length} palabras prohibidas cargadas.`);
        }
    } catch (err) {
        console.error("Excepción cargando palabras prohibidas:", err);
    }
}

// ============================================================
// UTILIDADES
// ============================================================

function animateCount(el, target) {
    if (!el) return;
    const finalValue = Number(target) || 0;
    const duration = 600;
    const start = performance.now();

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(finalValue * eased);
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = finalValue;
    }

    requestAnimationFrame(tick);
}

function mostrarAvisoNuevoJuego(titulo) {
    const aviso = document.createElement("div");
    aviso.className = "new-game-toast";
    aviso.textContent = `🎮 ¡Nuevo juego publicado: ${titulo}!`;
    document.body.appendChild(aviso);

    setTimeout(() => aviso.classList.add("visible"), 10);
    setTimeout(() => {
        aviso.classList.remove("visible");
        setTimeout(() => aviso.remove(), 500);
    }, 5000);
}

function mostrarError(mensaje) {
    const aviso = document.createElement("div");
    aviso.className = "error-toast";
    aviso.innerHTML = `
        <span class="error-icon">
            <svg viewBox="0 0 52 52">
                <line x1="16" y1="16" x2="36" y2="36" />
                <line x1="36" y1="16" x2="16" y2="36" />
            </svg>
        </span>
        <span>${mensaje}</span>
    `;
    document.body.appendChild(aviso);

    setTimeout(() => aviso.classList.add("visible"), 10);
    setTimeout(() => {
        aviso.classList.remove("visible");
        setTimeout(() => aviso.remove(), 500);
    }, 3200);
}

function mostrarExito(mensaje) {
    const aviso = document.createElement("div");
    aviso.className = "success-toast";
    aviso.innerHTML = `
        <span class="success-check">
            <svg viewBox="0 0 52 52"><path d="M14 27l7 7 17-17" /></svg>
        </span>
        <span>${mensaje}</span>
    `;
    document.body.appendChild(aviso);

    setTimeout(() => aviso.classList.add("visible"), 10);
    setTimeout(() => {
        aviso.classList.remove("visible");
        setTimeout(() => aviso.remove(), 500);
    }, 3200);
}

// Función helper: separa los juegos para el hub y para el ranking.
//   • Hub: solo juegos de la comunidad (SIN oficiales, SIN programados futuros).
//   • Ranking: TODOS los juegos (oficiales + comunidad).
function separarJuegos(juegos) {
    const now = new Date();

    const hub = (juegos || []).filter(g => {
        if (g.es_proyecto_oficial) return false;
        if (!g.publish_at) return true;
        return new Date(g.publish_at) <= now;
    });

    const ranking = (juegos || []).filter(g => {
        if (!g.publish_at) return true;
        return new Date(g.publish_at) <= now;
    });

    return { hub, ranking };
}

// ============================================================
// INIT
// ============================================================

export async function initGames() {
    document.body.style.overflow = "auto";
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';

    // Mostrar "cargando" mientras llegan los datos
    const gridHub = document.getElementById("community-games");
    if (gridHub) gridHub.innerHTML = "<p style='color:#888; text-align:center; grid-column:1/-1; padding: 20px;'>Cargando juegos...</p>";
    const gridProy = document.getElementById("grid-proyectos");
    if (gridProy) gridProy.innerHTML = "<p style='color:#888; padding: 10px;'>Cargando proyectos...</p>";

    await cargarPalabrasProhibidas();

    try {
        await loadGamesData();
    } catch (err) {
        console.error("Error cargando los juegos:", err);
    }

    try {
        await cargarProyectosOficiales();
    } catch (err) {
        console.error("Error cargando proyectos oficiales:", err);
    }

    try {
        await loadRecentComments();
    } catch (err) {
        console.error("Error cargando comentarios recientes:", err);
    }

    startScheduledGamesWatcher();
}

// ============================================================
// MIS LIKES
// ============================================================

export async function cargarMisLikes(userId) {
    misLikes = new Set();
    if (!userId) return;

    const { data, error } = await supabase
        .from('likes_juegos')
        .select('juego_id')
        .eq('user_id', userId);

    if (error) {
        console.error("Error cargando mis likes:", error);
        return;
    }

    (data || []).forEach(row => misLikes.add(Number(row.juego_id)));
}

// ============================================================
// WATCHER DE JUEGOS PROGRAMADOS
// ============================================================

function startScheduledGamesWatcher() {
    knownGameIds = new Set(
        Array.from(document.querySelectorAll("[data-game-id]")).map(el => el.dataset.gameId)
    );

    setInterval(async () => {
        const { data: juegos, error } = await supabase
            .from('juegos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !juegos) return;

        const { hub, ranking } = separarJuegos(juegos);

        const idsVisiblesAhora = new Set(hub.map(g => String(g.id)));
        const nuevosIds = [...idsVisiblesAhora].filter(id => !knownGameIds.has(id));

        if (nuevosIds.length === 0) return;

        allGames = juegos;
        renderGamesGrid(hub);
        renderRankingTop(ranking);

        nuevosIds.forEach(id => {
            const juego = hub.find(g => String(g.id) === id);
            if (juego) mostrarAvisoNuevoJuego(juego.title);

            const card = document.querySelector(`[data-game-id="${id}"]`);
            if (card) {
                card.classList.add("just-published");
                setTimeout(() => card.classList.remove("just-published"), 4000);
            }
        });

        knownGameIds = idsVisiblesAhora;
    }, 30000);
}

// ============================================================
// CARGAR JUEGOS
// ============================================================

async function loadGamesData() {
    const { data: juegos, error } = await supabase
        .from('juegos')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error cargando juegos:", error);
        allGames = [];
    } else {
        allGames = juegos || [];
    }

    // Separar por vista (hub sin oficiales, ranking con todos)
    const { hub, ranking } = separarJuegos(allGames);

    renderGamesGrid(hub);
    renderRankingTop(ranking);
}

// ============================================================
// PROYECTOS OFICIALES
// ============================================================

export async function cargarProyectosOficiales() {
    const contenedor = document.getElementById("grid-proyectos");
    if (!contenedor) return;

    const { data: proyectos, error } = await supabase
        .from('juegos')
        .select('*')
        .eq('es_proyecto_oficial', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error cargando proyectos oficiales:", error);
        contenedor.innerHTML = "<p style='color:#ff4d6d; padding: 10px;'>Error al cargar los proyectos.</p>";
        return;
    }

    if (!proyectos || proyectos.length === 0) {
        contenedor.innerHTML = "<p style='color:#888; grid-column: 1/-1; padding: 10px;'>Todavía no hay proyectos oficiales.</p>";
        return;
    }

    contenedor.innerHTML = "";

    proyectos.forEach(proyecto => {
        const card = document.createElement("article");
        card.className = "project-card reveal visible";
        card.innerHTML = `
            <div class="card-media">
                <img src="${escapeHTML(proyecto.image_url) || 'assets/images/Meteor Fighters.png'}"
                     alt="${escapeHTML(proyecto.title)}"
                     class="project-cover-img">
            </div>
            <div class="card-body">
                <h3>${escapeHTML(proyecto.title)}${proyecto.verificado ? ' <span class="verified-badge">✅</span>' : ''}</h3>
                <p>${escapeHTML(proyecto.description) || 'Sin descripción'}</p>
                <a href="#" class="link-arrow" data-proyecto-id="${proyecto.id}">VER DETALLES →</a>
            </div>
        `;

        card.querySelector(".link-arrow").addEventListener("click", (e) => {
            e.preventDefault();
            window.openGameDetails(proyecto.id);
        });

        card.querySelector(".card-media").addEventListener("click", () => {
            window.openGameDetails(proyecto.id);
        });

        contenedor.appendChild(card);
    });
}

// ============================================================
// RENDER DE TARJETAS Y RANKING
// ============================================================

function renderGamesGrid(gamesList) {
    const container = document.getElementById("community-games");
    if (!container) return;

    container.innerHTML = "";

    if (!gamesList.length) {
        container.innerHTML = `<p style="color:#888; text-align: center; grid-column: 1/-1; padding: 20px;">No hay juegos disponibles todavía.</p>`;
        return;
    }

    gamesList.forEach((game, index) => {
        const card = document.createElement("div");
        card.className = "game-card-hub card-stagger";
        card.dataset.gameId = game.id;

        card.innerHTML = `
            <img src="${escapeHTML(game.image_url) || 'assets/images/Meteor Fighters.png'}" class="game-card-thumb" data-game-id="${game.id}">
            <div class="game-card-info">
                <h4 class="game-title-click" data-game-id="${game.id}" style="cursor:pointer">
                    ${escapeHTML(game.title)}${game.verificado ? '<span class="verified-badge" title="Verificado por Google Safe Browsing">✅</span>' : ''}
                </h4>
                <div class="game-card-author">☑ ${escapeHTML(game.author) || 'Anónimo'}</div>
                <div class="game-card-footer">
                    <button class="like-btn-direct ${misLikes.has(Number(game.id)) ? 'liked' : ''}" data-like-id="${game.id}">
                        ❤️ <span id="like-count-${game.id}">${game.likes_count || 0}</span>
                    </button>
                    <div class="star-rating">★★★★☆</div>
                </div>
            </div>
        `;

        card.querySelector('.game-card-thumb').addEventListener('click', () => window.openGameDetails(game.id));
        card.querySelector('.game-title-click').addEventListener('click', () => window.openGameDetails(game.id));
        card.querySelector('.like-btn-direct').addEventListener('click', (e) => window.handleDirectLike(e, game.id));
        addTiltEffect(card);

        container.appendChild(card);
        setTimeout(() => card.classList.add("card-visible"), 40 * Math.min(index, 12));
    });
}

function addTiltEffect(card) {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-4px)`;
    });

    card.addEventListener("mouseleave", () => {
        card.style.transform = "";
    });
}

function renderRankingTop(gamesList) {
    const rankingContainer = document.getElementById("ranking-list");
    if (!rankingContainer) return;

    const sorted = [...gamesList].sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0)).slice(0, 5);
    rankingContainer.innerHTML = "";

    if (sorted.length === 0) {
        rankingContainer.innerHTML = "<p style='color:#888; font-size: 0.85rem; padding: 10px;'>Todavía no hay juegos para el ranking.</p>";
        return;
    }

    sorted.forEach((game, index) => {
        const rankPos = index + 1;
        const item = document.createElement("div");
        item.className = "ranking-item-card";

        item.innerHTML = `
            <div class="ranking-item-left">
                <div class="rank-number rank-${rankPos}">${rankPos}</div>
                <img src="${escapeHTML(game.image_url) || 'assets/images/Meteor Fighters.png'}" class="rank-thumb">
                <div>
                    <strong style="color: #fff; font-size: 0.95rem;">
                        ${escapeHTML(game.title)}${game.verificado ? '<span class="verified-badge" title="Verificado">✅</span>' : ''}
                    </strong>
                    <div style="font-size: 0.75rem; color: #8a8b9e;">☑ ${escapeHTML(game.author) || 'Creador'}</div>
                </div>
            </div>
            <div class="rank-pts">${(game.likes_count || 0) * 10} pts</div>
        `;
        rankingContainer.appendChild(item);
    });
}

// ============================================================
// COMENTARIOS
// ============================================================

async function loadRecentComments() {
    const container = document.getElementById("recent-comments-list");
    if (!container) return;

    const { data: comentarios } = await supabase
        .from('comentarios_juegos')
        .select('*, usuarios(username)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (!comentarios || comentarios.length === 0) {
        container.innerHTML = "<p style='font-size: 0.8rem; color: #666;'>Sin comentarios aún.</p>";
        return;
    }

    container.innerHTML = "";
    comentarios.forEach(c => {
        const nombreMostrar = c.usuarios?.username || c.username || "Usuario eliminado";

        const div = document.createElement("div");
        div.className = "recent-comment-card";
        div.innerHTML = `
            <div class="comment-user-header">
                <strong style="font-size: 0.85rem; color: var(--neon);">${escapeHTML(nombreMostrar)}:</strong>
            </div>
            <div class="comment-text">${escapeHTML(c.comentario)}</div>
        `;
        container.appendChild(div);
    });
}

async function loadGameComments(juegoId) {
    const container = document.getElementById("commentsContainer");
    if (!container) return;

    const { data: comentarios } = await supabase
        .from('comentarios_juegos')
        .select('*, usuarios(username)')
        .eq('juego_id', juegoId)
        .order('created_at', { ascending: true });

    if (!comentarios || comentarios.length === 0) {
        container.innerHTML = "<p style='font-size: 0.8rem; color: #888;'>Sé el primero en comentar.</p>";
        knownCommentIds = new Set();
        return;
    }

    container.innerHTML = comentarios.map(c => {
        const esNuevo = !knownCommentIds.has(c.id);
        const nombreMostrar = c.usuarios?.username || c.username || "Usuario eliminado";
        return `
        <div class="comment-card ${esNuevo ? 'comment-enter' : ''}" style="margin-bottom: 8px;">
            <strong style="color: var(--neon);">${escapeHTML(nombreMostrar)}:</strong>
            <span style="color: #ccc;">${escapeHTML(c.comentario)}</span>
        </div>
    `;
    }).join("");

    knownCommentIds = new Set(comentarios.map(c => c.id));
}

window.submitComment = async function(event) {
    if (event) event.preventDefault();
    const input = document.getElementById("commentInput");
    const texto = input ? input.value.trim() : "";

    if (!texto || !currentGameId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        mostrarError("Tenés que iniciar sesión para comentar.");
        if (typeof window.openAuthModal === "function") window.openAuthModal();
        return;
    }

    const { data: perfil } = await supabase
        .from('usuarios')
        .select('username')
        .eq('id', user.id)
        .single();

    const username = perfil?.username || user.email?.split("@")[0] || "Jugador";

    const containsBadWord = BAD_WORDS.some(word => texto.toLowerCase().includes(word));
    if (containsBadWord) {
        mostrarError("Por favor mantené un lenguaje respetuoso. Este tipo de mensajes generan una advertencia en tu cuenta.");
        return;
    }

    const { error } = await supabase.from('comentarios_juegos').insert([{
        juego_id: currentGameId,
        user_id: user.id,
        username: username,
        comentario: texto
    }]);

    if (error) {
        const msg = error.message || "";

        if (msg.includes("ADVERTENCIA")) {
            mostrarError("Tu comentario fue bloqueado por lenguaje inapropiado. Esta es tu primera advertencia.");
            if (input) input.value = "";
            return;
        }

        if (msg.includes("CUENTA_BANEADA")) {
            mostrarError("Tu cuenta fue suspendida por reincidir con lenguaje inapropiado.");
            await supabase.auth.signOut();
            location.reload();
            return;
        }

        if (msg.includes("COMENTARIO_BLOQUEADO")) {
            mostrarError("Tu comentario fue bloqueado por lenguaje inapropiado.");
            return;
        }

        console.error("Error al comentar:", error);
        mostrarError("Ocurrió un error al enviar el comentario.");
        return;
    }

    if (input) input.value = "";
    await loadGameComments(currentGameId);
    await loadRecentComments();
};

// ============================================================
// LIKES
// ============================================================

window.handleDirectLike = async function(event, juegoId) {
    if (event) event.stopPropagation();

    const targetId = Number(juegoId || currentGameId);
    if (!targetId) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("⚠️ Tenés que iniciar sesión para dar like.");
        if (typeof window.openAuthModal === "function") window.openAuthModal();
        return;
    }

    const yaLiked = misLikes.has(targetId);

    if (yaLiked) {
        const { error } = await supabase
            .from('likes_juegos')
            .delete()
            .eq('user_id', user.id)
            .eq('juego_id', targetId);

        if (error) {
            console.error("Error al quitar like:", error);
            alert("Ocurrió un error al quitar tu like.");
            return;
        }

        misLikes.delete(targetId);

        const game = allGames.find(g => Number(g.id) === targetId);
        if (game) {
            game.likes_count = Math.max((game.likes_count || 0) - 1, 0);
            actualizarUIContadorLike(targetId, game.likes_count, false);
            const { ranking } = separarJuegos(allGames);
            renderRankingTop(ranking);
        }

        return;
    }

    const { error } = await supabase
        .from('likes_juegos')
        .insert([{ user_id: user.id, juego_id: targetId }]);

    if (error) {
        if (error.code === '23505') {
            misLikes.add(targetId);
            alert("⚠️ Ya le habías dado like a este juego.");
            return;
        }
        console.error("Error al dar like:", error);
        alert("Ocurrió un error al registrar tu like.");
        return;
    }

    misLikes.add(targetId);

    const game = allGames.find(g => Number(g.id) === targetId);
    if (game) {
        game.likes_count = (game.likes_count || 0) + 1;
        actualizarUIContadorLike(targetId, game.likes_count, true);
        const { ranking } = separarJuegos(allGames);
        renderRankingTop(ranking);
    }

    const likeBtn = event?.currentTarget || document.querySelector(`[data-like-id="${targetId}"]`);
    if (likeBtn) {
        likeBtn.classList.add("like-pop");
        setTimeout(() => likeBtn.classList.remove("like-pop"), 420);

        const plusOne = document.createElement("span");
        plusOne.className = "like-float";
        plusOne.textContent = "+1";
        likeBtn.appendChild(plusOne);
        setTimeout(() => plusOne.remove(), 800);
    }
};

function actualizarUIContadorLike(targetId, nuevoValor, likeado) {
    const cardCount = document.getElementById(`like-count-${targetId}`);
    if (cardCount) cardCount.textContent = nuevoValor;

    const modalLikes = document.getElementById("statLikes");
    if (modalLikes && Number(currentGameId) === Number(targetId)) {
        modalLikes.textContent = nuevoValor;
    }

    const btn = document.querySelector(`[data-like-id="${targetId}"]`);
    if (btn) {
        btn.classList.toggle("liked", likeado);
    }
}

// ============================================================
// FILTROS Y ORDENAMIENTO
// ============================================================

window.filterGames = function(type, element) {
    if (element) {
        const container = element.closest('.filter-tabs-primary');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
        moveTabSlider(container, element);
    }

    const { hub } = separarJuegos(allGames);
    let filtered = [...hub];
    if (type === 'top') {
        filtered.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    }
    renderGamesGrid(filtered);
};

window.sortGames = function(order, element) {
    if (element) {
        const container = element.closest('.filter-tabs-secondary');
        document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
        moveTabSlider(container, element);
    }

    const { hub } = separarJuegos(allGames);
    let sorted = [...hub];
    if (order === 'recientes') {
        sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } else if (order === 'valorados') {
        sorted.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
    }
    renderGamesGrid(sorted);
};

function moveTabSlider(container, activeBtn) {
    const slider = container?.querySelector('.tab-slider');
    if (!slider || !activeBtn) return;
    slider.style.width = `${activeBtn.offsetWidth}px`;
    slider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.filter-tabs-primary, .filter-tabs-secondary').forEach(container => {
        const active = container.querySelector('.active');
        if (active) moveTabSlider(container, active);
    });
});

// ============================================================
// PUBLICAR JUEGO
// ============================================================

window.handlePublishGame = async function(event) {
    event.preventDefault();

    const { data: { user } } = await supabase.auth.getUser();
    const title = document.getElementById("pubTitle")?.value.trim();
    const description = document.getElementById("pubDescription")?.value.trim();
    const author = document.getElementById("pubAuthor")?.value.trim() || "Creador Anónimo";
    const imageFileInput = document.getElementById("pubImageFile");
    const downloadUrl = document.getElementById("pubDownloadUrl")?.value.trim();
    const scheduleInput = document.getElementById("pubScheduleDate")?.value;
    const acceptedTerms = document.getElementById("pubAcceptTerms")?.checked;
    const errorMsg = document.getElementById("publishError");

    if (errorMsg) errorMsg.style.display = "none";

    if (scheduleInput) {
        const fechaElegida = new Date(scheduleInput);
        const ahora = new Date();
        if (fechaElegida <= ahora) {
            if (errorMsg) {
                errorMsg.textContent = "⚠️ La fecha programada tiene que ser futura.";
                errorMsg.style.display = "block";
            }
            return;
        }
    }

    if (!acceptedTerms) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Tenés que aceptar las reglas y los términos y condiciones para publicar.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const captchaToken = (window.turnstile && publishWidgetId !== null)
        ? window.turnstile.getResponse(publishWidgetId)
        : null;

    if (!captchaToken) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Completá la verificación \"No soy un robot\" antes de publicar.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { data: captchaCheck, error: captchaError } = await supabase.functions.invoke(
        'verificar-captcha',
        { body: { token: captchaToken } }
    );

    if (captchaError || !captchaCheck?.success) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ No pudimos verificar que no sos un robot. Probá de nuevo.";
            errorMsg.style.display = "block";
        }
        if (window.turnstile && publishWidgetId !== null) window.turnstile.reset(publishWidgetId);
        return;
    }

    if (!downloadUrl || !downloadUrl.toLowerCase().includes("drive.google.com")) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ El enlace debe ser obligatoriamente de Google Drive (https://drive.google.com/...)";
            errorMsg.style.display = "block";
        }
        return;
    }

    const duplicate = allGames.find(g => g.title?.toLowerCase() === title.toLowerCase());
    if (duplicate) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Ya existe un juego publicado con este título exacto.";
            errorMsg.style.display = "block";
        }
        return;
    }

    let finalImageUrl = "assets/images/Meteor Fighters.png";

    if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
        let file = imageFileInput.files[0];

        try {
            if (typeof window.imageCompression === "function") {
                const opciones = {
                    maxSizeMB: 0.3,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                    fileType: 'image/webp',
                    initialQuality: 0.82,
                };

                const comprimida = await window.imageCompression(file, opciones);
                const tamañoAntes = (file.size / 1024).toFixed(0);
                const tamañoDespues = (comprimida.size / 1024).toFixed(0);
                console.log(`🖼️ Imagen comprimida: ${tamañoAntes}KB → ${tamañoDespues}KB`);

                file = new File([comprimida], file.name.replace(/\.[^.]+$/, '.webp'), {
                    type: 'image/webp'
                });
            } else {
                console.warn("Librería de compresión no disponible, subiendo original");
            }
        } catch (err) {
            console.error("Error comprimiendo imagen:", err);
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('portadas')
            .upload(fileName, file, {
                contentType: file.type,
                cacheControl: '31536000'
            });

        if (uploadError) {
            console.error("Error al subir la imagen:", uploadError);
            if (errorMsg) {
                errorMsg.textContent = "Error al subir la portada: " + uploadError.message;
                errorMsg.style.display = "block";
            }
            return;
        }

        const { data: publicURLData } = supabase.storage
            .from('portadas')
            .getPublicUrl(fileName);

        finalImageUrl = publicURLData.publicUrl;
    }

    const newGame = {
        title: title,
        description: description,
        author: author,
        image_url: finalImageUrl,
        download_url: downloadUrl,
        likes_count: 0,
        views_count: 0,
        playing_count: 0,
        user_id: user ? user.id : null,
        publish_at: scheduleInput ? new Date(scheduleInput).toISOString() : null
    };

    const { error } = await supabase.from('juegos').insert([newGame]);

    if (error) {
        console.error("Error publicando juego:", error);
        if (errorMsg) {
            errorMsg.textContent = "Error al publicar: " + error.message;
            errorMsg.style.display = "block";
        }
        return;
    }

    mostrarExito("¡Tu juego se publicó con éxito! 🎉");
    document.getElementById("publishForm")?.reset();
    closePublishModal();

    await loadGamesData();
};

// ============================================================
// MODAL DE DETALLES DEL JUEGO
// ============================================================

window.openGameDetails = async function(gameInput) {
    let game = null;

    if (typeof gameInput === 'number' || !isNaN(Number(gameInput))) {
        const targetId = Number(gameInput);
        game = allGames.find(g => Number(g.id) === targetId);
    } else if (typeof gameInput === 'string') {
        game = allGames.find(g => g.title?.trim().toLowerCase() === gameInput.trim().toLowerCase());
    } else if (typeof gameInput === 'object') {
        game = gameInput;
    }

    if (!game && (typeof gameInput === 'number' || !isNaN(Number(gameInput)))) {
        const { data: singleGame } = await supabase
            .from('juegos')
            .select('*')
            .eq('id', Number(gameInput))
            .single();
        if (singleGame) game = singleGame;
    }

    if (!game && allGames.length > 0) game = allGames[0];
    if (!game) {
        alert("⚠️ No se pudo cargar la información de este juego.");
        return;
    }

    currentGameId = game.id;

    if (typeof game.id === 'number') {
        const { data: { user } } = await supabase.auth.getUser();
        const soyElCreador = user && game.user_id && user.id === game.user_id;

        if (!soyElCreador) {
            game.views_count = (game.views_count || 0) + 1;

            const { error: errorVisita } = await supabase
                .from('visitas_juegos')
                .insert([{
                    juego_id: game.id,
                    user_id: user ? user.id : null
                }]);

            if (errorVisita) {
                console.error("Error registrando visita:", errorVisita);
            }
        }
    }

    if (document.getElementById("gameModalTitle")) document.getElementById("gameModalTitle").textContent = game.title || "Juego sin título";
    if (document.getElementById("gameModalAuthor")) document.getElementById("gameModalAuthor").textContent = `Creador: ${game.author || 'Dreaming Rose'}`;
    if (document.getElementById("gameModalImg")) document.getElementById("gameModalImg").src = game.image_url || 'assets/images/Meteor Fighters.png';
    if (document.getElementById("gameModalDescription")) document.getElementById("gameModalDescription").textContent = game.description || "Sin descripción disponible.";

    const verificacionBadge = document.getElementById("gameVerificationBadge");
    if (verificacionBadge) {
        if (game.verificado) {
            verificacionBadge.innerHTML = `
                <div class="verificacion-ok">
                    ✅ Verificado por Google Safe Browsing
                </div>
            `;
        } else if (game.verificado_at) {
            verificacionBadge.innerHTML = `
                <div class="verificacion-peligro">
                    ⚠️ Este juego fue marcado como sospechoso. Descarágalo bajo tu propio riesgo.
                </div>
            `;
        } else {
            verificacionBadge.innerHTML = `
                <div class="verificacion-pendiente">
                    ⏳ Este juego aún no fue verificado. Descargalo bajo tu propio riesgo.
                </div>
            `;
        }
    }

    animateCount(document.getElementById("statLikes"), game.likes_count || 0);
    animateCount(document.getElementById("statVisits"), game.views_count || 1);
    animateCount(document.getElementById("statPlaying"), game.playing_count || 1);

    if (document.getElementById("statCreated")) {
        const fecha = game.created_at ? new Date(game.created_at) : null;
        document.getElementById("statCreated").textContent = fecha && !isNaN(fecha)
            ? fecha.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : "Sin fecha";
    }

    const playBtn = document.getElementById("gameDownloadBtn");
    if (playBtn) {
        const urlFinal = game.download_url || "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing";

        playBtn.style.display = "inline-flex";

        playBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            window.open(urlFinal, "_blank");
            return false;
        };
    }

    await loadGameComments(game.id);
    await actualizarFormularioComentario();

    const modal = document.getElementById("gameModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
};

async function actualizarFormularioComentario() {
    const form = document.getElementById("commentForm");
    const prompt = document.getElementById("commentLoginPrompt");
    if (!form || !prompt) return;

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
        form.style.display = "flex";
        prompt.style.display = "none";
    } else {
        form.style.display = "none";
        prompt.style.display = "flex";
    }
}

// ============================================================
// ABRIR / CERRAR MODALES
// ============================================================

window.openUpload = function() {
    const modal = document.getElementById("publishModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
    initPublishCaptcha();
};

window.closeGameModal = function() {
    const modal = document.getElementById("gameModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
};

window.closePublishModal = function() {
    const modal = document.getElementById("publishModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
    if (window.turnstile && publishWidgetId !== null) window.turnstile.reset(publishWidgetId);
};

// ============================================================
// LISTENERS GLOBALES
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    const termsCheckbox = document.getElementById("pubAcceptTerms");
    const submitBtn = document.getElementById("btnPublishSubmit");

    if (termsCheckbox && submitBtn) {
        termsCheckbox.addEventListener("change", () => {
            submitBtn.disabled = !termsCheckbox.checked;
        });
    }
});

window.addEventListener("click", function(event) {
    const gameModal = document.getElementById("gameModal");
    const publishModal = document.getElementById("publishModal");
    const authModal = document.getElementById("authModal");
    const adminModal = document.getElementById("adminModal");
    const proyectoModal = document.getElementById("proyectoOficialModal");

    if (event.target === gameModal) window.closeGameModal();
    if (event.target === publishModal) window.closePublishModal();
    if (event.target === authModal) { authModal.classList.remove("active"); document.body.style.overflow = "auto"; }
    if (event.target === adminModal) { adminModal.classList.remove("active"); document.body.style.overflow = "auto"; }
    if (event.target === proyectoModal) { proyectoModal.classList.remove("active"); document.body.style.overflow = "auto"; }
});

window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        window.closeGameModal();
        window.closePublishModal();
        const authModal = document.getElementById("authModal");
        if (authModal) authModal.classList.remove("active");
        const adminModal = document.getElementById("adminModal");
        if (adminModal) adminModal.classList.remove("active");
        const proyectoModal = document.getElementById("proyectoOficialModal");
        if (proyectoModal) proyectoModal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
});

// ============================================================
// EXPOSICIÓN AL WINDOW
// ============================================================

window.cargarProyectosOficiales = cargarProyectosOficiales;
window.cargarMisLikes = cargarMisLikes;
window.initGames = initGames;
window.actualizarFormularioComentario = actualizarFormularioComentario;