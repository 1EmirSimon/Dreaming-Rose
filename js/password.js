// js/password.js
import { supabase } from "./supabase.js";

let passwordWidgetId = null;

// Renderiza el captcha del modal de contraseña (explícito, con ID propio,
// porque ya hay otros dos en la página: login y publicar).
function initPasswordCaptcha() {
    if (!window.turnstile) {
        setTimeout(initPasswordCaptcha, 200);
        return;
    }
    const container = document.getElementById("turnstilePassword");
    if (container && passwordWidgetId === null) {
        passwordWidgetId = window.turnstile.render(container, {
            sitekey: container.dataset.sitekey,
            theme: "dark",
        });
    }
}

window.openPasswordModal = async function() {
    const modal = document.getElementById("passwordModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    initPasswordCaptcha();

    const { data: { user } } = await supabase.auth.getUser();
    const inputEmail = document.getElementById("passwordEmail");
    if (inputEmail && user?.email) {
        inputEmail.value = user.email;
        inputEmail.readOnly = true;
        inputEmail.style.opacity = "0.7";
    }
};

window.closePasswordModal = function() {
    const modal = document.getElementById("passwordModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
    const err = document.getElementById("passwordError");
    const ok = document.getElementById("passwordSuccess");
    if (err) err.style.display = "none";
    if (ok) ok.style.display = "none";

    // Reset del captcha para la próxima apertura
    if (window.turnstile && passwordWidgetId !== null) {
        window.turnstile.reset(passwordWidgetId);
    }
};

window.enviarCambioPassword = async function(event) {
    event.preventDefault();

    const email = document.getElementById("passwordEmail")?.value.trim();
    const errorMsg = document.getElementById("passwordError");
    const successMsg = document.getElementById("passwordSuccess");

    if (errorMsg) errorMsg.style.display = "none";
    if (successMsg) successMsg.style.display = "none";

    // Leer el token del captcha
    const captchaToken = (window.turnstile && passwordWidgetId !== null)
        ? window.turnstile.getResponse(passwordWidgetId)
        : null;

    if (!captchaToken) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Completá la verificación \"No soy un robot\" antes de continuar.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (!email) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Ingresá tu correo.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const redirectTo = window.location.origin + window.location.pathname;

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
        captchaToken
    });

    if (error) {
        console.error("Error enviando link:", error);
        if (errorMsg) {
            errorMsg.textContent = "Error: " + error.message;
            errorMsg.style.display = "block";
        }
        // Resetear el captcha si falló (los tokens son de un solo uso)
        if (window.turnstile && passwordWidgetId !== null) {
            window.turnstile.reset(passwordWidgetId);
        }
        return;
    }

    if (successMsg) {
        successMsg.textContent = "✅ Te mandamos un mail con el link. Revisá tu correo (y el spam).";
        successMsg.style.display = "block";
    }
};

// Detecta si el usuario llegó desde el link del mail
(async function detectarRecuperacion() {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.substring(1));
    if (params.get("type") === "recovery") {
        setTimeout(() => {
            const modal = document.getElementById("newPasswordModal");
            if (modal) {
                modal.classList.add("active");
                document.body.style.overflow = "hidden";
            }
            history.replaceState(null, "", window.location.pathname);
        }, 800);
    }
})();

window.guardarNuevaPassword = async function(event) {
    event.preventDefault();

    const pass1 = document.getElementById("newPasswordInput")?.value;
    const pass2 = document.getElementById("newPasswordConfirm")?.value;
    const errorMsg = document.getElementById("newPasswordError");

    if (errorMsg) errorMsg.style.display = "none";

    if (pass1 !== pass2) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Las contraseñas no coinciden.";
            errorMsg.style.display = "block";
        }
        return;
    }

    if (pass1.length < 8) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ La contraseña debe tener al menos 8 caracteres.";
            errorMsg.style.display = "block";
        }
        return;
    }

    const { error } = await supabase.auth.updateUser({ password: pass1 });

    if (error) {
        console.error("Error cambiando contraseña:", error);
        if (errorMsg) {
            errorMsg.textContent = "Error: " + error.message;
            errorMsg.style.display = "block";
        }
        return;
    }

    alert("✅ Contraseña cambiada con éxito.");
    document.getElementById("newPasswordModal")?.classList.remove("active");
    document.body.style.overflow = "auto";
};