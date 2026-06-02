// FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCvr0YPomu92BxAeG4bgb5aaPiHdotujOo",
    authDomain: "dreaming-rose-a230a.firebaseapp.com",
    projectId: "dreaming-rose-a230a",
    storageBucket: "dreaming-rose-a230a.appspot.com",
    messagingSenderId: "183947597220",
    appId: "1:183947597220:web:f288dd33b98024f6bc1d31"
};

let db = null;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase Connected");
} catch (error) {
    console.error("Firebase Init Error:", error);
}

// PRELOAD LOGO
const preloadLogo = new Image();
preloadLogo.src =
    "assets/Icons/Channel_Profile_Dreaming_Rose.png";

// =========================================================
// LOADER
// =========================================================

function startIntro() {

    const loader =
        document.getElementById("loader");

    const progressBar =
        document.getElementById("progress-bar");

    const loadingText =
        document.getElementById("loading-text");

    if (!loader || !progressBar || !loadingText) {
        showWebsite();
        return;
    }

    const messages = [
        "BOOTING SYSTEM...",
        "LOADING ASSETS...",
        "CONNECTING DATABASE...",
        "SYNCING COMMUNITY...",
        "INITIALIZING HUB...",
        "WELCOME TO DREAMING ROSE"
    ];

    let progress = 0;
    let msgIndex = 0;

    const interval = setInterval(() => {

        progress += 12.5;

        if (progress > 100)
            progress = 100;

        progressBar.style.width =
            progress + "%";

        loadingText.textContent =
            `${messages[msgIndex]} ${Math.floor(progress)}%`;

        if (
            progress >= (msgIndex + 1) * 18 &&
            msgIndex < messages.length - 1
        ) {
            msgIndex++;
        }

        if (progress >= 100) {

            clearInterval(interval);

            loadingText.textContent =
                "SYSTEM READY";

            loadContent()
                .catch(console.error)
                .finally(showWebsite);
        }

    }, 70);
}

// =========================================================
// SHOW WEBSITE
// =========================================================

function showWebsite() {

    document
        .getElementById("loader")
        ?.classList.add("hidden");

    document.body.classList.add("loaded");

    requestAnimationFrame(
        initAnimations
    );
}

// =========================================================
// ANIMATIONS
// =========================================================

function initAnimations() {

    const elements =
        document.querySelectorAll(".reveal");

    if (!elements.length)
        return;

    const observer =
        new IntersectionObserver(

            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting)
                        return;

                    entry.target.classList.add(
                        "visible"
                    );

                    observer.unobserve(
                        entry.target
                    );

                });

            },

            {
                threshold: 0.1
            }

        );

    elements.forEach(el =>
        observer.observe(el)
    );
}

// =========================================================
// FIRESTORE CONTENT
// =========================================================

async function loadContent() {

    if (!db) {
        console.warn(
            "Firestore unavailable"
        );
        return;
    }

    try {

        const querySnapshot =
            await getDocs(
                collection(db, "games")
            );

        const communityGrid =
            document.getElementById(
                "community-games"
            );

        const rankingList =
            document.getElementById(
                "ranking-list"
            );

        if (
            !communityGrid ||
            !rankingList
        ) {

            console.warn(
                "HTML containers missing"
            );

            return;
        }

        const games =
            querySnapshot.docs.map(
                doc => doc.data()
            );

        // =====================================
        // NO GAMES
        // =====================================

        if (games.length === 0) {

            communityGrid.innerHTML = `
                <p style="color:#888;font-size:1rem;">
                    No hay juegos publicados todavía.
                </p>
            `;

            rankingList.innerHTML = `
                <p style="color:#888;">
                    Sin ranking disponible.
                </p>
            `;

            return;
        }

        // =====================================
        // RANKING
        // =====================================

        const ranked = [...games]
            .sort(
                (a, b) =>
                    (b.stars || 0) -
                    (a.stars || 0)
            )
            .slice(0, 5);

        rankingList.innerHTML =
            ranked.map((g, i) => `

                <div class="ranking-item">

                    <span>
                        #${i + 1}
                        ${g.name || "Unknown"}
                    </span>

                    <span style="color:#00fff7">
                        ⭐ ${g.stars || 0}
                    </span>

                </div>

            `).join("");

        // =====================================
        // GAME CARDS
        // =====================================

        communityGrid.innerHTML =
            games.map((g, index) => `

                <article
                    class="game-card"
                    data-index="${index}"
                >

                    <img
                        src="${g.cover || "assets/images/default.png"}"
                        alt="${g.name || "Game"}"
                    >

                    <div class="card-info">

                        <h3>
                            ${g.name || "Unknown Game"}
                        </h3>

                        <span>
                            Por ${g.author || "Anónimo"}
                        </span>

                    </div>

                </article>

            `).join("");

        // Eventos de click

        document
            .querySelectorAll(".game-card")
            .forEach(card => {

                card.addEventListener(
                    "click",
                    () => {

                        const index =
                            parseInt(
                                card.dataset.index
                            );

                        openGameModal(
                            games[index]
                        );

                    }
                );

            });

    } catch (error) {

        console.error(
            "Firestore Load Error:",
            error
        );

    }
}

// =========================================================
// GAME MODAL
// =========================================================

window.openGameModal = (game) => {

    try {

        const modal =
            document.getElementById(
                "gameModal"
            );

        if (!modal)
            return;

        document.getElementById(
            "gameModalImg"
        ).src =
            game.cover ||
            "assets/images/default.png";

        document.getElementById(
            "gameModalTitle"
        ).textContent =
            game.name || "Juego";

        document.getElementById(
            "gameModalAuthor"
        ).textContent =
            `Desarrollado por ${
                game.author || "Anónimo"
            }`;

        document.getElementById(
            "gameModalDescription"
        ).textContent =
            game.description ||
            "Sin descripción.";

        document.getElementById(
            "gameModalStars"
        ).innerHTML =
            `⭐ ${game.stars || 0}`;

        document.getElementById(
            "gameDownloadBtn"
        ).href =
            game.fileURL || "#";

        modal.classList.add(
            "active"
        );

    } catch (error) {

        console.error(
            "Modal Error:",
            error
        );

    }

};

// =========================================================
// CLOSE GAME MODAL
// =========================================================

window.closeGameModal = () => {

    document
        .getElementById("gameModal")
        ?.classList.remove("active");

};

// =========================================================
// UPLOAD MODAL
// =========================================================

window.openUpload = () => {

    document
        .getElementById("uploadModal")
        ?.classList.add("active");

};

window.closeUpload = () => {

    document
        .getElementById("uploadModal")
        ?.classList.remove("active");

};

// =========================================================
// CLOSE MODALS OUTSIDE CLICK
// =========================================================

window.addEventListener(
    "click",
    e => {

        const gameModal =
            document.getElementById(
                "gameModal"
            );

        const uploadModal =
            document.getElementById(
                "uploadModal"
            );

        if (e.target === gameModal)
            gameModal.classList.remove(
                "active"
            );

        if (e.target === uploadModal)
            uploadModal.classList.remove(
                "active"
            );

    }
);

// =========================================================
// HERO GAME
// =========================================================

window.openMeteorHero = () => {

    openGameModal({

        name:
            "Meteor Fighters",

        author:
            "Dreaming Rose",

        description:
            "Enfréntate a dinosaurios y criaturas prehistóricas en intensas batallas. ¡Desata combos devastadores y domina el campo de batalla jurásico!",

        cover:
            "assets/images/Meteor Fighters.png",

        stars:
            999,

        fileURL:
            "https://drive.google.com/drive/folders/1lfdN5JWkNyDRUOx4O1VFtJYEO3SURPXE?usp=sharing"

    });

};

// =========================================================
// START
// =========================================================

window.addEventListener(
    "load",
    startIntro
);