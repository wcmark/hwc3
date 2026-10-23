import { holyrics, initShell, toast, esc } from './core.js';
import { refreshCurrentTheme } from './playlist-themes.js';
import { refreshCurrentSlides } from './playlist-slides.js';
import { initPresentationControls } from './presentation-controls.js';

initShell('/playlists');

const selector = document.querySelector('#playlistSelect');
const itemsNode = document.querySelector('#playlistItems');
const metaNode = document.querySelector('#playlistMeta');
const iconByType = {
  title: '━', song: '♫', verse: '▤', text: 'T', audio: '♫', video: '▶', image: '▧', file: '▤',
  announcement: '⚑', automatic_presentation: '▣', countdown: '◷', countdown_cp: '◷',
  cp_text: 'T', plain_text: 'T', uri: '↗', global_action: '⚙', api: '⌘', script: '⌘'
};
let playlists = new Map();
let selectionRequest = 0;
let activeKey = '';
const notice = document.querySelector('#playlistNotice');
function showNotice(message = '') {
  document.querySelector('#playlistNoticeText').textContent = message;
  notice.hidden = !message;
}
document.querySelector('#closePlaylistNotice').addEventListener('click', () => showNotice());

initPresentationControls(refreshCurrentTheme);

function formatScheduleName(schedule) {
  const name = schedule.name || schedule.metadata?.event?.name || schedule.metadata?.service?.name ||
    (schedule.type === 'service' ? 'Culto' : 'Evento');
  const datePart = String(schedule.datetime ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return name;
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  return `${date} · ${name}`;
}

function renderPlaylist(playlist, message = '') {
  if (!playlist) {
    itemsNode.innerHTML = '<div class="empty">No se pudo cargar esta playlist.</div>';
    return;
  }
  const items = playlist.items ?? [];
  metaNode.textContent = `${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}`;
  showNotice(message);
  if (!items.length) {
    itemsNode.innerHTML = '<div class="empty">Esta playlist no tiene elementos.</div>';
    return;
  }
  itemsNode.innerHTML = items.map((item, index) => {
    const type = String(item.type ?? '').toLowerCase();
    const name = item.name || item.title || (type ? type.replaceAll('_', ' ') : 'Elemento');
    const icon = iconByType[type] ?? '•';
    if (type === 'title') {
      return `<div class="playlist-separator" role="heading"><span class="playlist-separator-icon" aria-hidden="true">${icon}</span><span class="playlist-separator-name">${esc(name)}</span></div>`;
    }
    return `<button class="playlist-entry" type="button" data-item-index="${index}" aria-label="Reproducir ${esc(name)}"><span class="playlist-entry-icon" aria-hidden="true">${icon}</span><span class="playlist-entry-name">${esc(name)}</span><span class="playlist-entry-type">${esc(type.replaceAll('_', ' '))}</span></button>`;
  }).join('');

  itemsNode.querySelectorAll('[data-item-index]').forEach(button => button.addEventListener('click', async () => {
    const item = items[Number(button.dataset.itemIndex)];
    if (item?.id == null) return toast('Este elemento no tiene un ID reproducible.', true);
    button.disabled = true;
    try { await holyrics('MediaPlaylistAction', { id: item.id }); refreshCurrentTheme(); refreshCurrentSlides(); }
    catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  }));
}

async function loadPlaylists() {
  itemsNode.innerHTML = '<div class="empty">Cargando listas…</div>';
  selector.disabled = true;
  const now = new Date();
  const [currentResult, scheduleResult] = await Promise.all([
    holyrics('GetCurrentSchedule').catch(error => ({ error })),
    holyrics('GetSchedules', { month: now.getMonth() + 1, year: now.getFullYear() }).catch(error => ({ error }))
  ]);

  playlists = new Map();
  const options = [];
  const current = Array.isArray(currentResult.data) ? currentResult.data[0] : currentResult.data;
  const eventId = schedule => schedule?.metadata?.event?.id ?? schedule?.event_id ?? null;
  const sameSchedule = schedule => {
    if (!current || schedule.type !== current.type) return false;
    if (schedule.type === 'temporary') return true;
    const leftId = eventId(schedule), rightId = eventId(current);
    if (leftId != null && rightId != null) return String(leftId) === String(rightId);
    return Boolean(schedule.datetime) && schedule.datetime === current.datetime && schedule.name === current.name;
  };
  activeKey = '';

  const schedules = scheduleResult.error ? [] : (scheduleResult.data ?? []);
  schedules.forEach((schedule, index) => {
    if (!['temporary', 'service', 'event'].includes(schedule.type)) return;
    const key = schedule.type === 'temporary' ? 'temporary' : `schedule-${index}`;
    if (playlists.has(key)) return;
    options.push({ value: key, label: schedule.type === 'temporary' ? 'Temporario' : formatScheduleName(schedule) });
    playlists.set(key, {
      items: schedule.media_playlist ?? [],
      schedule,
      eventId: eventId(schedule)
    });
    if (sameSchedule(schedule)) activeKey = key;
  });

  if (current) {
    if (!activeKey) {
      activeKey = current.type === 'temporary' ? 'temporary' : 'current';
      options.unshift({ value: activeKey, label: current.type === 'temporary' ? 'Temporario' : formatScheduleName(current) });
    }
    let items = current.media_playlist;
    if (!Array.isArray(items)) items = (await holyrics('GetMediaPlaylist')).data ?? [];
    playlists.set(activeKey, { items, schedule: current, eventId: eventId(current) });
  } else {
    // A failed schedule lookup must not label the active media list as temporary.
    const media = await holyrics('GetMediaPlaylist');
    activeKey = 'current';
    options.unshift({ value: activeKey, label: 'Lista activa en Holyrics' });
    playlists.set(activeKey, { items: media.data ?? [] });
  }

  selector.replaceChildren(...options.map(option => new Option(option.label, option.value)));
  selector.disabled = false;
  selector.value = activeKey;
  renderPlaylist(playlists.get(activeKey), scheduleResult.error ? `No se pudieron consultar los eventos del mes: ${scheduleResult.error.message}` : '');
}

selector.addEventListener('change', async () => {
  const key = selector.value;
  const playlist = playlists.get(key);
  const request = ++selectionRequest;
  if (!playlist) return renderPlaylist(null);
  if (key === activeKey) return renderPlaylist(playlist);

  if (key === 'temporary') {
    renderPlaylist(playlist, 'Holyrics no ofrece una acción documentada para activar la lista temporal.');
    return;
  }

  if (!playlist.eventId) {
    renderPlaylist(playlist, 'Holyrics no entregó el ID del evento para cambiar la lista activa.');
    return;
  }

  selector.disabled = true;
  renderPlaylist(playlist, 'Cambiando la lista activa en Holyrics…');
  try {
    await holyrics('SetCurrentSchedule', { event_id: playlist.eventId });
    activeKey = key;
    const current = await holyrics('GetMediaPlaylist');
    if (request !== selectionRequest) return;
    playlist.items = current.data ?? playlist.items;
    renderPlaylist(playlist);
  } catch (error) {
    if (request !== selectionRequest) return;
    renderPlaylist(playlist, `No se pudo cambiar la lista activa: ${error.message}`);
  } finally {
    if (request === selectionRequest) selector.disabled = false;
  }
});
loadPlaylists().catch(error => {
  selector.replaceChildren(new Option('No se pudieron cargar las listas', ''));
  itemsNode.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
});
