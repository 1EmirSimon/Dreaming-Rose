import { supabase } from "./supabase.js";

let isRegisterMode = false;
let authWidgetId = null;

export function initAuth() {
    checkUserSession();
    initAuthCaptcha();
}

// Renderizamos el captcha del login "a mano" (explícito), porque hay otro
// widget más en la página (el de publicar) y no queremos que se mezclen.
function initAuthCaptcha() {
    if (!window.turnstile) {
        setTimeout(initAuthCaptcha, 200);
        return;
    }
    const container = document.getElementById("turnstileAuth");
    if (container && authWidgetId === null) {
        authWidgetId = window.turnstile.render(container, {
            sitekey: container.dataset.sitekey,
            theme: "dark",
        });
    }
}

async function checkUserSession() {
    const { data: { session } } = await supabase.auth.getSession();
    await handleProfile(session?.user);

    supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleProfile(session?.user);
    });
}

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

    if (profile && profile.role?.toLowerCase() === 'banned') {
        alert("Tu cuenta ha sido suspendida. Contacta a soporte si crees que es un error.");
        await supabase.auth.signOut();
        updateUI(null, null);
        return;
    }

    updateUI(user, profile);
}

function updateUI(user, profile) {
    const btnLogin = document.getElementById("btnLogin");
    const userInfo = document.getElementById("userInfo");
    const userBadge = document.getElementById("userBadge");
    const btnPublish = document.getElementById("btnPublish");
    const btnAdminPanel = document.getElementById("btnAdminPanel");

    if (user && profile) {
        if (btnLogin) btnLogin.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";

        const userRole = (profile.role || 'usuario').toLowerCase();
        const roleTag = userRole !== 'usuario' ? ` [${userRole.toUpperCase()}]` : '';
        if (userBadge) userBadge.textContent = `@${profile.username || 'usuario'}${roleTag}`;

        const allowedPublishRoles = ['creador', 'moderador', 'root'];
        if (btnPublish) {
            btnPublish.style.display = allowedPublishRoles.includes(userRole) ? "inline-block" : "none";
        }

        const allowedAdminRoles = ['moderador', 'root'];
        if (btnAdminPanel) {
            btnAdminPanel.style.display = allowedAdminRoles.includes(userRole) ? "inline-block" : "none";
        }
    } else {
        if (btnLogin) btnLogin.style.display = "inline-block";
        if (userInfo) userInfo.style.display = "none";
        if (btnPublish) btnPublish.style.display = "none";
        if (btnAdminPanel) btnAdminPanel.style.display = "none";
    }
}

export async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
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

export async function handleAuth(e) {
    e.preventDefault();

    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const usernameInput = document.getElementById("authUsername");
    const errorMsg = document.getElementById("authError");

    const email = emailInput ? emailInput.value : "";
    const password = passwordInput ? passwordInput.value : "";
    const username = usernameInput ? usernameInput.value : "";

    // Token del captcha "No soy un robot" (Cloudflare Turnstile)
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
        // Los tokens de Turnstile son de un solo uso: siempre hay que resetear
        if (window.turnstile && authWidgetId !== null) window.turnstile.reset(authWidgetId);
    }
}

export async function logout() {
    await supabase.auth.signOut();
}

window.openAuthModal = openAuthModal;
window.signInWithGoogle = signInWithGoogle;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.handleAuth = handleAuth;
window.logout = logout;