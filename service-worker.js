// Service Worker de Dreaming Rose
// Cachea archivos estáticos para que la web cargue rápido.

const CACHE_NAME = 'dreaming-rose-desktop-clean-20261030-v3';

const ARCHIVOS_CACHE = [
    './',
    './index.html',
    './juegos.html',
    './creador.html',
    './moderacion.html',
    './perfil.html',
    './css/catalogo.css?v=20261030-desktop-clean-2',
    './css/publish-optimized.css?v=20261030-desktop-clean-2',
    './css/creador-dashboard.css?v=20261030-desktop-clean-2',
    './css/perfil.css?v=20261030-desktop-clean-2',
    './js/catalogo.js',
    './js/creador-dashboard.js',
    './js/moderacion.js',
    './js/perfil.js',
    './css/style.css?v=20261030-desktop-clean-2',
    './css/refinamiento-layout.css?v=20261030-desktop-clean-2',
    './css/layout.css?v=20261030-desktop-clean-2',
    './css/components.css?v=20261030-desktop-clean-2',
    './css/pages.css?v=20261030-desktop-clean-2',
    './css/animations.css?v=20261030-desktop-clean-2',
    './css/launch.css?v=20261030-desktop-clean-2',
    './css/navigation-responsive.css?v=20261030-desktop-clean-2',
    './css/desktop-responsive.css?v=20261030-desktop-clean-2',
    './js/main.js?v=20261030-desktop-clean-2',
    './js/supabase.js',
    './js/auth.js?v=20261030-desktop-clean-2',
    './js/games.js',
    './js/admin.js',
    './js/animations.js',
    './js/launch.js',
    './js/loader.js',
    './js/hero.js',
    './js/utils.js',
    './js/password.js',
    './js/username.js',
    './js/solicitudes.js',
    './js/apelaciones.js',
    './js/mobile-menu.js?v=20261030-desktop-clean-2',
    './js/proyecto-oficial.js',
    './assets/Icons/rosaaa MArlo icono.png',
    './assets/Icons/Channel_Profile_Dreaming_Rose.png',
    './assets/images/Meteor Fighters.png'
];

// Instalación: guardar los archivos en el cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ARCHIVOS_CACHE).catch((err) => {
                console.warn("Algunos archivos no se pudieron cachear:", err);
            });
        })
    );
    self.skipWaiting();
});

// Activación: borrar caches viejos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: red primero, cache como respaldo
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Solo aplicar estrategia de caché a solicitudes GET.
    if (event.request.method !== 'GET') return;

    // No cachear llamadas a Supabase, Cloudflare, ni Google
    if (url.includes('supabase.co') || url.includes('cloudflare.com') || url.includes('google')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Guardar en cache si la respuesta es OK
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si la red falla, buscar en el cache
                return caches.match(event.request);
            })
    );
});
