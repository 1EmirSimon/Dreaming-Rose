// Iniciar animaciones
export function initAnimations() {

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

// Mostrar web
export function showWebsite() {

    document
        .getElementById("loader")
        ?.classList.add("hidden");

    document.body.classList.add("loaded");

    requestAnimationFrame(
        initAnimations
    );
}