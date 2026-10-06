// js/mobile-menu.js
// Menú hamburguesa para mobile.

const MOBILE_BREAKPOINT = 900;

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
        document.body.style.overflow = "hidden";
    }
};

window.closeMobileMenu = function() {
    const menu = document.getElementById("mobileMenu");
    const btn = document.getElementById("hamburgerBtn");
    if (!menu || !btn) return;

    menu.classList.remove("open");
    btn.classList.remove("open");

    // Solo restauramos el scroll si NO hay otro modal abierto
    const hayModalAbierto = document.querySelector(".modal-overlay.active");
    if (!hayModalAbierto) {
        document.body.style.overflow = "auto";
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