// js/mobile-menu.js
// Menú hamburguesa para mobile.

const MOBILE_BREAKPOINT = 1200;

window.toggleMobileMenu = function() {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("hamburgerBtn");
    if (!menu || !btn) return;

    const isOpen = menu.classList.contains("open");

    if (isOpen) {
        closeMobileMenu();
    } else {
        menu.classList.add("open");
        btn.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
        btn.setAttribute("aria-label", "Cerrar menú");
        document.documentElement.style.overflow = "hidden";
        document.body.style.overflow = "hidden";
    }
};

window.closeMobileMenu = function() {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("hamburgerBtn");
    if (!menu || !btn) return;

    menu.classList.remove("open");
    btn.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", "Abrir menú");

    // No desbloquear el documento si hay otro modal abierto.
    const hayModalAbierto = document.querySelector(".modal-overlay.active");
    if (!hayModalAbierto) {
        document.documentElement.style.overflow = "";
        document.body.style.overflow = "";
    }
};

// Se llama desde auth.js cada vez que cambia el estado de sesión.
// Muestra/oculta los botones de la sección "Mi cuenta" según el rol.
export function actualizarMenuMobile(user, profile) {
    const section = document.getElementById("mobileMenuUserSection");
    const guestSection = document.getElementById("mobileMenuGuestSection");
    const btnPublish = document.getElementById("mobileBtnPublish");
    const btnAdmin = document.getElementById("mobileBtnAdmin");
    const btnSolicitar = document.getElementById("mobileBtnSolicitar");

    if (!section || !guestSection) return;

    if (user && profile) {
        // Hay sesión
        section.style.display = "flex";
        guestSection.style.display = "none";

        const rol = (profile.role || 'usuario').toLowerCase();
        const btnDashboard = document.getElementById("mobileBtnCreatorDashboard");
        if (btnDashboard) btnDashboard.style.display = ['creador', 'moderador', 'root'].includes(rol) ? "flex" : "none";

        // Publicar: creador, moderador, root
        if (btnPublish) {
            btnPublish.style.display = ['creador', 'moderador', 'root'].includes(rol) ? "flex" : "none";
        }

        // Panel admin: moderador, root
        if (btnAdmin) {
            btnAdmin.style.display = ['moderador', 'root'].includes(rol) ? "flex" : "none";
        }

        // Solicitar ser creador: solo usuario común
        if (btnSolicitar) {
            btnSolicitar.style.display = rol === 'usuario' ? "flex" : "none";
        }
    } else {
        // No hay sesión
        section.style.display = "none";
        guestSection.style.display = "flex";
        const btnDashboard = document.getElementById("mobileBtnCreatorDashboard");
        if (btnDashboard) btnDashboard.style.display = "none";
    }
}

// Cerrar el menú con ESC
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeMobileMenu();
    }
});

// Cerrar el menú si el usuario rota el celular o agranda la ventana
window.addEventListener("resize", () => {
    if (window.innerWidth > MOBILE_BREAKPOINT) {
        closeMobileMenu();
    }
});

window.actualizarMenuMobile = actualizarMenuMobile;