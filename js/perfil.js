import { supabase } from "./supabase.js";

const $ = id => document.getElementById(id);

// Las secciones no deben quedar invisibles si el observador no está disponible.
function initializeProfileAnimations() {
  const sections = document.querySelectorAll(".motion-reveal");
  if (!("IntersectionObserver" in window)) {
    sections.forEach(section => section.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.05 });
  sections.forEach(section => observer.observe(section));
}
initializeProfileAnimations();
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let currentUser = null;
let currentProfile = null;

function showBirthDateState() {
  const current = $("birthDateCurrent");
  const input = $("birthDateInput");
  const button = $("birthDateSave");
  const help = $("birthDateHelp");
  if (!currentProfile?.birth_date) {
    current.textContent = "Todavía no registrada";
  } else {
    current.textContent = new Date(`${currentProfile.birth_date}T12:00:00`).toLocaleDateString("es-AR", {day:"2-digit",month:"long",year:"numeric"});
    input.value = currentProfile.birth_date;
  }
  const used = Number(currentProfile?.birth_date_change_count || 0) >= 1;
  input.disabled = used;
  button.disabled = used;
  button.textContent = used ? "Cambio utilizado" : (currentProfile?.birth_date ? "Guardar único cambio" : "Guardar fecha");
  help.textContent = used
    ? "Ya utilizaste el único cambio permitido. La fecha no puede volver a modificarse."
    : "La fecha es privada. Si la corregís, solo podrás cambiarla una vez.";
}

async function init(){
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){
    $("profileNotice").classList.add("error");
    $("profileNotice").textContent="Iniciá sesión para ver tu perfil.";
    $("profileName").textContent="Mi perfil";
    $("profileMeta").textContent="Sesión no iniciada";
    $("birthDateCurrent").textContent="Iniciá sesión para ver este dato.";
    $("birthDateInput").disabled=true; $("birthDateSave").disabled=true;
    return;
  }
  currentUser=user;
  const {data:profile,error}=await supabase.from("usuarios")
    .select("username,role,created_at,birth_date,birth_date_change_count,age_group")
    .eq("id",user.id).single();
  if(error||!profile){
    $("profileNotice").classList.add("error");
    $("profileNotice").textContent="No se pudo cargar tu perfil. Si acabás de instalar la actualización, ejecutá la migración SQL de fecha de nacimiento.";
    $("birthDateCurrent").textContent="No disponible";
    $("birthDateInput").disabled=true; $("birthDateSave").disabled=true;
    return;
  }
  currentProfile=profile;
  const role=String(profile.role||"usuario").toLowerCase();
  $("profileName").textContent="@"+(profile.username||"usuario");
  $("profileUsernameInput").value = profile.username || "";
  const ageGroup=profile.age_group==="menor_13"?"GRUPO PROTEGIDO":profile.age_group==="13_mas"?"13+": "SIN CLASIFICAR";
  $("profileMeta").textContent=`${role.toUpperCase()} · ${ageGroup} · ${user.email||"Correo no disponible"}`;
  $("profileNotice").textContent="Tu cuenta está cargada. Desde acá podés administrar tus favoritos y la configuración.";
  showBirthDateState();
  if(["creador","moderador","root"].includes(role)) $("profileDashboardLink").hidden=false;
  if(["moderador","root"].includes(role)) $("profileModerationLink").hidden=false;
  const {data:likes,error:likesError}=await supabase.from("likes_juegos").select("juego_id").eq("user_id",user.id);
  if(likesError){$("favoriteGames").innerHTML='<p class="muted">No se pudieron cargar los favoritos. Revisá las políticas de lectura de likes_juegos.</p>';return;}
  const ids=[...new Set((likes||[]).map(x=>x.juego_id).filter(x=>x!==null))];
  if(!ids.length){$("favoriteGames").innerHTML='<p class="muted">Todavía no tenés juegos favoritos. Explorá el catálogo y marcá los juegos que te interesen.</p>';return;}
  const {data:games,error:gamesError}=await supabase.from("juegos").select("id,title,author,image_url,categoria,plataforma").in("id",ids);
  if(gamesError){$("favoriteGames").innerHTML='<p class="muted">No se pudieron cargar los datos de tus juegos favoritos.</p>';return;}
  $("favoriteGames").innerHTML=(games||[]).map(g=>`<article class="favorite-card"><img loading="lazy" src="${escapeHTML(g.image_url||'assets/images/Meteor Fighters.png')}" alt="Portada de ${escapeHTML(g.title)}"><div><strong>${escapeHTML(g.title)}</strong><small>${escapeHTML(g.categoria||"Sin categoría")} · ${escapeHTML(g.plataforma||"PC")}</small></div><a href="juegos.html">Ver catálogo</a></article>`).join("")||'<p class="muted">No hay favoritos disponibles para mostrar.</p>';
}

$("profileUsernameSave").addEventListener("click", async () => {
  if (!currentUser || !currentProfile) return;
  const input = $("profileUsernameInput");
  const help = $("profileUsernameHelp");
  const button = $("profileUsernameSave");
  const next = (input.value || "").trim();
  if (!/^[a-zA-Z0-9_-]{3,20}$/.test(next)) {
    help.textContent = "Usá entre 3 y 20 caracteres: letras, números, guion o guion bajo.";
    return;
  }
  if (next.toLowerCase() === String(currentProfile.username || "").toLowerCase()) {
    help.textContent = "Ese ya es tu nombre de usuario.";
    return;
  }
  button.disabled = true;
  button.textContent = "Guardando…";
  help.textContent = "";
  try {
    const { data: existing, error: lookupError } = await supabase
      .from("usuarios").select("id").ilike("username", next)
      .neq("id", currentUser.id).limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) {
      help.textContent = "Ese nombre ya está en uso. Probá con otro.";
      return;
    }
    const { error: updateError } = await supabase.from("usuarios")
      .update({ username: next }).eq("id", currentUser.id);
    if (updateError) throw updateError;
    const { error: metadataError } = await supabase.auth.updateUser({ data: { username: next } });
    if (metadataError) console.warn("No se pudo sincronizar el nombre en metadatos:", metadataError);
    currentProfile.username = next;
    $("profileName").textContent = "@" + next;
    help.textContent = "Nombre de usuario actualizado.";
    $("profileNotice").textContent = "Tu nombre de usuario se actualizó correctamente.";
  } catch (error) {
    console.error("Error al actualizar nombre:", error);
    help.textContent = "No se pudo guardar el nombre. " + (error?.message || "");
  } finally {
    button.disabled = false;
    button.textContent = "Guardar nombre";
  }
});

$("birthDateSave").addEventListener("click", async () => {
  if (!currentUser || !currentProfile) return;
  const input=$("birthDateInput");
  const nextDate=input.value;
  if (!nextDate) { $("birthDateHelp").textContent="Elegí una fecha válida."; return; }
  if (currentProfile.birth_date_change_count >= 1) { showBirthDateState(); return; }
  if (nextDate === currentProfile.birth_date) {
    $("birthDateHelp").textContent="La fecha es igual a la actual; no se consumió el cambio.";
    return;
  }
  const confirmed=window.confirm("¿Querés guardar esta fecha? Solo podés corregirla una vez después del registro.");
  if (!confirmed) return;
  $("birthDateSave").disabled=true;
  $("birthDateSave").textContent="Guardando…";
  const {data,error}=await supabase.rpc("actualizar_fecha_nacimiento", {p_fecha: nextDate});
  if (error || !data?.ok) {
    $("birthDateHelp").textContent=error?.message || data?.message || "No se pudo guardar la fecha. Puede que ya hayas usado tu cambio.";
    showBirthDateState();
    return;
  }
  const {data:profile,error:profileError}=await supabase.from("usuarios")
    .select("username,role,created_at,birth_date,birth_date_change_count,age_group")
    .eq("id",currentUser.id).single();
  if (profileError || !profile) {
    $("birthDateHelp").textContent="La fecha se guardó, pero no pudimos actualizar la vista. Recargá el perfil.";
    return;
  }
  currentProfile=profile;
  showBirthDateState();
  const ageGroup=profile.age_group==="menor_13"?"GRUPO PROTEGIDO":profile.age_group==="13_mas"?"13+": "SIN CLASIFICAR";
  $("profileMeta").textContent=`${String(profile.role||"usuario").toUpperCase()} · ${ageGroup} · ${currentUser.email||"Correo no disponible"}`;
  $("profileNotice").textContent="Fecha de nacimiento actualizada. El cambio permitido quedó registrado.";
});

$("profileLogout").addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error){alert("No se pudo cerrar sesión: "+error.message);return;}window.location.href="index.html";});
await init();
