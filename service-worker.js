/* Dreaming Rose PWA — actualización segura de recursos */
const CACHE_PREFIX = "dreaming-rose-";
const CACHE_NAME = `${CACHE_PREFIX}phase3-20261105-ports-v1`;

const APP_ASSETS = [
  "./",
  "./index.html",
  "./juegos.html",
  "./creador.html",
  "./moderacion.html",
  "./perfil.html",
  "./manifest.json",
  "./css/style.css",
  "./css/desktop-responsive.css",
  "./css/admin-panel.css",
  "./css/dstyle.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/pages.css",
  "./css/animations.css",
  "./css/launch.css",
  "./css/navigation-responsive.css",
  "./css/publish-optimized.css",
  "./css/community-links.css",
  "./css/catalogo.css",
  "./css/creador-dashboard.css",
  "./css/perfil.css",
  "./css/refinamiento-layout.css",
  "./css/admin-console.css",
  "./js/main.js",
  "./js/supabase.js",
  "./js/auth.js",
  "./js/games.js",
  "./js/admin.js",
  "./js/moderacion.js",
  "./js/catalogo.js",
  "./js/creador-dashboard.js",
  "./js/perfil.js",
  "./js/animations.js",
  "./js/launch.js",
  "./js/loader.js",
  "./js/hero.js",
  "./js/utils.js",
  "./js/password.js",
  "./js/username.js",
  "./js/solicitudes.js",
  "./js/apelaciones.js",
  "./js/mobile-menu.js",
  "./js/proyecto-oficial.js",
  "./assets/Icons/rosaaa MArlo icono.png",
  "./assets/Icons/Channel_Profile_Dreaming_Rose.png",
  "./assets/images/Meteor Fighters.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache individual assets so one optional/missing file does not cancel the full install.
    await Promise.allSettled(APP_ASSETS.map((asset) => cache.add(asset)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept APIs or third-party assets.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/") || url.pathname.includes("/storage/v1/")) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
