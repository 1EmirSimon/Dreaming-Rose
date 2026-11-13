// Carrusel automático del hero: incluye proyectos oficiales y juegos de la comunidad.
import { supabase } from "./supabase.js";

let heroGames = [];
let currentIndex = 0;
let autoplayTimer = null;
let touchStartX = 0;
let touchEndX = 0;
let activeImageLayer = 0;
let slideDirection = 1;

const AUTOPLAY_DELAY = 5000;
const FALLBACK_IMAGE = "assets/images/Meteor Fighters.png";

function isPublished(game) {
    if (!game?.publish_at) return true;
    const date = new Date(game.publish_at);
    return !Number.isNaN(date.getTime()) && date <= new Date();
}

function getGameImage(game) {
    return game?.image_url || FALLBACK_IMAGE;
}

function renderIndicators() {
    const container = document.getElementById("heroIndicators");
    if (!container) return;
    container.replaceChildren();

    heroGames.forEach((game, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = `hero-carousel-dot${index === currentIndex ? " active" : ""}`;
        dot.setAttribute("aria-label", `Mostrar ${game.title || "juego"} (${index + 1})`);
        dot.setAttribute("aria-current", index === currentIndex ? "true" : "false");
        dot.addEventListener("click", () => showGame(index, true, index > currentIndex ? 1 : -1));
        container.appendChild(dot);
    });
}

function showGame(index, resetTimer = false, direction = 1) {
    if (!heroGames.length) return;

    const nextIndex = (index + heroGames.length) % heroGames.length;
    if (nextIndex === currentIndex && heroGames.length > 1) return;
    currentIndex = nextIndex;
    const game = heroGames[currentIndex];

    const hero = document.getElementById("heroCarousel");
    const images = [
        document.getElementById("heroGameImage"),
        document.getElementById("heroGameImageNext")
    ];
    const tagline = document.getElementById("heroGameTagline");
    const title = document.getElementById("heroGameTitle");
    const description = document.getElementById("heroGameDescription");
    const action = document.getElementById("heroGameAction");
    if (!hero || !images[0] || !images[1] || !tagline || !title || !description || !action) return;

    const incomingLayer = 1 - activeImageLayer;
    const outgoing = images[activeImageLayer];
    const incoming = images[incomingLayer];
    const directionSign = direction >= 0 ? 1 : -1;
    const incomingClass = directionSign > 0 ? "slide-in-from-right" : "slide-in-from-left";
    const outgoingClass = directionSign > 0 ? "slide-out-to-left" : "slide-out-to-right";

    // Limpiar solamente la capa entrante. La saliente debe conservar su
    // posición activa (translateX(0)) hasta que comience su salida.
    const transitionClasses = [
        "slide-in-from-right",
        "slide-in-from-left",
        "slide-out-to-left",
        "slide-out-to-right"
    ];
    incoming.classList.remove("is-active", ...transitionClasses);
    outgoing.classList.remove(...transitionClasses);

    incoming.src = getGameImage(game);
    incoming.alt = `Portada de ${game.title || "juego destacado"}`;
    incoming.classList.add(incomingClass);

    // Primero se fija la portada entrante fuera del área visible y luego
    // se activa para que el navegador interpole el desplazamiento completo.
    void incoming.offsetWidth;
    incoming.classList.add("is-active");
    outgoing.classList.add(outgoingClass);
    activeImageLayer = incomingLayer;

    // Al terminar, dejar la capa nueva como única activa y preparar la vieja
    // fuera de pantalla para el próximo cambio.
    window.setTimeout(() => {
        outgoing.classList.remove("is-active", ...transitionClasses);
        incoming.classList.remove(...transitionClasses);
        incoming.classList.add("is-active");
    }, 850);

    hero.classList.add("is-changing");
    tagline.classList.add("hero-copy-exit");
    title.classList.add("hero-copy-exit");
    description.classList.add("hero-copy-exit");
    window.setTimeout(() => {
        title.textContent = game.title || "Juego destacado";
        description.textContent = game.description || "Descubrí este juego de la comunidad Dreaming Rose.";
        tagline.textContent = game.es_proyecto_oficial ? "PROYECTO DREAMING ROSE" : "JUEGO DE LA COMUNIDAD";
        action.textContent = "VER JUEGO";
        action.onclick = () => {
            if (typeof window.openGameDetails === "function") window.openGameDetails(game.id);
            else window.location.href = "juegos.html";
        };
        [tagline, title, description].forEach(el => el.classList.remove("hero-copy-exit"));
        [tagline, title, description].forEach(el => el.classList.add("hero-copy-enter"));
        window.setTimeout(() => [tagline, title, description].forEach(el => el.classList.remove("hero-copy-enter")), 420);
        hero.classList.remove("is-changing");
        renderIndicators();
    }, 220);

    if (resetTimer) restartAutoplay();
}

function nextGame() {
    if (heroGames.length > 1) showGame(currentIndex + 1, false, 1);
}

function previousGame() {
    if (heroGames.length > 1) showGame(currentIndex - 1, false, -1);
}

function stopAutoplay() {
    if (autoplayTimer) window.clearInterval(autoplayTimer);
    autoplayTimer = null;
}

function restartAutoplay() {
    stopAutoplay();
    if (heroGames.length < 2) return;
    autoplayTimer = window.setInterval(nextGame, AUTOPLAY_DELAY);
}

export async function initHeroCarousel() {
    const hero = document.getElementById("heroCarousel");
    if (!hero) return;

    document.getElementById("heroNext")?.addEventListener("click", () => {
        nextGame();
        restartAutoplay();
    });
    document.getElementById("heroPrev")?.addEventListener("click", () => {
        previousGame();
        restartAutoplay();
    });

    hero.addEventListener("mouseenter", stopAutoplay);
    hero.addEventListener("mouseleave", restartAutoplay);
    hero.addEventListener("focusin", stopAutoplay);
    hero.addEventListener("focusout", restartAutoplay);

    hero.addEventListener("touchstart", event => {
        touchStartX = event.changedTouches[0]?.clientX || 0;
        stopAutoplay();
    }, { passive: true });
    hero.addEventListener("touchend", event => {
        touchEndX = event.changedTouches[0]?.clientX || 0;
        const delta = touchEndX - touchStartX;
        if (Math.abs(delta) > 45) {
            delta < 0 ? nextGame() : previousGame();
        }
        restartAutoplay();
    }, { passive: true });

    try {
        const { data, error } = await supabase
            .from("juegos")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        // La consulta incluye tanto los proyectos oficiales como los juegos de la comunidad.
        heroGames = (data || []).filter(isPublished);

        if (!heroGames.length) return;

        // Priorizar Meteor Fighters al inicio si está publicado; luego mantener el resto.
        const meteorIndex = heroGames.findIndex(game =>
            String(game.title || "").trim().toLowerCase() === "meteor fighters"
        );
        if (meteorIndex > 0) {
            const [meteor] = heroGames.splice(meteorIndex, 1);
            heroGames.unshift(meteor);
        }

        showGame(0);
        restartAutoplay();
    } catch (error) {
        console.error("No se pudo cargar el carrusel principal:", error);
        // El hero estático de Meteor Fighters queda como respaldo si falla la consulta.
    }
}
