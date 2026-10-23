import { holyrics, initShell, toast, esc } from './core.js';
initShell('/medios');

const playerPanel = document.querySelector('.media-player');
function updatePlayerHeight() {
  document.querySelector('.media-shell').style.setProperty('--media-player-height', `${Math.ceil(playerPanel.getBoundingClientRect().height)}px`);
}
new ResizeObserver(updatePlayerHeight).observe(playerPanel);
updatePlayerHeight();

const icons = {
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  previous: '<path d="M5 5v14M19 5 8 12l11 7Z"/>',
  next: '<path d="M19 5v14M5 5l11 7-11 7Z"/>',
  repeat: '<path d="m16 2 4 4-4 4M4 11V9a3 3 0 0 1 3-3h13M8 22l-4-4 4-4m12-1v2a3 3 0 0 1-3 3H4"/>',
  shuffle: '<path d="m17 3 4 4-4 4M3 17h3c4 0 8-10 12-10h3M3 7h3c1 0 2 1 3 2m6 6 3 2h3m-4-4 4 4-4 4"/>',
  fullscreen: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  exitFullscreen: '<path d="M3 9h6V3m6 0v6h6M9 21v-6H3m12 6v-6h6"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  audio: '<path d="M9 18V5l11-2v13M9 9l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
  folder: '<path d="M3 8V5h6l3 3h9v12H3Zm0 3h18"/>',
  text: '<path d="M4 5h16M12 5v15M8 20h8"/>',
  file: '<path d="M14 2H5v20h14V7Zm0 0v5h5M8 12h8M8 16h8"/>',
  project: '<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v5m-4 0h8m-6-15 5 3-5 3Z"/>',
  execute: '<path d="M9 3H3v18h18v-6M14 3h7v7M10 14 21 3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-5L3 9m0-6v6h6M4 13a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
  back: '<path d="m9 5-7 7 7 7M2 12h20"/>'
};
function icon(name) {
  return `<svg class="media-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name] ?? icons.file}</svg>`;
}
function setIcon(button, name) {
  if (button.dataset.renderedIcon === name) return;
  button.innerHTML = icon(name);
  button.dataset.renderedIcon = name;
}
function label(button, value) { button.title = value; button.setAttribute('aria-label', value); }
function text(element, value) { if (element.textContent !== value) element.textContent = value; }
document.querySelectorAll('[data-icon]').forEach(button => setIcon(button, button.dataset.icon));

const libraryKinds = {
  Images: { label: 'Imagen', icon: 'image', action: 'ShowImage', verb: 'Proyectar', actionIcon: 'project' },
  Videos: { label: 'Video', icon: 'play', action: 'PlayVideo', verb: 'Reproducir', actionIcon: 'play' },
  Audios: { label: 'Audio', icon: 'audio', action: 'PlayAudio', verb: 'Reproducir', actionIcon: 'play' },
  Files: { label: 'Archivo', icon: 'file', action: 'ExecuteFile', verb: 'Ejecutar', actionIcon: 'execute' },
  Texts: { label: 'Texto', icon: 'text', action: 'ShowText', verb: 'Proyectar', actionIcon: 'project' }
};
let kind = 'Images', folder = '', libraryRequest = 0, filterTimer;
const list = document.querySelector('#mediaItems'), filter = document.querySelector('#filter');
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

document.querySelectorAll('#mediaTabs button').forEach(button => button.addEventListener('click', () => {
  clearTimeout(filterTimer);
  document.querySelectorAll('#mediaTabs button').forEach(tab => {
    const active = tab === button;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  kind = button.dataset.kind;
  folder = '';
  loadFiles();
}));
document.querySelector('#refresh').addEventListener('click', () => { clearTimeout(filterTimer); loadFiles(); });
filter.addEventListener('input', () => {
  ++libraryRequest;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(loadFiles, 280);
});
document.querySelector('#parentFolder').addEventListener('click', () => {
  folder = folder.split('/').slice(0, -1).join('/');
  loadFiles();
});

async function loadFiles() {
  const request = ++libraryRequest, selectedKind = kind, selectedFolder = folder, query = filter.value.trim();
  const category = libraryKinds[selectedKind];
  document.querySelector('#folderBar').hidden = !selectedFolder;
  text(document.querySelector('#folderName'), selectedFolder);
  document.querySelector('#folderName').title = selectedFolder;
  list.innerHTML = '<div class="empty">Consultando biblioteca…</div>';
  try {
    const result = await holyrics(`Get${selectedKind}`, selectedKind === 'Texts'
      ? { fields: 'id,title,folder' }
      : { folder: selectedFolder, filter: query, include_metadata: true, include_thumbnail: true });
    if (request !== libraryRequest) return;
    let items = Array.isArray(result.data) ? result.data : [];
    if (selectedKind === 'Texts') items = items.filter(item => normalize(item.title).includes(normalize(query)));
    if (!items.length) { list.innerHTML = '<div class="empty">No se encontraron elementos en esta categoría.</div>'; return; }
    list.innerHTML = items.map((item, index) => {
      const name = String(selectedKind === 'Texts' ? item.title || 'Texto sin título' : item.name || 'Sin nombre');
      const isFolder = selectedKind !== 'Texts' && Boolean(item.isDir);
      const preview = item.thumbnail && !isFolder
        ? `<img src="data:image/jpeg;base64,${esc(item.thumbnail)}" alt="" loading="lazy">`
        : `<div class="media-placeholder">${icon(isFolder ? 'folder' : category.icon)}</div>`;
      const verb = isFolder ? 'Abrir carpeta' : category.verb;
      const description = `${verb}: ${name}`;
      const meta = isFolder ? 'Carpeta' : selectedKind === 'Texts' ? (item.folder || 'Texto')
        : item.duration_ms ? formatTime(item.duration_ms) : item.length ? `${Math.round(item.length / 1024)} KB` : category.label;
      return `<article class="media-card">${preview}<div class="body"><div class="name" title="${esc(name)}">${esc(name)}</div><div class="meta" title="${esc(meta)}">${esc(meta)}</div><button type="button" class="btn media-action ${isFolder ? 'secondary' : 'primary'}" data-index="${index}" title="${esc(description)}" aria-label="${esc(description)}">${icon(isFolder ? 'folder' : category.actionIcon)}</button></div></article>`;
    }).join('');
    list.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.index)];
      if (selectedKind !== 'Texts' && item.isDir) {
        folder = selectedFolder ? `${selectedFolder}/${item.name}` : item.name;
        await loadFiles();
        return;
      }
      button.disabled = true;
      try {
        const data = selectedKind === 'Texts' ? { id: item.id } : { file: selectedFolder ? `${selectedFolder}/${item.name}` : item.name };
        await holyrics(category.action, data);
        toast(`${item.title || item.name || 'Elemento'} enviado a Holyrics`);
        await refreshPlayer();
      } catch (error) { toast(error.message, true); }
      finally { button.disabled = false; }
    }));
  } catch (error) {
    if (request === libraryRequest) list.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

function formatTime(ms) {
  const seconds = Math.floor(Math.max(0, Number(ms) || 0) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}:` : ''}${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const playerName = document.querySelector('#playerName'), playerState = document.querySelector('#playerState');
const volume = document.querySelector('#volume'), volumeValue = document.querySelector('#volumeValue');
const seek = document.querySelector('#seek'), elapsed = document.querySelector('#elapsed');
const mute = document.querySelector('#mute'), play = document.querySelector('[data-player="toggle"]');
const playerButtons = [...document.querySelectorAll('[data-player], [data-toggle], #mute')];
const heldRanges = new Set(), pendingRanges = new Set();
let playerBusy = false, refreshingPlayer = false, playerRevision = 0, lastPlayer = {};

const expand = document.querySelector('#playerExpand');
expand.addEventListener('click', () => {
  const expanded = expand.getAttribute('aria-expanded') !== 'true';
  expand.setAttribute('aria-expanded', String(expanded));
  document.querySelector('#playerDetails').hidden = !expanded;
  updatePlayerHeight();
  label(expand, expanded ? 'Ocultar controles del reproductor' : 'Mostrar controles del reproductor');
});

function pressed(button, active) {
  button.classList.toggle('primary', active);
  button.classList.toggle('secondary', !active);
  button.setAttribute('aria-pressed', String(active));
}
function showPlayer(player) {
  lastPlayer = player;
  text(playerName, player.name || 'Sin medios en el reproductor');
  playerName.title = playerName.textContent;
  text(playerState, player.playing ? 'Reproduciendo' : player.name ? 'Pausado' : 'Sin reproducción');
  playerState.classList.remove('error');
  playerState.title = playerState.textContent;
  if (!heldRanges.has(volume) && !pendingRanges.has(volume)) {
    volume.value = Number(player.volume ?? 80);
    text(volumeValue, `${volume.value}%`);
    volume.setAttribute('aria-valuetext', `${volume.value}%`);
  }
  if (!heldRanges.has(seek) && !pendingRanges.has(seek)) {
    seek.max = Math.max(1, Number(player.duration_ms) || 0);
    seek.value = Math.max(0, Number(player.time_ms) || 0);
    text(elapsed, formatTime(player.time_ms));
    seek.setAttribute('aria-valuetext', formatTime(player.time_ms));
  }
  text(document.querySelector('#duration'), formatTime(player.duration_ms));
  seek.disabled = playerBusy || !(Number(player.duration_ms) > 0);
  setIcon(play, player.playing ? 'pause' : 'play');
  label(play, player.playing ? 'Pausar' : 'Reproducir');
  setIcon(mute, player.mute ? 'muted' : 'volume');
  label(mute, player.mute ? 'Activar sonido' : 'Silenciar');
  pressed(mute, Boolean(player.mute));
  for (const property of ['repeat', 'shuffle', 'fullscreen']) {
    const button = document.querySelector(`[data-toggle="${property}"]`), active = Boolean(player[property]);
    pressed(button, active);
    if (property === 'fullscreen') {
      setIcon(button, active ? 'exitFullscreen' : 'fullscreen');
      label(button, active ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)');
    } else {
      label(button, `${property === 'repeat' ? 'Repetir' : 'Aleatorio'}: ${active ? 'activado' : 'desactivado'}`);
    }
  }
}
async function refreshPlayer() {
  if (refreshingPlayer || playerBusy || document.hidden) return;
  refreshingPlayer = true;
  const revision = playerRevision;
  try {
    const result = await holyrics('GetMediaPlayerInfo');
    if (revision === playerRevision) showPlayer(result.data ?? {});
  } catch (error) {
    if (revision === playerRevision) {
      text(playerState, 'No se pudo consultar el reproductor');
      playerState.classList.add('error');
      playerState.title = error.message;
    }
  } finally { refreshingPlayer = false; }
}

// Discard any poll started before an action, and confirm the state with Holyrics.
async function playerAction(makeData) {
  if (playerBusy) return;
  playerBusy = true;
  ++playerRevision;
  playerButtons.forEach(button => { button.disabled = true; });
  volume.disabled = seek.disabled = true;
  try {
    const data = typeof makeData === 'function'
      ? makeData((await holyrics('GetMediaPlayerInfo')).data ?? {}) : makeData;
    await holyrics('MediaPlayerAction', data);
    showPlayer((await holyrics('GetMediaPlayerInfo')).data ?? {});
  } catch (error) { toast(error.message, true); }
  finally {
    playerBusy = false;
    playerButtons.forEach(button => { button.disabled = false; });
    volume.disabled = false;
    seek.disabled = !(Number(lastPlayer.duration_ms) > 0);
  }
}
document.querySelectorAll('[data-player]').forEach(button => button.addEventListener('click', () => {
  const action = button.dataset.player;
  playerAction(action === 'toggle' ? player => ({ action: player.playing ? 'pause' : 'play' }) : { action });
}));
document.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
  const property = button.dataset.toggle;
  playerAction(player => ({ [property]: !Boolean(player[property]) }));
}));
mute.addEventListener('click', () => playerAction(player => ({ mute: !Boolean(player.mute) })));

for (const range of [volume, seek]) {
  range.addEventListener('pointerdown', () => heldRanges.add(range));
  range.addEventListener('input', () => {
    pendingRanges.add(range);
    const value = range === volume ? `${range.value}%` : formatTime(range.value);
    text(range === volume ? volumeValue : elapsed, value);
    range.setAttribute('aria-valuetext', value);
  });
  range.addEventListener('change', async () => {
    try { await playerAction({ [range === volume ? 'volume' : 'time_ms']: Number(range.value) }); }
    finally { pendingRanges.delete(range); }
  });
  range.addEventListener('pointercancel', () => { heldRanges.delete(range); pendingRanges.delete(range); });
}
window.addEventListener('pointerup', () => heldRanges.clear());
window.addEventListener('blur', () => { heldRanges.clear(); pendingRanges.clear(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshPlayer(); });

loadFiles();
refreshPlayer();
setInterval(refreshPlayer, 1500);
