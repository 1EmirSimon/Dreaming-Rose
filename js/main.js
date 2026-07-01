import { startIntro } from "./loader.js";
import { showWebsite } from "./animations.js";
import { loadContent, setGames } from "./games.js";

import "./hero.js";

// preload
const preloadLogo = new Image();
preloadLogo.src =
    "assets/Icons/Channel_Profile_Dreaming_Rose.png";

// TEMP DATA (hasta MySQL)
const demoGames = [
    {
        name: "Meteor Fighters",
        author: "Dreaming Rose",
        stars: 999,
        cover: "assets/images/Meteor Fighters.png",
        fileURL: "#"
    }
];

setGames(demoGames);

window.addEventListener("load", () => {
    startIntro(loadContent, showWebsite);
});