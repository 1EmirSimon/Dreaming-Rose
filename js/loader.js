export function startIntro(loadContent, showWebsite) {
    const loader = document.getElementById("loader");
    const progressBar = document.getElementById("progress-bar");
    const loadingText = document.getElementById("loading-text");

    if (!loader || !progressBar || !loadingText) {
        showWebsite();
        return;
    }

    const messages = [
        "BOOTING SYSTEM...",
        "LOADING ASSETS...",
        "CONNECTING...",
        "SYNCING COMMUNITY...",
        "READY..."
    ];

    let progress = 0;
    let msgIndex = 0;

    const interval = setInterval(() => {
        progress += 10;
        if (progress > 100) progress = 100;

        progressBar.style.width = progress + "%";
        loadingText.textContent = `${messages[msgIndex]} ${Math.floor(progress)}%`;

        if (progress >= (msgIndex + 1) * 20 && msgIndex < messages.length - 1) {
            msgIndex++;
        }

        if (progress >= 100) {
            clearInterval(interval);
            loadingText.textContent = "READY";
            Promise.resolve(loadContent())
                .catch(console.error)
                .finally(showWebsite);
        }
    }, 60);
}