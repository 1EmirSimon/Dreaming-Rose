import { startIntro } from "./loader.js";
import "./apelaciones.js";
import "./password.js";
import "./username.js";
import "./solicitudes.js";
import { showWebsite } from "./animations.js";
import { initGames } from "./games.js";
import { initAuth } from "./auth.js?v=20261106-desktop-moderation-ports-1";
import "./mobile-menu.js";
import { waitForLaunch } from "./launch.js";
import "./hero.js";
import { initHeroCarousel } from "./hero-carousel.js";
import "./admin.js?v=20261031-admin-phase1-1";
import "./proyecto-oficial.js";

initAuth();
initHeroCarousel();

const preloadLogo = new Image();
preloadLogo.src = "assets/Icons/Channel_Profile_Dreaming_Rose.png";

window.addEventListener("load", () => {
  waitForLaunch().then(() => startIntro(initGames, showWebsite));
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js?v=20261110-frontend-audit-v2", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch((error) => console.error("Error registrando Service Worker:", error));
  });
}

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const button = document.getElementById("btnInstalarApp");
  if (button && window.innerWidth <= 900 && !installed) button.style.display = "inline-block";
});

window.instalarPWA = async function () {
  if (!deferredPrompt) {
    alert("Para instalar la app, abrí el menú del navegador y elegí ‘Instalar aplicación’ o ‘Añadir a pantalla de inicio’.");
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Instalación PWA: ${outcome}`);
  deferredPrompt = null;
  const button = document.getElementById("btnInstalarApp");
  if (button) button.style.display = "none";
};

window.addEventListener("appinstalled", () => {
  const button = document.getElementById("btnInstalarApp");
  if (button) button.style.display = "none";
  deferredPrompt = null;
});

window.addEventListener("resize", () => {
  const button = document.getElementById("btnInstalarApp");
  if (button && window.innerWidth > 900) button.style.display = "none";
});

window.addEventListener("load", () => {
  const action = new URLSearchParams(window.location.search).get("accion");
  if (action === "usuario") window.setTimeout(() => window.openUsernameModal?.(), 300);
  if (action === "contrasena") window.setTimeout(() => window.openPasswordModal?.(), 300);
  if (action) window.history.replaceState({}, "", window.location.pathname + window.location.hash);
});
