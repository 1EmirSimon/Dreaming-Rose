export function initAnimations() {
    const elements = document.querySelectorAll(".reveal");

    if (elements.length) {
        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.1 }
        );

        elements.forEach(el => observer.observe(el));
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