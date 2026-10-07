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