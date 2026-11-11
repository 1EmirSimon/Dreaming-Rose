import { supabase } from "./supabase.js";
const CATEGORIES=["Acción y lucha","Aventura y RPG","Plataformas","Carreras","Estrategia","Puzzle y lógica","Terror","Simulación","Deportes","Casual","Otro"];
let games=[];let selectedCategory="Todas";
const esc=(v="")=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c]));
const safeUrl=(value)=>{try{const u=new URL(value);if(u.protocol!=="https:")return null;const h=u.hostname.toLowerCase();return ["drive.google.com","mediafire.com"].some(x=>h===x||h.endsWith("."+x))?u.href:null}catch{return null}};
const ports=g=>{const legacyMobile=String(g.plataforma||"").toLowerCase().includes("móvil")||String(g.plataforma||"").toLowerCase().includes("movil");return{pc:safeUrl(g.download_url_pc)||(!g.download_url_mobile&&!legacyMobile?safeUrl(g.download_url):null),mobile:safeUrl(g.download_url_mobile)||(legacyMobile?safeUrl(g.download_url):null)}};
function reportButton(g){return `<button class="report-game-btn" type="button" data-report-game="${Number(g.id)}" data-report-title="${esc(g.title)}">⚑ REPORTAR JUEGO</button>`;}
function ensureReportDialog(){if(document.getElementById("gameReportDialog"))return;const d=document.createElement("dialog");d.id="gameReportDialog";d.className="game-report-dialog";d.innerHTML=`<form id="gameReportForm"><button type="button" class="report-close" aria-label="Cerrar">×</button><p class="eyebrow">SEGURIDAD DE LA COMUNIDAD</p><h2>Reportar publicación</h2><p id="reportGameTitle" class="report-game-title"></p><label for="reportReason">Motivo</label><select id="reportReason" required><option value="">Seleccioná un motivo</option><option value="contenido_inapropiado">Contenido inapropiado</option><option value="enlace_roto">Enlace de descarga roto</option><option value="archivo_sospechoso">Virus o archivo sospechoso</option><option value="descripcion_engañosa">Descripción engañosa</option><option value="spam">Spam o publicidad engañosa</option><option value="derechos_autor">Derechos de autor</option><option value="otro">Otro</option></select><label for="reportDetail">Explicación</label><textarea id="reportDetail" minlength="10" maxlength="1200" rows="5" placeholder="Contanos qué problema encontraste (mínimo 10 caracteres)." required></textarea><small id="reportDailyLimit">Máximo 3 reportes por día.</small><p id="reportFeedback" role="status"></p><button class="download" id="sendGameReport" type="submit">ENVIAR REPORTE</button></form>`;document.body.appendChild(d);d.querySelector('.report-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d)d.close()});d.querySelector('form').addEventListener('submit',sendGameReport);}
let reportGameId=null;
async function sendGameReport(e){
  e.preventDefault();
  const feedback=document.getElementById('reportFeedback');
  const button=document.getElementById('sendGameReport');
  if(button.disabled)return;
  button.disabled=true;
  feedback.textContent='Verificando sesión…';
  try{
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError)throw authError;
    if(!user){feedback.textContent='Iniciá sesión para enviar un reporte.';return;}
    feedback.textContent='Enviando…';
    const {data,error}=await supabase.rpc('enviar_reporte_juego',{
      p_juego_id:reportGameId,
      p_motivo:document.getElementById('reportReason').value,
      p_detalle:document.getElementById('reportDetail').value.trim()
    });
    if(error)throw error;
    feedback.textContent=`Reporte enviado. Te quedan ${data?.remaining_today??0} reportes disponibles hoy.`;
    document.getElementById('gameReportForm').reset();
    window.setTimeout(()=>document.getElementById('gameReportDialog')?.close(),1800);
  }catch(error){
    feedback.textContent=error.message||'No se pudo enviar el reporte. Intentá nuevamente.';
  }finally{
    button.disabled=false;
  }
}
function openReport(id,title){reportGameId=Number(id);ensureReportDialog();document.getElementById('reportGameTitle').textContent=title;document.getElementById('reportFeedback').textContent='';document.getElementById('gameReportDialog').showModal();}
document.addEventListener('click',e=>{const b=e.target.closest('[data-report-game]');if(b)openReport(b.dataset.reportGame,b.dataset.reportTitle||'Juego');});
function render(){const query=(document.getElementById("searchGames").value||"").trim().toLowerCase();const platform=document.getElementById("platformFilter").value;const age=document.getElementById("ageFilter").value;const visible=games.filter(g=>{const p=ports(g);const available=[p.pc?"PC":null,p.mobile?"Móvil":null].filter(Boolean);return(selectedCategory==="Todas"||g.categoria===selectedCategory)&&(!platform||available.includes(platform))&&(!age||g.clasificacion_edad===age)&&(`${g.title||""} ${g.author||""} ${g.description||""}`).toLowerCase().includes(query)});
const nav=document.getElementById("categoryNav");nav.innerHTML=["Todas",...CATEGORIES].map(c=>`<button class="category-chip ${selectedCategory===c?'active':''}" data-category="${esc(c)}">${esc(c)}</button>`).join("");nav.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{selectedCategory=b.dataset.category;render()}));
const sections=document.getElementById("catalogSections");const cats=selectedCategory==="Todas"?CATEGORIES:[selectedCategory];let any=false;sections.innerHTML=cats.map(cat=>{const list=visible.filter(g=>(g.categoria||"Otro")===cat);if(!list.length)return "";any=true;return `<section class="category-section" id="cat-${CATEGORIES.indexOf(cat)}"><h2>${esc(cat)} <span>${list.length} ${list.length===1?'juego':'juegos'}</span></h2><div class="game-grid">${list.map(g=>{const p=ports(g);const available=[p.pc?"PC":null,p.mobile?"Móvil":null].filter(Boolean);const isMobileDevice=Boolean(navigator.userAgentData?.mobile||/Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent||""));const selectedPort=isMobileDevice?p.mobile:p.pc;const buttons=selectedPort?`<a class="download" href="${esc(selectedPort)}" target="_blank" rel="noopener noreferrer">${isMobileDevice?"DESCARGAR PARA MÓVIL ↗":"DESCARGAR PARA PC ↗"}</a>`:`<span class="download" aria-disabled="true">${isMobileDevice?"PORT MÓVIL NO DISPONIBLE":"PORT PC NO DISPONIBLE"}</span>`;return `<article class="game-card"><img class="cover" loading="lazy" src="${esc(g.image_url||'assets/images/Meteor Fighters.png')}" alt="Portada de ${esc(g.title)}"><div class="game-body"><div class="game-top"><h3>${esc(g.title)}</h3></div><div class="game-tags"><span class="tag">${available.join(" + ")||"Sin port"}</span><span class="tag age-tag">${esc(g.clasificacion_edad||'Pendiente de clasificación')}</span>${(g.etiquetas||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><p>${esc(g.description||'Sin descripción disponible.')}</p>${(g.screenshots||[]).length?`<div class="game-screenshots">${g.screenshots.map((src,i)=>`<img loading="lazy" src="${esc(src)}" alt="Captura ${i+1} de ${esc(g.title)}">`).join('')}</div>`:''}<div class="byline">Por ${esc(g.author||'Creador de la comunidad')}</div><div class="game-port-actions">${buttons||'<span class="download" aria-disabled="true">PORT NO DISPONIBLE</span>'}</div>${reportButton(g)}</div></article>`}).join("")}</div></section>`}).join("");
document.getElementById("catalogStatus").textContent=any?`${visible.length} ${visible.length===1?'juego disponible':'juegos disponibles'} · Filtrá por PC o móvil` :"No encontramos juegos con esos filtros.";if(!any)sections.innerHTML='<div class="empty">Probá otra categoría o búsqueda. Los juegos pendientes de moderación no aparecen en el catálogo público.</div>'; }
async function init(){const {data,error}=await supabase.from("juegos").select("id,title,description,author,image_url,screenshots,clasificacion_edad,etiquetas,download_url,download_url_pc,download_url_mobile,categoria,plataforma,created_at,estado_moderacion,publish_at").eq("estado_moderacion","aprobado").or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`).order("created_at",{ascending:false});if(error){document.getElementById("catalogStatus").textContent="No pudimos cargar el catálogo. Revisá la conexión y las políticas de lectura de juegos.";console.error(error);return;}games=(data||[]).filter(g=>ports(g).pc||ports(g).mobile);render();}
document.getElementById("searchGames").addEventListener("input",render);document.getElementById("platformFilter").addEventListener("change",render);document.getElementById("ageFilter").addEventListener("change",render);init();
