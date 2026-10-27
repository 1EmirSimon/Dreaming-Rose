
// Mantener el calendario de registro dentro de fechas válidas (hasta hoy).
function setBirthDatePickerBounds() {
    const input = document.getElementById("authBirthDate");
    if (!input) return;
    const today = new Date();
    const localToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    input.max = localToday;
    if (!input.min) input.min = "1900-01-01";
}
document.addEventListener("DOMContentLoaded", setBirthDatePickerBounds);

// js/auth.js

// TODO lo relacionado a login/registro/sesión:
// - Login con correo y contraseña
// - Login con Google
// - Captcha "No soy un robot" (Cloudflare Turnstile)
// - Mostrar/ocultar botones según el rol del usuario logueado
// - Cerrar sesión automática si el usuario está baneado

import { supabase } from "./supabase.js";


let isRegisterMode = false; // false = pantalla de login, true = pantalla de registro
let authWidgetId = null;    // ID que nos da Cloudflare para ESTE widget de captcha en particular

// Se llama una sola vez, al arrancar la página.
export function initAuth() {
    const birthDateInput = document.getElementById("authBirthDate");
    if (birthDateInput) birthDateInput.max = new Date().toISOString().slice(0, 10);
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

// Se fija si ya hay una sesión guardada y se queda escuchando cualquier
// cambio futuro de sesión (login, logout, etc.) para actualizar la
// pantalla automáticamente sin tener que recargar.
async function checkUserSession() {
    const { data: { session } } = await supabase.auth.getSession();
    await handleProfile(session?.user);

    supabase.auth.onAuthStateChange(async (_event, session) => {
        await handleProfile(session?.user);
    });
}

// Valida una fecha real y calcula el grupo según la edad exacta.
// La transición a 13+ ocurre el día del cumpleaños número 13.
function validarFechaNacimiento(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day &&
        date <= new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") &&
        year >= 1900;
}

function calcularGrupoPorFecha(value, today = new Date()) {
    if (!validarFechaNacimiento(value)) return "sin_clasificar";
    const [year, month, day] = value.split("-").map(Number);
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let age = now.getFullYear() - year;
    const birthdayNotReached =
        now.getMonth() + 1 < month ||
        (now.getMonth() + 1 === month && now.getDate() < day);
    if (birthdayNotReached) age--;
    return age < 13 ? "menor_13" : "13_mas";
}

// A partir de un usuario logueado, busca su perfil (username y rol)
// en la tabla "usuarios" y actualiza la pantalla. Si el usuario está
// baneado, lo desconecta automáticamente ahí mismo.
async function handleProfile(user) {
    if (!user) {
        updateUI(null, null);
        // Cerrar el modal de apelación si estaba abierto (por si el usuario
        // se deslogueó desde la pantalla de baneo)
        const apelacionModal = document.getElementById("apelacionModal");
        if (apelacionModal) {
            apelacionModal.classList.remove("active");
            document.body.style.overflow = "auto";
        }
        return;
    }

    // Consultar el perfil antes de pedir datos adicionales. El inicio de sesión
    // no se bloquea si una cuenta antigua todavía no tiene año de nacimiento.
    let userForProfile = user;
    let { data: profile, error } = await supabase
        .from('usuarios')
        .select('username, role, birth_date, birth_year, age_group')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error("Error consultando el perfil:", error);
    }

    // Completar la fecha de nacimiento solo si falta. En Google OAuth se pregunta
    // después de volver a Dreaming Rose, sin alterar el flujo de cuentas existentes.
    let birthDate = profile?.birth_date || user.user_metadata?.birth_date || null;
    if (!validarFechaNacimiento(birthDate)) {
        const promptKey = `dr_birth_date_prompted_${user.id}`;
        let alreadyPrompted = false;
        try { alreadyPrompted = sessionStorage.getItem(promptKey) === "1"; } catch {}
        if (!alreadyPrompted) {
            try { sessionStorage.setItem(promptKey, "1"); } catch {}
            const dateText = window.prompt(
                "Para clasificar tu cuenta, ingresá tu fecha de nacimiento completa (AAAA-MM-DD). Si la completás más tarde, tu cuenta quedará sin clasificar hasta entonces."
            );
            if (dateText !== null && dateText.trim() !== "") {
                if (!validarFechaNacimiento(dateText.trim())) {
                    alert("La fecha no es válida. Usá el formato AAAA-MM-DD y una fecha real.");
                } else {
                    birthDate = dateText.trim();
                    const ageGroup = calcularGrupoPorFecha(birthDate);
                    const { data: updated, error: updateError } = await supabase.auth.updateUser({
                        data: { birth_date: birthDate, birth_year: Number(birthDate.slice(0, 4)), age_group: ageGroup }
                    });
                    if (updateError) {
                        console.error("No se pudo guardar la fecha de nacimiento:", updateError);
                        alert("No pudimos guardar tu fecha de nacimiento. Tu cuenta seguirá sin clasificar por ahora.");
                    } else if (updated?.user) {
                        userForProfile = updated.user;
                        const result = await supabase
                            .from('usuarios')
                            .select('username, role, birth_date, birth_year, age_group')
                            .eq('id', user.id)
                            .single();
                        if (!result.error) profile = result.data;
                    }
                }
            }
        }
    }

    // Recalcular la clasificación exacta al iniciar/cargar sesión. La base de datos
    // también ejecuta una actualización diaria para que el cambio ocurra en el cumpleaños.
    birthDate = profile?.birth_date || userForProfile.user_metadata?.birth_date || birthDate;
    if (validarFechaNacimiento(birthDate)) {
        const expectedGroup = calcularGrupoPorFecha(birthDate);
        if (profile?.age_group !== expectedGroup || profile?.birth_date !== birthDate) {
            const { error: syncError } = await supabase.auth.updateUser({
                data: { birth_date: birthDate, birth_year: Number(birthDate.slice(0, 4)), age_group: expectedGroup }
            });
            if (syncError) console.warn("No se pudo sincronizar la clasificación por edad:", syncError);
            const synced = await supabase
                .from('usuarios')
                .select('username, role, birth_date, birth_year, age_group')
                .eq('id', user.id)
                .single();
            if (!synced.error) profile = synced.data;
        }
    }

    // Chequeo de baneo: si su rol es "banned", lo sacamos de la sesión
    // apenas lo detectamos (esto se dispara solo, en cualquier página).
    if (profile && profile.role?.toLowerCase() === 'banned') {
        updateUI(user, profile); // Mostrar la UI base igual

        // Abrir el modal de apelación (el baneado ve solo eso)
        if (typeof window.mostrarModalApelacion === "function") {
            await window.mostrarModalApelacion(user.id);
        }
        return;
    }

    updateUI(user, profile);

    // Refrescar los likes del usuario logueado
    if (typeof window.cargarMisLikes === "function") {
        await window.cargarMisLikes(user?.id || null);
    }
}

// Muestra/oculta los botones de arriba a la derecha según si hay
// alguien logueado y qué rol tiene (usuario / creador / moderador / root).
function updateUI(user, profile) {
    const btnLogin = document.getElementById("btnLogin");
    const userInfo = document.getElementById("userInfo");
    const userBadge = document.getElementById("userBadge");
    const btnPublish = document.getElementById("btnPublish");
    const btnAdminPanel = document.getElementById("btnAdminPanel");
    const btnModerationQuick = document.getElementById("btnModerationQuick");
    const btnCreatorDashboard = document.getElementById("btnCreatorDashboard");
    const btnSolicitar = document.getElementById("btnSolicitarCreador");

    if (user && profile) {
        // Hay sesión: ocultar "Ingresar" y mostrar el nombre de usuario
        if (btnLogin) btnLogin.style.display = "none";
        if (userInfo) userInfo.style.display = "flex";

        const userRole = (profile.role || 'usuario').toLowerCase();
        const roleTag = userRole !== 'usuario' ? ` [${userRole.toUpperCase()}]` : '';
        const ageTag = profile.age_group === 'menor_13' ? ' [GRUPO PROTEGIDO]' : profile.age_group === '13_mas' ? ' [13+]' : profile.age_group === 'sin_clasificar' ? ' [SIN CLASIFICAR]' : '';
        if (userBadge) userBadge.textContent = `@${profile.username || 'usuario'}${roleTag}${ageTag}`;

        // El botón de "Publicar Juego" solo lo ven creador/moderador/root
        const allowedPublishRoles = ['creador', 'moderador', 'root'];
        if (btnPublish) {
            btnPublish.style.display = allowedPublishRoles.includes(userRole) ? "inline-block" : "none";
        }
        if (btnCreatorDashboard) {
            btnCreatorDashboard.style.display = allowedPublishRoles.includes(userRole) ? "inline-block" : "none";
        }
        const mobileCreatorDashboard = document.getElementById("mobileBtnCreatorDashboard");
        if (mobileCreatorDashboard) {
            mobileCreatorDashboard.style.display = allowedPublishRoles.includes(userRole) ? "flex" : "none";
        }
        const mobileAdmin = document.getElementById("mobileBtnAdmin");
        if (mobileAdmin) {
            mobileAdmin.style.display = ['moderador', 'root'].includes(userRole) ? "flex" : "none";
        }

        // El botón de "Ser Creador" solo lo ve un usuario común
        if (btnSolicitar) {
            btnSolicitar.style.display = userRole === 'usuario' ? "inline-block" : "none";
        }

        // El botón de "Panel Admin" solo lo ven moderador/root
        // (esto es solo para mostrar/ocultar el botón; la seguridad de
        // verdad está en admin.js + las políticas RLS de Supabase)
        const allowedAdminRoles = ['moderador', 'root'];
        if (btnAdminPanel) {
            btnAdminPanel.style.display = allowedAdminRoles.includes(userRole) ? "inline-flex" : "none";
        }
        if (btnModerationQuick) {
            btnModerationQuick.style.display = allowedAdminRoles.includes(userRole) ? "inline-flex" : "none";
        }
        const mobileModeration = document.getElementById("mobileBtnModeration");
        if (mobileModeration) mobileModeration.style.display = allowedAdminRoles.includes(userRole) ? "flex" : "none";

                // Botón de "Agregar Proyecto" (solo mod/root)
        const btnAgregarProyecto = document.getElementById("btnAgregarProyectoOficial");
        if (btnAgregarProyecto) {
            btnAgregarProyecto.style.display = allowedAdminRoles.includes(userRole) ? "inline-block" : "none";
        }

        // Actualizar el menú mobile (solo se ve en pantallas chicas)
        if (typeof window.actualizarMenuMobile === "function") {
            window.actualizarMenuMobile(user, profile);
        }

    } else {
        // No hay sesión: mostrar "Ingresar" y ocultar todo lo demás
        if (btnLogin) btnLogin.style.display = "inline-block";
        if (userInfo) userInfo.style.display = "none";
        if (btnPublish) btnPublish.style.display = "none";
        if (btnCreatorDashboard) btnCreatorDashboard.style.display = "none";
        if (btnAdminPanel) btnAdminPanel.style.display = "none";
        if (btnModerationQuick) btnModerationQuick.style.display = "none";
        const mobileModeration = document.getElementById("mobileBtnModeration");
        if (mobileModeration) mobileModeration.style.display = "none";
        const mobileCreatorDashboard = document.getElementById("mobileBtnCreatorDashboard");
        if (mobileCreatorDashboard) mobileCreatorDashboard.style.display = "none";
        const mobileAdmin = document.getElementById("mobileBtnAdmin");
        if (mobileAdmin) mobileAdmin.style.display = "none";
        if (btnSolicitar) btnSolicitar.style.display = "none";

        // Actualizar el menú mobile (sin sesión)
        if (typeof window.actualizarMenuMobile === "function") {
            window.actualizarMenuMobile(null, null);

        const btnAgregarProyecto = document.getElementById("btnAgregarProyectoOficial");
        if (btnAgregarProyecto) btnAgregarProyecto.style.display = "none";
        }
    }
}
        // Actualizar el formulario de comentarios (si hay uno abierto)
        if (typeof window.actualizarFormularioComentario === "function") {
            window.actualizarFormularioComentario();
        }

// Botón "Continuar con Google". Supabase se encarga de todo el ida-y-vuelta
// con Google; cuando el usuario vuelve, onAuthStateChange (más arriba)
// detecta la sesión nueva solo.
export async function signInWithGoogle() {
    // No pedir el año antes de OAuth: así las cuentas existentes pueden entrar
    // sin un prompt innecesario. Si falta el dato, handleProfile lo solicita al volver.
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

// Cambia el formulario entre modo "Iniciar Sesión" y modo "Registrarse".
export function toggleAuthMode(e) {
    if (e) e.preventDefault();
    isRegisterMode = !isRegisterMode;

    const title = document.getElementById("authTitle");
    const usernameInput = document.getElementById("authUsername");
    const birthDateWrap = document.getElementById("authBirthDateWrap");
    const birthDateInput = document.getElementById("authBirthDate");
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
        if (birthDateWrap) birthDateWrap.style.display = "block";
        if (birthDateInput) birthDateInput.required = true;
        if (submitBtn) submitBtn.textContent = "REGISTRARSE";
        if (toggleText) toggleText.textContent = "¿Ya tienes cuenta?";
        if (toggleLink) toggleLink.textContent = "Iniciar Sesión";
    } else {
        if (title) title.textContent = "INICIAR SESIÓN";
        if (usernameInput) {
            usernameInput.style.display = "none";
            usernameInput.required = false;
        }
        if (birthDateWrap) birthDateWrap.style.display = "none";
        if (birthDateInput) { birthDateInput.required = false; birthDateInput.value = ""; }
        if (submitBtn) submitBtn.textContent = "ENTRAR";
        if (toggleText) toggleText.textContent = "¿No tienes cuenta?";
        if (toggleLink) toggleLink.textContent = "Registrarse";
    }
}

// Se dispara al enviar el formulario (login o registro según isRegisterMode).
export async function handleAuth(e) {
    e.preventDefault();

    const emailInput = document.getElementById("authEmail");
    const passwordInput = document.getElementById("authPassword");
    const usernameInput = document.getElementById("authUsername");
    const errorMsg = document.getElementById("authError");

    const email = emailInput ? emailInput.value : "";
    const password = passwordInput ? passwordInput.value : "";
    const username = usernameInput ? usernameInput.value.trim() : "";
    const birthDateInput = document.getElementById("authBirthDate");
    const birthDate = birthDateInput ? birthDateInput.value : "";

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
            if (!validarFechaNacimiento(birthDate)) {
                throw new Error("Ingresá una fecha de nacimiento válida.");
            }
            const ageGroup = calcularGrupoPorFecha(birthDate);
            const birthYear = Number(birthDate.slice(0, 4));
            if (ageGroup === "menor_13") {
                alert("Tu cuenta quedará en el grupo protegido para menores de 13 años. Algunas funciones comunitarias pueden estar limitadas.");
            }
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { username, birth_date: birthDate, birth_year: birthYear, age_group: ageGroup }, captchaToken }
            });
            if (error) throw error;
            alert("¡Registro enviado! Tu cuenta quedó clasificada según tu fecha de nacimiento. La clasificación pasará automáticamente a 13+ el día de tu cumpleaños número 13.");
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
        // Los tokens de Turnstile son de un solo uso.
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