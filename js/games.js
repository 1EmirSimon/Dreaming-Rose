import { openGameModal } from "./modals.js";

// Estado local (evita variable global rota)
let games = [];

// Setter para cuando cargues backend después
export function setGames(data) {
    games = Array.isArray(data) ? data : [];
}

// Cargar contenido
export async function loadContent() {

    renderRanking();
    renderGames();

}

// Ranking
function renderRanking() {

    const rankingList =
        document.getElementById("ranking-list");

    if (!rankingList) return;

    const ranked = [...games]
        .sort((a, b) => (b.stars || 0) - (a.stars || 0))
        .slice(0, 5);

    rankingList.innerHTML = ranked.length
        ? ranked.map((g, i) => `
            <div class="ranking-item">
                <span>#${i + 1} ${g.name ?? "Sin nombre"}</span>
                <span style="color:#00fff7">⭐ ${g.stars ?? 0}</span>
            </div>
        `).join("")
        : `<p style="color:#888">Sin ranking</p>`;
}

// Juegos comunidad
function renderGames() {

    const communityGrid =
        document.getElementById("community-games");

    if (!communityGrid) return;

    if (!games.length) {
        communityGrid.innerHTML =
            `<p style="color:#888">No hay juegos</p>`;
        return;
    }

    communityGrid.innerHTML =
        games.map((g, index) => `

        <article class="game-card" data-index="${index}">

            <img
                src="${g.cover ?? 'assets/images/default.png'}"
                alt="${g.name ?? 'Game'}"
            >

            <div class="card-info">

                <h3>${g.name ?? "Sin nombre"}</h3>

                <span>Por ${g.author ?? "Anónimo"}</span>

            </div>

        </article>

    `).join("");

    document.querySelectorAll(".game-card")
        .forEach(card => {

            card.addEventListener("click", () => {

                const index = Number(card.dataset.index);

                if (!games[index]) return;

                openGameModal(games[index]);

            });

        });

}