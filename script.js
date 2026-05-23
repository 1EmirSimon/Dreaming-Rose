// FIREBASE
import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {

    apiKey:
        "AIzaSyCvr0YPomu92BxAeG4bgb5aaPiHdotujOo",

    authDomain:
        "dreaming-rose-a230a.firebaseapp.com",

    projectId:
        "dreaming-rose-a230a",

    storageBucket:
        "dreaming-rose-a230a.appspot.com",

    messagingSenderId:
        "183947597220",

    appId:
        "1:183947597220:web:f288dd33b98024f6bc1d31"

};

// =========================================================
// INIT FIREBASE
// =========================================================

let db = null;

try {

    const app =
        initializeApp(firebaseConfig);

    db =
        getFirestore(app);

    console.log("Firebase Connected");

} catch (error) {

    console.error(
        "Firebase Init Error:",
        error
    );

}

// ==========
// LOADER SYSTEM
// ==========

function startIntro() {

    const loader =
        document.getElementById("loader");
    const progressBar =
        document.getElementById("progress-bar");
    const loadingText =
        document.getElementById("loading-text");
    // SI FALTA ALGO DEL DOM

    if (
        !loader ||
        !progressBar ||
        !loadingText
    ) {

        console.error(
            "Loader elements missing"
        );
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

    const interval = setInterval(async () => {

        progress += 1;

        // LIMITE

        if (progress > 100)
            progress = 100;

        // UPDATE BAR

        progressBar.style.width =
            progress + "%";

        // UPDATE TEXT

        loadingText.innerText =
            `${messages[msgIndex]} ${progress}%`;

        // CHANGE MESSAGE

        if (
            progress >= (msgIndex + 1) * 18 &&
            msgIndex < messages.length - 1
        ) {

            msgIndex++;

        }

        // COMPLETE

        if (progress >= 100) {

            clearInterval(interval);

            loadingText.innerText =
                "SYSTEM READY";

            // WAIT SMALL DELAY

            setTimeout(async () => {

                try {

                    await loadContent();

                } catch (e) {

                    console.error(
                        "Load Error:",
                        e
                    );

                }

                showWebsite();

            }, 700);

        }

    }, 35);

}

// =========================================================
// SHOW WEBSITE
// =========================================================

function showWebsite() {

    const loader =
        document.getElementById("loader");

    if (loader) {

        loader.classList.add("hidden");

    }

    document.body.classList.add("loaded");

    initAnimations();

}

// =========================================================
// SCROLL ANIMATIONS
// =========================================================

function initAnimations() {

    const elements =
        document.querySelectorAll(".reveal");

    if (!elements.length)
        return;

    const observer =
        new IntersectionObserver(

            (entries) => {

                entries.forEach(entry => {

                    if (entry.isIntersecting) {

                        entry.target.classList.add(
                            "visible"
                        );

                    }

                });

            },

            {
                threshold: 0.1
            }

        );

    elements.forEach(el => {

        observer.observe(el);

    });

}

// =========================================================
// LOAD FIREBASE CONTENT
// =========================================================

async function loadContent() {

    // SI FIREBASE NO EXISTE

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

        // SI NO EXISTEN ELEMENTOS

        if (
            !communityGrid ||
            !rankingList
        ) {

            console.warn(
                "HTML containers missing"
            );

            return;

        }

        let games = [];

        querySnapshot.forEach(doc => {

            games.push(doc.data());

        });

        // =================================================
        // NO GAMES
        // =================================================

        if (games.length === 0) {

            communityGrid.innerHTML = `

                <p style="
                    color:#888;
                    font-size:1rem;
                ">

                    No hay juegos publicados todavía.

                </p>

            `;

            rankingList.innerHTML = `

                <p style="
                    color:#888;
                ">

                    Sin ranking disponible.

                </p>

            `;

            return;

        }

        // =================================================
        // RANKING
        // =================================================

        const ranked = [...games]

            .sort((a, b) =>
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

            `).join('');

        // =================================================
        // GAME CARDS
        // =================================================

        communityGrid.innerHTML =
            games.map(g => `

                <article
                    class="game-card"
                    onclick='openGameModal(${JSON.stringify(g)})'
                >

                    <img
                        src="${
                            g.cover ||
                            "assets/images/default.png"
                        }"

                        alt="${
                            g.name || "Game"
                        }"
                    >

                    <div class="card-info">

                        <h3>

                            ${
                                g.name || "Unknown Game"
                            }

                        </h3>

                        <span>

                            Por
                            ${
                                g.author || "Anónimo"
                            }

                        </span>

                    </div>

                </article>

            `).join('');

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

        // IMAGE

        document.getElementById(
            "gameModalImg"
        ).src =
            game.cover ||
            "assets/images/default.png";

        // TITLE

        document.getElementById(
            "gameModalTitle"
        ).innerText =
            game.name || "Juego";

        // AUTHOR

        document.getElementById(
            "gameModalAuthor"
        ).innerText =
            `Desarrollado por ${
                game.author || "Anónimo"
            }`;

        // DESCRIPTION

        document.getElementById(
            "gameModalDescription"
        ).innerText =
            game.description ||
            "Sin descripción.";

        // STARS

        document.getElementById(
            "gameModalStars"
        ).innerHTML =
            `⭐ ${game.stars || 0}`;

        // DOWNLOAD

        document.getElementById(
            "gameDownloadBtn"
        ).href =
            game.fileURL || "#";

        // OPEN

        modal.classList.add("active");

    } catch (error) {

        console.error(
            "Modal Error:",
            error
        );

    }

};

// =============================
// CLOSE GAME MODAL
// =============================

window.closeGameModal = () => {

    const modal =
        document.getElementById(
            "gameModal"
        );

    if (modal) {

        modal.classList.remove(
            "active"
        );

    }

};

// =========================================================
// UPLOAD MODAL
// =========================================================

window.openUpload = () => {

    const modal =
        document.getElementById(
            "uploadModal"
        );

    if (modal) {

        modal.classList.add(
            "active"
        );

    }

};

window.closeUpload = () => {

    const modal =
        document.getElementById(
            "uploadModal"
        );

    if (modal) {

        modal.classList.remove(
            "active"
        );

    }

};

// =========================================================
// CLOSE MODAL CLICK OUTSIDE
// =========================================================

window.addEventListener("click", (e) => {

    const gameModal =
        document.getElementById(
            "gameModal"
        );

    const uploadModal =
        document.getElementById(
            "uploadModal"
        );

    if (e.target === gameModal) {

        gameModal.classList.remove(
            "active"
        );

    }

    if (e.target === uploadModal) {

        uploadModal.classList.remove(
            "active"
        );

    }

});

window.onload = () => {

    startIntro();

};