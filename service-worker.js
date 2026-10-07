// Service Worker de Dreaming Rose
// Cachea archivos estáticos para que la web cargue rápido.

const CACHE_NAME = 'dreaming-rose-v1';

const ARCHIVOS_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './css/layout.css',
    './css/components.css',
    './css/pages.css',
    './css/animations.css',
    './css/launch.css',
    './js/main.js',
    './js/supabase.js',
    './js/auth.js',
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
    './js/mobile-menu.js',
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