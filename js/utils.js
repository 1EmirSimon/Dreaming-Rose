// js/utils.js
// Funciones de utilidad que se usan en varios módulos.

// Escapa caracteres peligrosos de HTML para evitar inyección (XSS).
// Se usa SIEMPRE que metemos datos de la base en un innerHTML.
// Ejemplo: username = '<img src=x onerror=alert(1)>' se convierte en
// texto plano y no se ejecuta.
export function escapeHTML(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}