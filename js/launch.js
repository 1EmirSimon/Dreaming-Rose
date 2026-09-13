// js/launch.js
// Cortina de cuenta regresiva: nadie ve el sitio hasta la fecha/hora de
// lanzamiento. Al llegar la hora, se abre sola para todos los que tengan
// la página abierta, sin que nadie tenga que recargar.

const CURTAIN_ENABLED = true;

const LAUNCH_DATE = new Date("2026-09-20T13:30:00-03:00");

function pad(n) {
    return String(n).padStart(2, "0");
}

export function waitForLaunch() {
    return new Promise((resolve) => {
        // Interruptor manual: si está apagado, ni se molesta en chequear la fecha.
        if (!CURTAIN_ENABLED) {
            resolve();
            return;
        }

        // Llave secreta para que el equipo pueda probar el sitio antes de
        // la apertura, sin que se abra para el resto de los visitantes.
        // Ejemplo: https://dreaming-rose.com/?preview=rose2026
        const params = new URLSearchParams(window.location.search);
        if (params.get("preview") === "rose2026") {
            resolve();
            return;
        }

        const now = new Date();

        // Ya pasó la fecha: no mostramos nada, sigue todo normal.
        if (now >= LAUNCH_DATE) {
            resolve();
            return;
        }

        const curtain = document.getElementById("launchCurtain");
        if (!curtain) {
            resolve();
            return;
        }

        const daysEl = document.getElementById("launchDays");
        const hoursEl = document.getElementById("launchHours");
        const minsEl = document.getElementById("launchMinutes");
        const secsEl = document.getElementById("launchSeconds");

        curtain.classList.add("active");
        document.body.style.overflow = "hidden";

        function tick() {
            const diff = LAUNCH_DATE - new Date();

            if (diff <= 0) {
                clearInterval(interval);
                openCurtain();
                return;
            }

            const totalSeconds = Math.floor(diff / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            if (daysEl) daysEl.textContent = pad(days);
            if (hoursEl) hoursEl.textContent = pad(hours);
            if (minsEl) minsEl.textContent = pad(minutes);
            if (secsEl) secsEl.textContent = pad(seconds);
        }

        function openCurtain() {
            curtain.classList.add("opening");
            // Duración igual al transition-duration de .launch-panel en launch.css
            setTimeout(() => {
                curtain.classList.remove("active", "opening");
                document.body.style.overflow = "";
                resolve();
            }, 1500);
        }

        tick();
        const interval = setInterval(tick, 1000);
    });
}
