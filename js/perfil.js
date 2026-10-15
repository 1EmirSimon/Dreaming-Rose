import { supabase } from "./supabase.js";
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function init(){
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user){$("profileNotice").classList.add("error");$("profileNotice").textContent="Iniciá sesión para ver tu perfil.";$("profileName").textContent="Mi perfil";$("profileMeta").textContent="Sesión no iniciada";return;}
  const {data:profile,error}=await supabase.from("usuarios").select("username,role,created_at").eq("id",user.id).single();
  if(error||!profile){$("profileNotice").classList.add("error");$("profileNotice").textContent="No se pudo cargar tu perfil. Revisá los permisos de lectura de la tabla usuarios.";return;}
  const role=String(profile.role||"usuario").toLowerCase();
  $("profileName").textContent="@"+(profile.username||"usuario");
  $("profileMeta").textContent=`${role.toUpperCase()} · ${user.email||"Correo no disponible"}`;
  $("profileNotice").textContent="Tu cuenta está cargada. Desde acá podés administrar tus favoritos y la configuración.";
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
$("profileLogout").addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error){alert("No se pudo cerrar sesión: "+error.message);return;}window.location.href="index.html";});
await init();
