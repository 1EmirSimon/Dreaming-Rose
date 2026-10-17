export function initAnimations() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = document.querySelectorAll(".reveal");
    const interactiveElements = document.querySelectorAll(
        ".project-card, .hub-container, .ranking-layout-box, .stat-item, .section-title"
    );

    if (!reduceMotion) {
        interactiveElements.forEach((el, index) => {
            el.classList.add("motion-reveal");
            el.style.transitionDelay = `${Math.min(index % 6, 5) * 70}ms`;
        });
    } else {
        interactiveElements.forEach(el => el.classList.add("is-visible"));
    }

    if (elements.length || (!reduceMotion && interactiveElements.length)) {
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("visible", "is-visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.1 }
        );

        elements.forEach(el => observer.observe(el));
        if (!reduceMotion) interactiveElements.forEach(el => observer.observe(el));
    }

    // Microinteracciones de tarjetas en escritorio. Sin parallax en pantallas táctiles.
    if (!reduceMotion && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        document.querySelectorAll(".project-card").forEach(card => {
            card.addEventListener("pointermove", event => {
                const rect = card.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                const y = (event.clientY - rect.top) / rect.height;
                card.style.setProperty("--pointer-x", `${x * 100}%`);
                card.style.setProperty("--pointer-y", `${y * 100}%`);
            });
            card.addEventListener("pointerleave", () => {
                card.style.removeProperty("--pointer-x");
                card.style.removeProperty("--pointer-y");
            });
        });
    }

    initNavbarScroll();
}

function initNavbarScroll() {
    const navbar = document.querySelector(".navbar");
    const progressBar = document.getElementById("scrollProgress");

    const toggle = () => {
        if (navbar) navbar.classList.toggle("scrolled", window.scrollY > 40);

        if (progressBar) {
            const scrollable = document.documentElement.scrollHeight - window.innerHeight;
            const progress = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
            progressBar.style.width = `${progress}%`;
        }
    };

    toggle();
    window.addEventListener("scroll", toggle, { passive: true });
}

export function showWebsite() {
    document.getElementById("loader")?.classList.add("hidden");
    document.body.classList.add("loaded");
    requestAnimationFrame(initAnimations);
}