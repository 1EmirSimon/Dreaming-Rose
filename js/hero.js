import {
    openGameModal
} from "./modals.js";

// Juego destacado
export function openMeteorHero() {

    openGameModal({

        name: "Meteor Fighters",

        author: "Dreaming Rose",

        description:
            "Enfréntate a dinosaurios y criaturas prehistóricas en intensas batallas. ¡Desata combos devastadores y domina el campo de batalla jurásico!",

        cover:
            "assets/images/Meteor Fighters.png",

        stars: 999,

        fileURL:
            "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing"

    });

}

// Compatibilidad HTML
window.openMeteorHero = openMeteorHero;