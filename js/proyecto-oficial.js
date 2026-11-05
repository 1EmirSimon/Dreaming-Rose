// js/proyecto-oficial.js
import { supabase } from "./supabase.js";
import { escapeHTML } from "./utils.js";

window.openProyectoOficial = async function() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        alert("Tenés que iniciar sesión.");
        return;
    }

    const { data: perfil } = await supabase
        .from('usuarios')
        .select('role')
        .eq('id', user.id)
        .single();

    const rol = (perfil?.role || '').toLowerCase();
    if (!['moderador', 'root'].includes(rol)) {
        alert("❌ Solo moderadores y root pueden agregar proyectos oficiales.");
        return;
    }

    const modal = document.getElementById("proyectoOficialModal");
    if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }
};

window.closeProyectoOficial = function() {
    const modal = document.getElementById("proyectoOficialModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "auto";
    }
};

window.handlePublishProyectoOficial = async function(event) {
    event.preventDefault();

    const errorMsg = document.getElementById("proyectoError");
    if (errorMsg) errorMsg.style.display = "none";

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const title = document.getElementById("proyTitle")?.value.trim();
    const description = document.getElementById("proyDescription")?.value.trim();
    const author = document.getElementById("proyAuthor")?.value.trim() || "Dreaming Rose";
    const genre = document.getElementById("proyGenre")?.value.trim() || "";
    const imageFileInput = document.getElementById("proyImageFile");
    const downloadUrlPC = document.getElementById("proyDownloadUrlPC")?.value.trim() || "";
    const downloadUrlMobile = document.getElementById("proyDownloadUrlMobile")?.value.trim() || "";
    const validPortUrl = value => { if (!value) return true; try { const u = new URL(value); return u.protocol === "https:" && ["drive.google.com", "mediafire.com"].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)); } catch { return false; } };

    if (!title || !description || (!downloadUrlPC && !downloadUrlMobile) || !validPortUrl(downloadUrlPC) || !validPortUrl(downloadUrlMobile)) {
        if (errorMsg) {
            errorMsg.textContent = "⚠️ Completá todos los campos obligatorios.";
            errorMsg.style.display = "block";
        }
        return;
    }

    let finalImageUrl = "assets/images/Meteor Fighters.png";

    if (imageFileInput && imageFileInput.files && imageFileInput.files[0]) {
        let file = imageFileInput.files[0];

        try {
            if (typeof window.imageCompression === "function") {
                const comprimida = await window.imageCompression(file, {
                    maxSizeMB: 0.3,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                    fileType: 'image/webp',
                    initialQuality: 0.82,
                });
                file = new File([comprimida], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
            }
        } catch (err) {
            console.error("Error comprimiendo:", err);
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `proy_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('portadas')
            .upload(fileName, file, { contentType: file.type, cacheControl: '31536000' });

        if (uploadError) {
            console.error("Error subiendo imagen:", uploadError);
            if (errorMsg) {
                errorMsg.textContent = "Error al subir la imagen: " + uploadError.message;
                errorMsg.style.display = "block";
            }
            return;
        }

        const { data: publicURLData } = supabase.storage.from('portadas').getPublicUrl(fileName);
        finalImageUrl = publicURLData.publicUrl;
    }

    const { error } = await supabase.from('juegos').insert([{
        title,
        description: genre ? `${genre} — ${description}` : description,
        author,
        image_url: finalImageUrl,
        download_url: downloadUrlPC || downloadUrlMobile,
        download_url_pc: downloadUrlPC || null,
        download_url_mobile: downloadUrlMobile || null,
        plataforma: downloadUrlPC ? "PC" : "Móvil",
        likes_count: 0,
        views_count: 0,
        playing_count: 0,
        user_id: user.id,
        es_proyecto_oficial: true,
        verificado: true,
        verificado_at: new Date().toISOString(),
        verificado_motivo: "Proyecto oficial de Dreaming Rose"
    }]);

    if (error) {
        console.error("Error publicando proyecto oficial:", error);
        if (errorMsg) {
            errorMsg.textContent = "Error al publicar: " + error.message;
            errorMsg.style.display = "block";
        }
        return;
    }

    alert("✅ Proyecto agregado.");
    document.getElementById("proyectoOficialForm")?.reset();
    window.closeProyectoOficial();
    if (typeof window.cargarProyectosOficiales === "function") {
        await window.cargarProyectosOficiales();
    }
};