import { supabase } from './supabase.js';

const $ = (id) => document.getElementById(id);
const labels = {
  contenido_inapropiado: 'Contenido inapropiado',
  enlace_roto: 'Enlace roto',
  archivo_sospechoso: 'Archivo sospechoso',
  descripcion_engañosa: 'Descripción engañosa',
  spam: 'Spam',
  derechos_autor: 'Derechos de autor',
  otro: 'Otro'
};

let reports = [];
let busy = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

function setNotice(message, isError = false) {
  const notice = $('reportsNotice');
  notice.textContent = message;
  notice.style.borderColor = isError ? '#8b354b' : '';
  notice.style.color = isError ? '#ff9ab0' : '';
}

async function init() {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) {
      setNotice('Iniciá sesión con una cuenta moderador o root.', true);
      $('reportsList').textContent = 'Sesión no iniciada.';
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;
    if (!['moderador', 'root'].includes(String(profile?.role || '').toLowerCase())) {
      setNotice('Acceso exclusivo para moderadores y root.', true);
      $('reportsList').textContent = 'Acceso denegado.';
      return;
    }

    setNotice(`Sesión verificada · ${profile.role}. Las resoluciones quedan registradas en auditoría.`);
    await load();
  } catch (error) {
    setNotice(error.message || 'No se pudo verificar la sesión.', true);
    $('reportsList').textContent = 'No se pudo verificar el acceso.';
  }
}

async function load() {
  if (busy) return;
  busy = true;
  $('refreshReports').disabled = true;
  $('reportsList').setAttribute('aria-busy', 'true');
  $('reportsList').textContent = 'Cargando reportes…';

  try {
    const { data, error } = await supabase
      .from('reportes_juegos')
      .select('id,juego_id,reportante_id,motivo,detalle,estado,revisado_por,revisado_at,resolucion,created_at,juego:juegos!reportes_juegos_juego_id_fkey(title),reportante:usuarios!reportes_juegos_reportante_id_fkey(username)')
      .order('created_at', { ascending: false })
      .limit(300);

    if (error) throw error;
    reports = data || [];
    $('countPending').textContent = reports.filter((report) => report.estado === 'pendiente').length;
    $('countReview').textContent = reports.filter((report) => report.estado === 'en_revision').length;
    $('countResolved').textContent = reports.filter((report) => ['resuelto', 'descartado'].includes(report.estado)).length;
    render();
  } catch (error) {
    $('reportsList').textContent = 'No se pudieron cargar los reportes. Verificá la conexión, los permisos y que la migración esté aplicada.';
    setNotice(error.message || 'Error al cargar los reportes.', true);
  } finally {
    busy = false;
    $('refreshReports').disabled = false;
    $('reportsList').setAttribute('aria-busy', 'false');
  }
}

function render() {
  const filter = $('reportsFilter').value;
  const rows = reports.filter((report) => filter === 'todos' || report.estado === filter);

  if (!rows.length) {
    $('reportsList').textContent = 'No hay reportes para este filtro.';
    return;
  }

  $('reportsList').innerHTML = rows.map((report) => {
    const date = new Date(report.created_at);
    const dateLabel = Number.isNaN(date.getTime()) ? 'Fecha no disponible' : date.toLocaleString('es-AR');
    const title = report.juego?.title || `Juego #${report.juego_id}`;
    const reporter = report.reportante?.username || 'Usuario no disponible';
    const status = String(report.estado || '').replaceAll('_', ' ').toUpperCase();

    return `<article class="report-card" data-report="${Number(report.id)}">
      <div class="report-meta">Reporte #${Number(report.id)} · ${esc(dateLabel)} · Reportado por ${esc(reporter)}</div>
      <h2>${esc(title)}</h2>
      <span class="report-pill">${esc(labels[report.motivo] || report.motivo)} · ${esc(status)}</span>
      <p>${esc(report.detalle)}</p>
      ${report.resolucion ? `<p><b>Resolución anterior:</b> ${esc(report.resolucion)}</p>` : ''}
      <div class="report-actions">
        <label class="sr-only" for="report-status-${Number(report.id)}">Estado del reporte</label>
        <select id="report-status-${Number(report.id)}" class="report-status">
          <option value="en_revision" ${report.estado === 'en_revision' ? 'selected' : ''}>En revisión</option>
          <option value="resuelto">Resolver</option>
          <option value="descartado">Descartar</option>
        </select>
        <label class="sr-only" for="report-resolution-${Number(report.id)}">Resolución</label>
        <textarea id="report-resolution-${Number(report.id)}" maxlength="1000" minlength="5" placeholder="Motivo de la resolución (mínimo 5 caracteres)…">${esc(report.resolucion || '')}</textarea>
        <button type="button" data-resolve="${Number(report.id)}">GUARDAR CAMBIOS</button>
      </div>
    </article>`;
  }).join('');
}

$('reportsList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-resolve]');
  if (!button || button.disabled) return;

  const card = button.closest('[data-report]');
  const state = card.querySelector('.report-status').value;
  const resolution = card.querySelector('textarea').value.trim();
  if (resolution.length < 5) {
    window.alert('Escribí una resolución de al menos 5 caracteres.');
    return;
  }

  button.disabled = true;
  button.textContent = 'GUARDANDO…';
  try {
    const { error } = await supabase.rpc('admin_resolver_reporte_juego', {
      p_reporte_id: Number(button.dataset.resolve),
      p_estado: state,
      p_resolucion: resolution
    });
    if (error) throw error;
    await load();
  } catch (error) {
    window.alert(error.message || 'No se pudieron guardar los cambios.');
    button.disabled = false;
    button.textContent = 'GUARDAR CAMBIOS';
  }
});

$('reportsFilter').addEventListener('change', render);
$('refreshReports').addEventListener('click', load);
init();
