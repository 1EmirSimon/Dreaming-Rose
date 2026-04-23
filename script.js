import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCvr0YPomu92BxAeG4bgb5aaPiHdotujOo",
    authDomain: "dreaming-rose-a230a.firebaseapp.com",
    projectId: "dreaming-rose-a230a",
    storageBucket: "dreaming-rose-a230a.appspot.com",
    messagingSenderId: "183947597220",
    appId: "1:183947597220:web:f288dd33b98024f6bc1d31"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- LÓGICA DE LA INTRO ---
function startIntro() {
    let progress = 0;
    const bar = document.getElementById("progress-bar");
    const txt = document.getElementById("loading-text");
    const loader = document.getElementById("loader");

    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 6) + 1;
        if (progress > 100) progress = 100;
        bar.style.width = progress + "%";
        txt.innerText = `Cargando Dreaming Rose... ${progress}%`;

        if (progress === 100) {
            clearInterval(interval);
            setTimeout(() => {
                loader.style.opacity = "0";
                setTimeout(() => {
                    loader.style.display = "none";
                    initAnimations();
                    loadContent();
                }, 600);
            }, 400);
        }
    }, 40);
}

// --- ANIMACIÓN DE SCROLL ---
function initAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// --- CARGA DE FIREBASE ---
async function loadContent() {
    try {
        const querySnapshot = await getDocs(collection(db, "games"));
        const communityGrid = document.getElementById("community-games");
        const rankingList = document.getElementById("ranking-list");

        let games = [];
        querySnapshot.forEach(doc => games.push(doc.data()));

        if (games.length > 0) {
            // Ranking
            const ranked = [...games].sort((a, b) => (b.stars || 0) - (a.stars || 0)).slice(0, 3);
            rankingList.innerHTML = ranked.map((g, i) => `
                <div class="ranking-item">
                    <span><b>#${i+1}</b> ${g.name}</span>
                    <span style="color:#00fff7">⭐ ${g.stars || 0}</span>
                </div>
            `).join('');

            // Grid
            communityGrid.innerHTML = games.map(g => `
                <a href="${g.fileURL}" target="_blank" class="game-link">
                    <article class="game-card">
                        <img src="${g.cover || 'assets/images/default.png'}" alt="${g.name}">
                        <div class="card-info">
                            <h3>${g.name}</h3>
                            <span>Por ${g.author}</span>
                        </div>
                    </article>
                </a>
            `).join('');
        }
    } catch (e) {
        console.error("Error Firebase:", e);
    }
}

// --- MODAL ---
window.openUpload = () => {
    const m = document.getElementById("uploadModal");
    m.classList.add("active");
}
window.closeUpload = () => {
    const m = document.getElementById("uploadModal");
    m.classList.remove("active");
}

window.onload = startIntro;