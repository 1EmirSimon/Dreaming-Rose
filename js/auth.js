// js/auth.js
// ============================================================
// TODO lo relacionado a login/registro/sesión:
// - Login con correo y contraseña
// - Login con Google
// - Captcha "No soy un robot" (Cloudflare Turnstile)
// - Mostrar/ocultar botones según el rol del usuario logueado
// - Cerrar sesión automática si el usuario está baneado
// ============================================================

import { supabase } from "./supabase.js";

let isRegisterMode = false; // false = pantalla de login, true = pantalla de registro
let authWidgetId = null;    // ID que nos da Cloudflare para ESTE widget de captcha en particular

// Se llama una sola vez, al arrancar la página.
export function initAuth() {
    checkUserSession();  // ¿ya había una sesión abierta de antes?
    initAuthCaptcha();   // preparar el captcha del login
}

// Dibuja el widget de captcha "a mano" (renderizado explícito) en vez de
// dejar que Turnstile lo haga solo. ¿Por qué? Porque hay OTRO widget más
// en la página (el del formulario de publicar juego), y si dejamos que
// Turnstile los detecte solo, se puede confundir de cuál es cuál.
// Por eso cada uno se dibuja por separado y guardamos su ID real.
function initAuthCaptcha() {
    if (!window.turnstile) {
        // El script de Turnstile capaz todavía no terminó de cargar:
        // reintentamos cada 200ms hasta que esté listo.
        setTimeout(initAuthCaptcha, 200);
        return;
    }
    const container = document.getElementById("turnstileAuth");
    if (container && authWidgetId === null) {
        authWidgetId = window.turnstile.render(container, {
            sitekey: container.dataset.sitekey, // la Site Key pública, puesta en el HTML
            theme: "dark",
        });
    }
}

// Se fija si ya hay una sesión guardada (por ejemplo, si cerraste el
// navegador y lo volviste a abrir) y se queda escuchando cualquier
// cambio futuro de sesión (login, logout, etc.) para actualizar la
// pantalla automáticamente sin tener que recargar.
async function checkUserSession() {
    const { data: { session } } = await supabase.auth.getSession();
    await handleProfile(session?.user);

    supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleProfile(session?.user);
    });
}

// A partir de un usuario logueado, busca su perfil (username y rol)
// en la tabla "usuarios" y actualiza la pantalla. Si el usuario está
// baneado, lo desconecta automáticamente ahí mismo.
async function handleProfile(user) {
    if (!user) {
        updateUI(null, null);
        return;
    }

    const { data: profile, error } = await supabase
        .from('usuarios')
        .select('username, role')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error("Error consultando el perfil:", error);
    }

    // Chequeo de baneo: si su rol es "banned", lo sacamos de la sesión
    // apenas lo detectamos (esto se dispara solo, en cualquier página).
    if (profile && profile.role?.toLowerCase() === 'banned') {
        alert("Tu cuenta ha sido suspendida. Contacta a soporte si crees que es un error.");
        await supabase.auth.signOut();
        updateUI(null, null);
        return;
    }

    updateUI(user, profile);
}

// Muestra/oculta los botones de arriba a la derecha según si hay
// alguien logueado y qué rol tiene (usuario / creador / moderador / root).
function updateUI(user, profile) {
    const btnLogin = document.getElementById("btnLogin");
    const userInfo = document.getElementById("userInfo");
    const userBadge = document.getElementById("userBadge");
    const btnPublish = document.getElementById("btnPublish");
    const btnAdminPanel = document.getElementById("btnAdminPanel");

    if (user && profile) {
        // Hay sesión: ocultar "Ingresar" y mostrar el nombre de usuario
        if (btnLogin) btnLogin.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";

        const userRole = (profile.role || 'usuario').toLowerCase();
        const roleTag = userRole !== 'usuario' ? ` [${userRole.toUpperCase()}]` : '';
        if (userBadge) userBadge.textContent = `@${profile.username || 'usuario'}${roleTag}`;

        // El botón de "Publicar Juego" solo lo ven creador/moderador/root
        const allowedPublishRoles = ['creador', 'moderador', 'root'];
        if (btnPublish) {
            btnPublish.style.display = allowedPublishRoles.includes(userRole) ? "inline-block" : "none";
        }

        // El botón de "Panel Admin" solo lo ven moderador/root
        // (esto es solo para mostrar/ocultar el botón; la seguridad de
        // verdad está en admin.js + las políticas RLS de Supabase)
        const allowedAdminRoles = ['moderador', 'root'];
        if (btnAdminPanel) {
            btnAdminPanel.style.display = allowedAdminRoles.includes(userRole) ? "inline-block" : "none";
        }
    } else {
        // No hay sesión: mostrar "Ingresar" y ocultar todo lo demás
        if (btnLogin) btnLogin.style.display = "inline-block";
        if (userInfo) userInfo.style.display = "none";
        if (btnPublish) btnPublish.style.display = "none";
        if (btnAdminPanel) btnAdminPanel.style.display = "none";
    }
}

// Botón "Continuar con Google". Supabase se encarga de todo el ida-y-vuelta
// con Google; cuando el usuario vuelve, onAuthStateChange (más arriba)
// detecta la sesión nueva solo, sin que tengamos que hacer nada más acá.
export async function signInWithGoogle() {
    // Importante: usamos origin + pathname (no solo origin) porque en
    // GitHub Pages el sitio vive dentro de una carpeta
    // (https://usuario.github.io/Dreaming-Rose/), no en la raíz del
    // dominio. Si usáramos solo origin, Google nos devolvería a la raíz
    // del dominio (que no existe) en vez de a la carpeta real del sitio.
    const currentPath = window.location.origin + window.location.pathname;

    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: currentPath }
    });
    if (error) alert("Error al iniciar sesión con Google: " + error.message);
}

export function openAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
}

export function closeAuthModal() {
    const modal = document.getElementById("authModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
}

// Cambia el formulario entre modo "Iniciar Sesión" y modo "Registrarse"
// (mismo formulario, solo cambia qué campos se ven y los textos).
export function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isRegisterMode = !isRegisterMode;

    const title = document.getElementById("authTitle");
    const usernameInput = document.getElementById("authUsername");
    const submitBtn = document.getElementById("btnAuthSubmit");
    const toggleText = document.getElementById("authToggleText");
    const toggleLink = document.getElementById("authToggleLink");
    const errorMsg = document.getElementById("authError");

    if (errorMsg) errorMsg.style.display = "none";

    if (isRegisterMode) {
        if (title) title.textContent = "CREAR CUENTA";
        if (usernameInput) {
            usernameInput.style.display = "block";
            usernameInput.required = true;
        }
        if (submitBtn) submitBtn.textContent = "REGISTRARSE";
        if (toggleText) toggleText.textContent = "¿Ya tienes cuenta?";
        if (toggleLink) toggleLink.textContent = "Iniciar Sesión";
    } else {
        if (title) title.textContent = "INICIAR SESIÓN";
        if (usernameInput) {
            usernameInput.style.display = "none";
            usernameInput.required = false;
        }
        if (submitBtn) submitBtn.textContent = "ENTRAR";
        if (toggleText) toggleText.textContent = "¿No tienes cuenta?";
        if (toggleLink) toggleLink.textContent = "Registrarse";
    }
}

// Se dispara al enviar el formulario (tanto login como registro,
// según isRegisterMode). Antes de nada valida el captcha.
export async function handleAuth(e) {
    e.preventDefault();

    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const usernameInput = document.getElementById("authUsername");
    const errorMsg = document.getElementById("authError");

    const email = emailInput ? emailInput.value : "";
    const password = passwordInput ? passwordInput.value : "";
    const username = usernameInput ? usernameInput.value : "";

    // Le pedimos al widget el token que generó (si el usuario ya se
    // verificó como "no robot"). Si todavía no se verificó, esto va
    // a venir vacío.
    const captchaToken = (window.turnstile && authWidgetId !== null)
        ? window.turnstile.getResponse(authWidgetId)
        : null;

    if (errorMsg) errorMsg.style.display = "none";

    if (!captchaToken) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Completá la verificación \"No soy un robot\" antes de continuar.";
            errorMsg.style.display = "block";
        }
        return;
    }

    try {
        if (isRegisterMode) {
            // signUp crea la cuenta en auth.users. La fila correspondiente
            // en la tabla "usuarios" la crea SOLA la base de datos, gracias
            // a un trigger (ver 12_perfil_automatico.sql) — acá no hace
            // falta insertarla a mano.
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { username }, captchaToken }
            });
            if (error) throw error;
            alert("¡Cuenta creada con éxito!");
            closeAuthModal();
        } else {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
                options: { captchaToken }
            });
            if (error) throw error;
            closeAuthModal();
        }
    } catch (error) {
        if (errorMsg) {
            errorMsg.textContent = error.message;
            errorMsg.style.display = "block";
        }
    } finally {
        // Los tokens de Turnstile son de un solo uso: se resetea el
        // widget después de cada intento (haya salido bien o mal),
        // para que la próxima vez pida una verificación nueva.
        if (window.turnstile && authWidgetId !== null) window.turnstile.reset(authWidgetId);
    }
}

export async function logout() {
    await supabase.auth.signOut();
}

// Se cuelgan de "window" para poder llamarlas desde los onclick="" del HTML
window.openAuthModal = openAuthModal;
window.signInWithGoogle = signInWithGoogle;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.handleAuth = handleAuth;
window.logout = logout;