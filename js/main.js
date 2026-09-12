import { startIntro } from "./loader.js";
import { showWebsite } from "./animations.js";
import { initGames } from "./games.js";
import { initAuth } from "./auth.js";
import { waitForLaunch } from "./launch.js";
import "./hero.js";
import "./admin.js"; // Se importa el panel de administración

initAuth();

const preloadLogo = new Image();
preloadLogo.src = "assets/Icons/Channel_Profile_Dreaming_Rose.png";

window.addEventListener("load", () => {
    waitForLaunch().then(() => {
        startIntro(initGames, showWebsite);
    });
});