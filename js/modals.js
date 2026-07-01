// =========================================================
// GAME MODAL
// =========================================================

// Agregamos "export" para que games.js y hero.js puedan usarlo
export function openGameModal(game) {
    try {
        const modal = document.getElementById("gameModal");

        if (!modal) return;

        document.getElementById("gameModalImg").src =
            game.cover || "assets/images/default.png";

        document.getElementById("gameModalTitle").textContent =
            game.name || "Juego";

        document.getElementById("gameModalAuthor").textContent =
            `Desarrollado por ${game.author || "Anónimo"}`;

        document.getElementById("gameModalDescription").textContent =
            game.description || "Sin descripción.";

        document.getElementById("gameModalStars").innerHTML =
            `⭐ ${game.stars || 0}`;

        document.getElementById("gameDownloadBtn").href =
            game.fileURL || "#";

        modal.classList.add("active");

    } catch (error) {
        console.error("Modal Error:", error);
    }
}

// Mantenemos la compatibilidad con el objeto window
window.openGameModal = openGameModal;

// =========================================================
// CLOSE GAME MODAL
// =========================================================

export function closeGameModal() {
    document
        .getElementById("gameModal")
        ?.classList.remove("active");
}

window.closeGameModal = closeGameModal;
