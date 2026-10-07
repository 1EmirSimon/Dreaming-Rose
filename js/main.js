import { startIntro } from "./loader.js";
import "./apelaciones.js";
import "./password.js";
import "./username.js";
import "./solicitudes.js";
import { showWebsite } from "./animations.js";
import { initGames } from "./games.js";
import { initAuth } from "./auth.js";
import "./mobile-menu.js";
import { waitForLaunch } from "./launch.js";
import "./hero.js";
import "./admin.js"; // Se importa el panel de administración
import "./proyecto-oficial.js";


initAuth();

const preloadLogo = new Image();
preloadLogo.src = "assets/Icons/Channel_Profile_Dreaming_Rose.png";

window.addEventListener("load", () => {
    waitForLaunch().then(() => {
        startIntro(initGames, showWebsite);
    });
});

// Registra el Service Worker para que la web sea instalable (PWA)
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then((reg) => console.log("✅ Service Worker registrado:", reg.scope))
            .catch((err) => console.error("Error registrando SW:", err));
    });
}

// ============================================================
// BOTÓN INSTALAR APP (PWA)
// ============================================================

let deferredPrompt = null;

// El navegador dispara "beforeinstallprompt" cuando la PWA es instalable.
// Guardamos el evento para dispararlo cuando el usuario toque el botón.
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // Solo mostrar el botón en mobile y si la app no está ya instalada
    const esMobile = window.innerWidth <= 900;
    const yaInstalada = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    if (esMobile && !yaInstalada) {
        const btn = document.getElementById('btnInstalarApp');
        if (btn) btn.style.display = 'inline-block';
    }
});

// Función que se llama cuando el usuario toca el botón
window.instalarPWA = async function() {
    if (!deferredPrompt) {
        alert("Para instalar la app: abrí el menú del navegador y buscá 'Instalar aplicación' o 'Añadir a pantalla de inicio'.");
        return;
    }

    // Mostrar el diálogo nativo de instalación
    deferredPrompt.prompt();

    // Esperar la respuesta del usuario
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Instalación PWA: ${outcome}`);

    // Limpiar el evento (solo se puede usar una vez)
    deferredPrompt = null;

    // Ocultar el botón (haya aceptado o no)
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'none';
};

// Si el usuario instala la app, ocultar el botón
window.addEventListener('appinstalled', () => {
    console.log('✅ Dreaming Rose instalada como app');
    const btn = document.getElementById('btnInstalarApp');
    if (btn) btn.style.display = 'none';
    deferredPrompt = null;
});

// Ocultar el botón si cambia a desktop
window.addEventListener('resize', () => {
    const btn = document.getElementById('btnInstalarApp');
    if (!btn) return;

    if (window.innerWidth > 900) {
        btn.style.display = 'none';
    }
});