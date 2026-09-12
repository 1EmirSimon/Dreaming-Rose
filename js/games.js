// js/games.js
import { supabase } from "./supabase.js";

let allGames = [];
let currentGameId = null;
let publishWidgetId = null;

// Renderizamos el captcha de publicar "a mano" (explícito), porque hay otro
// widget más en la página (el del login) y no queremos que se mezclen.
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

const BAD_WORDS = ["pelotudo", "boludo", "puto", "maricon", "hijo de puta", "imbecil", "estupido", "basura"];

// Anima un número subiendo desde 0 hasta su valor real (usado en las
// estadísticas del modal de detalles: likes, visitas, jugando ahora).
function animateCount(el, target) {
    if (!el) return;
    const finalValue = Number(target) || 0;
    const duration = 600;
    const start = performance.now();

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
        el.textContent = Math.round(finalValue * eased);
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = finalValue;
    }

    requestAnimationFrame(tick);
}

export async function initGames() {
    // Limpieza preventiva inicial de estilos bloqueados en el body
    document.body.style.overflow = "auto";
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';

    initPublishCaptcha();

    try {
        await loadGamesData();
    } catch (err) {
        console.error("Error cargando los juegos:", err);
    }

    try {
        await loadRecentComments();
    } catch (err) {
        console.error("Error cargando comentarios recientes:", err);
    }

    startScheduledGamesWatcher();
}

// Revisa cada 30 segundos si algún juego programado ya llegó a su hora,
// y si es así, lo mete en la grilla sin que nadie tenga que recargar.
let knownGameIds = new Set();

function startScheduledGamesWatcher() {
    knownGameIds = new Set(
        document.querySelectorAll("[data-game-id]")
            ? Array.from(document.querySelectorAll("[data-game-id]")).map(el => el.dataset.gameId)
            : []
    );

    setInterval(async () => {
        const { data: juegos, error } = await supabase
            .from('juegos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !juegos) return;

        const now = new Date();
        const visiblesAhora = juegos.filter(g => !g.publish_at || new Date(g.publish_at) <= now);
        const idsVisiblesAhora = new Set(visiblesAhora.map(g => String(g.id)));

        const nuevosIds = [...idsVisiblesAhora].filter(id => !knownGameIds.has(id));

        if (nuevosIds.length === 0) return;

        allGames = juegos;
        renderGamesGrid(visiblesAhora);
        renderRankingTop(visiblesAhora);

        nuevosIds.forEach(id => {
            const juego = visiblesAhora.find(g => String(g.id) === id);
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

// Cartel de éxito con tilde animado, para reemplazar los alert() feos
// del navegador en acciones importantes (como publicar un juego).
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

async function loadGamesData() {
    const { data: juegos, error } = await supabase
        .from('juegos')
        .select('*')
        .order('created_at', { ascending: false });

    const fallbackGame = {
        id: 1,
        title: "Meteor Fighters",
        author: "Dreaming Rose",
        description: "Enfréntate a criaturas prehistóricas en intensas batallas 2D. ¡Desata combos devastadores y domina el campo de batalla!",
        image_url: "assets/images/Meteor Fighters.png",
        download_url: "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing",
        file_url: "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing",
        likes_count: 0,
        views_count: 1,
        playing_count: 1
    };

    if (error || !juegos || juegos.length === 0) {
        allGames = [fallbackGame];
    } else {
        allGames = juegos;
    }

    // Un juego programado para el futuro puede seguir siendo visible para
    // su propio creador (por la política de RLS), pero no debe mezclarse
    // con la grilla pública hasta que llegue su hora.
    const now = new Date();
    const gamesVisiblesAhora = allGames.filter(g => {
        if (!g.publish_at) return true;
        return new Date(g.publish_at) <= now;
    });

    renderGamesGrid(gamesVisiblesAhora);
    renderRankingTop(gamesVisiblesAhora);
}

function renderGamesGrid(gamesList) {
    const container = document.getElementById("community-games");
    if (!container) return;

    container.innerHTML = "";

    if (!gamesList.length) {
        container.innerHTML = `<p style="color:#888; text-align: center; grid-column: 1/-1;">No hay juegos disponibles.</p>`;
        return;
    }

    gamesList.forEach((game, index) => {
        const card = document.createElement("div");
        card.className = "game-card-hub card-stagger";
        card.dataset.gameId = game.id;
        
        card.innerHTML = `
            <img src="${game.image_url || 'assets/images/Meteor Fighters.png'}" class="game-card-thumb" data-game-id="${game.id}">
            <div class="game-card-info">
                <h4 class="game-title-click" data-game-id="${game.id}" style="cursor:pointer">${game.title}</h4>
                <div class="game-card-author">☑ ${game.author || 'Anónimo'}</div>
                <div class="game-card-footer">
                    <button class="like-btn-direct" data-like-id="${game.id}">
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

// Inclinación 3D sutil siguiendo el mouse, se desactiva sola en celulares
function addTiltEffect(card) {
    if (window.matchMedia("(pointer: coarse)").matches) return; // sin tilt en touch

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

    sorted.forEach((game, index) => {
        const rankPos = index + 1;
        const item = document.createElement("div");
        item.className = "ranking-item-card";
        
        item.innerHTML = `
            <div class="ranking-item-left">
                <div class="rank-number rank-${rankPos}">${rankPos}</div>
                <img src="${game.image_url || 'assets/images/Meteor Fighters.png'}" class="rank-thumb">
                <div>
                    <strong style="color: #fff; font-size: 0.95rem;">${game.title}</strong>
                    <div style="font-size: 0.75rem; color: #8a8b9e;">☑ ${game.author || 'Creador'}</div>
                </div>
            </div>
            <div class="rank-pts">${(game.likes_count || 0) * 10} pts</div>
        `;
        rankingContainer.appendChild(item);
    });
}

async function loadRecentComments() {
    const container = document.getElementById("recent-comments-list");
    if (!container) return;

    const { data: comentarios } = await supabase
        .from('comentarios_juegos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (!comentarios || comentarios.length === 0) {
        container.innerHTML = "<p style='font-size: 0.8rem; color: #666;'>Sin comentarios aún.</p>";
        return;
    }

    container.innerHTML = "";
    comentarios.forEach(c => {
        const div = document.createElement("div");
        div.className = "recent-comment-card";
        div.innerHTML = `
            <div class="comment-user-header">
                <strong style="font-size: 0.85rem; color: var(--neon);">${c.username}:</strong>
            </div>
            <div class="comment-text">${c.comentario}</div>
        `;
        container.appendChild(div);
    });
}

let knownCommentIds = new Set();

async function loadGameComments(juegoId) {
    const container = document.getElementById("commentsContainer");
    if (!container) return;

    const { data: comentarios } = await supabase
        .from('comentarios_juegos')
        .select('*')
        .eq('juego_id', juegoId)
        .order('created_at', { ascending: true });

    if (!comentarios || comentarios.length === 0) {
        container.innerHTML = "<p style='font-size: 0.8rem; color: #888;'>Sé el primero en comentar.</p>";
        knownCommentIds = new Set();
        return;
    }

    container.innerHTML = comentarios.map(c => {
        const esNuevo = !knownCommentIds.has(c.id);
        return `
        <div class="comment-card ${esNuevo ? 'comment-enter' : ''}" style="margin-bottom: 8px;">
            <strong style="color: var(--neon);">${c.username}:</strong> 
            <span style="color: #ccc;">${c.comentario}</span>
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
    const username = user ? (user.user_metadata?.username || user.email.split("@")[0]) : "Jugador_Anónimo";

    const containsBadWord = BAD_WORDS.some(word => texto.toLowerCase().includes(word));
    if (containsBadWord) {
        alert("⚠️ Por favor mantén un lenguaje respetuoso. Este tipo de mensajes generan una advertencia en tu cuenta.");
        return;
    }

    const { error } = await supabase.from('comentarios_juegos').insert([{
        juego_id: currentGameId,
        user_id: user ? user.id : null,
        username: username,
        comentario: texto
    }]);

    if (error) {
        const msg = error.message || "";

        if (msg.includes("ADVERTENCIA")) {
            alert("⚠️ Tu comentario fue bloqueado por lenguaje inapropiado.\nEsta es tu primera advertencia: la próxima vez tu cuenta va a ser suspendida.");
            if (input) input.value = "";
            return;
        }

        if (msg.includes("CUENTA_BANEADA")) {
            alert("⛔ Tu cuenta fue suspendida por reincidir con lenguaje inapropiado.");
            await supabase.auth.signOut();
            location.reload();
            return;
        }

        if (msg.includes("COMENTARIO_BLOQUEADO")) {
            alert("⚠️ Tu comentario fue bloqueado por lenguaje inapropiado.");
            return;
        }

        console.error("Error al comentar:", error);
        alert("Ocurrió un error al enviar el comentario.");
        return;
    }

    if (input) input.value = "";
    await loadGameComments(currentGameId);
    await loadRecentComments();
};

window.handleDirectLike = async function(event, juegoId) {
    if (event) event.stopPropagation();

    const targetId = juegoId || currentGameId;
    if (!targetId) return;

    const likeStorageKey = `liked_game_${targetId}`;
    if (localStorage.getItem(likeStorageKey)) {
        alert("⚠️ Ya le has dado like a este juego anteriormente.");
        return;
    }

    const game = allGames.find(g => Number(g.id) === Number(targetId));
    if (!game) return;

    const newLikes = (game.likes_count || 0) + 1;
    game.likes_count = newLikes;

    localStorage.setItem(likeStorageKey, "true");

    const cardCount = document.getElementById(`like-count-${targetId}`);
    if (cardCount) cardCount.textContent = newLikes;

    // Micro-animación: el botón "salta" y aparece un +1 flotante
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

    const modalLikes = document.getElementById("statLikes");
    if (modalLikes && Number(currentGameId) === Number(targetId)) modalLikes.textContent = newLikes;

    await supabase.rpc('increment_juego_likes', { juego_id: targetId });
    renderRankingTop(allGames);
};

window.filterGames = function(type, element) {
    if (element) {
        const container = element.closest('.filter-tabs-primary');
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        element.classList.add('active');
        moveTabSlider(container, element);
    }

    let filtered = [...allGames];
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

    let sorted = [...allGames];
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

// Posiciona los subrayados en su lugar inicial apenas carga la página
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.filter-tabs-primary, .filter-tabs-secondary').forEach(container => {
        const active = container.querySelector('.active');
        if (active) moveTabSlider(container, active);
    });
});

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
        const file = imageFileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('portadas')
            .upload(fileName, file);

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
        file_url: downloadUrl,
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
        const newViews = (game.views_count || 0) + 1;
        game.views_count = newViews;
        await supabase.rpc('increment_juego_views', { juego_id: game.id });
    }

    if (document.getElementById("gameModalTitle")) document.getElementById("gameModalTitle").textContent = game.title || "Juego sin título";
    if (document.getElementById("gameModalAuthor")) document.getElementById("gameModalAuthor").textContent = `Creador: ${game.author || 'Dreaming Rose'}`;
    if (document.getElementById("gameModalImg")) document.getElementById("gameModalImg").src = game.image_url || 'assets/images/Meteor Fighters.png';
    if (document.getElementById("gameModalDescription")) document.getElementById("gameModalDescription").textContent = game.description || "Sin descripción disponible.";
    
    animateCount(document.getElementById("statLikes"), game.likes_count || 0);
    animateCount(document.getElementById("statVisits"), game.views_count || 1);
    animateCount(document.getElementById("statPlaying"), game.playing_count || 1);

    if (document.getElementById("statCreated")) {
        const fecha = game.created_at ? new Date(game.created_at) : null;
        document.getElementById("statCreated").textContent = fecha && !isNaN(fecha)
            ? fecha.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' })
            : "Sin fecha";
    }

    // --- MANEJO DE DESCARGA BLINDADO (SIN CONGELAR) ---
    const playBtn = document.getElementById("gameDownloadBtn");
    if (playBtn) {
        const urlFinal = game.download_url || game.file_url || "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing";
        
        playBtn.style.display = "inline-flex"; 
        
        // Reemplazamos la función onclick directamente para aislar el evento y evitar recargas o bloqueos
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

    const modal = document.getElementById("gameModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
};

window.openUpload = function() {
    const modal = document.getElementById("publishModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
};

window.closeGameModal = function() {
    const modal = document.getElementById("gameModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto"; // Restaura siempre el scroll
    }
};

window.closePublishModal = function() {
    const modal = document.getElementById("publishModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto"; // Restaura siempre el scroll
    }
    if (window.turnstile && publishWidgetId !== null) window.turnstile.reset(publishWidgetId);
};

// El botón de publicar arranca deshabilitado y solo se habilita
// cuando se tilda la casilla de términos y condiciones.
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

    if (event.target === gameModal) window.closeGameModal();
    if (event.target === publishModal) window.closePublishModal();
    if (event.target === authModal) { authModal.classList.remove("active"); document.body.style.overflow = "auto"; }
    if (event.target === adminModal) { adminModal.classList.remove("active"); document.body.style.overflow = "auto"; }
});

window.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        window.closeGameModal();
        window.closePublishModal();
        const authModal = document.getElementById("authModal");
        if (authModal) authModal.classList.remove("active");
        const adminModal = document.getElementById("adminModal");
        if (adminModal) adminModal.classList.remove("active");
        document.body.style.overflow = "auto"; // Restaura siempre el scroll con ESC
    }
});

window.initGames = initGames;