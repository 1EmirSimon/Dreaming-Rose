// js/hero.js
export function openMeteorHero() {
    if (typeof window.openGameDetails === "function") {
        // Abre el modal buscando el juego por su título exacto en la base de datos
        window.openGameDetails("Meteor Fighters");
    } else {
        window.open("https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing", "_blank");
    }
}

window.openMeteorHero = openMeteorHero;