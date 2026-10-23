import { holyrics, initShell, toast, esc } from './core.js';
import { initLyricsThemes, songThemeId, applySongTheme, waitForSong } from './lyrics-themes.js';
import { initPresentationControls } from './presentation-controls.js';
import { refreshCurrentSlides } from './playlist-slides.js';
initShell('/letras');
initPresentationControls();
const form = document.querySelector('#searchForm'), query = document.querySelector('#query'), results = document.querySelector('#results'), detail = document.querySelector('#songDetail');
const searchBar = document.querySelector('.lyrics-search-bar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--lyrics-search-height', `${Math.ceil(searchBar.getBoundingClientRect().height)}px`);
}).observe(searchBar);
let searchTimer, searchRequest = 0, previewRequest = 0, visibleSongs = [], projecting = false, previewSong = null;
const picker = initLyricsThemes(renderThemePreviews, syncSongTheme);
document.querySelector('#overrideSongTheme').addEventListener('change', () => {
  const songs = previewSong ? [...visibleSongs, previewSong] : visibleSongs;
  picker.loadImages(songs.map(song => picker.projectionThemeId(song))).catch(error => toast(`No se pudieron cargar algunas miniaturas: ${error.message}`, true));
});
const svg = paths => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const previewIcon = svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
const projectIcon = svg('<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v5m-4 0h8m-6-15 5 3-5 3Z"/>');
const addPlaylistIcon = svg('<path d="M3 5h18M3 10h13M3 15h9m6-2v8m-4-4h8"/>');
const addingSongs = new Set();
async function addToPlaylist(id, button) {
  const key = String(id);
  if (addingSongs.has(key)) return;
  addingSongs.add(key);
  button.disabled = true;
  try {
    // Omitting event_id targets the list currently selected inside Holyrics.
    await holyrics('AddLyricsToPlaylist', { id, media_playlist: true });
    toast('Canción agregada a la lista de medios activa en Holyrics.');
  } catch (error) { toast(`No se pudo agregar la canción: ${error.message}`, true); }
  finally { addingSongs.delete(key); button.disabled = false; }
}
form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); search(); });
query.addEventListener('input', () => { ++searchRequest; clearTimeout(searchTimer); searchTimer = setTimeout(search, 300); });

function syncSongTheme(song) {
  for (const item of visibleSongs) if (String(item.id) === String(song.id)) item.theme = song.theme;
  if (previewSong && String(previewSong.id) === String(song.id)) previewSong.theme = song.theme;
  renderThemePreviews();
}
function renderSongTheme(node, song) {
  if (!node || !song) return;
  const saved = songThemeId(song), id = picker.projectionThemeId(song);
  const automatic = picker.overrideEnabled() && picker.selectedId() != null;
  const themeName = id ? picker.name(id) : 'Predeterminado de Holyrics';
  node.title = `${automatic ? 'Tema predeterminado automático' : saved ? 'Tema asignado' : 'Tema predeterminado'}: ${themeName}. Cambiar el tema guardado de esta canción`;
  node.setAttribute('aria-label', node.title);
  node.innerHTML = `${picker.imageMarkup(id)}<span class="lyrics-result-theme-name">${esc(themeName)}</span>`;
}
function renderThemePreviews() {
  results.querySelectorAll('[data-song-theme]').forEach(node => {
    const song = visibleSongs[Number(node.dataset.songTheme)];
    renderSongTheme(node, song);
  });
  renderSongTheme(document.querySelector('#previewTheme'), previewSong);
  setProjectionBusy(projecting);
}
async function search() {
  const request = ++searchRequest, text = query.value.trim();
  visibleSongs = [];
  if (!text) { results.innerHTML = '<div class="empty">Escribe para buscar en tus letras.</div>'; return; }
  results.innerHTML = '<div class="empty">Buscando…</div>';
  try {
    const response = await holyrics('SearchLyrics', { text, title: true, artist: true, note: true, lyrics: true, fields: 'id,title,artist,key,groups,theme' });
    if (request !== searchRequest) return;
    visibleSongs = Array.isArray(response.data) ? response.data : [];
    if (!visibleSongs.length) { results.innerHTML = '<div class="empty">No se encontraron canciones.</div>'; return; }
    results.innerHTML = visibleSongs.map((song, index) => {
      const groups = (song.groups ?? []).map(group => typeof group === 'string' ? group : group.name).filter(Boolean).join(', ');
      return `<article class="list-item lyrics-result"><button type="button" class="lyrics-result-theme" data-song-theme="${index}" aria-haspopup="dialog" aria-controls="lyricsThemeDialog"></button><div class="lyrics-result-info"><div class="title">${esc(song.title || 'Sin título')}</div><div class="sub">${esc([song.artist, song.key, groups].filter(Boolean).join(' · '))}</div></div><div class="lyrics-result-actions"><button type="button" class="btn secondary lyrics-icon-button" data-preview="${index}" title="Ver letra" aria-label="Ver letra de ${esc(song.title || 'la canción')}">${previewIcon}</button><button type="button" class="btn primary lyrics-icon-button" data-show="${index}" title="Proyectar canción" aria-label="Proyectar ${esc(song.title || 'canción')}">${projectIcon}</button><button type="button" class="btn secondary lyrics-icon-button" data-add-playlist="${index}" title="Agregar a la lista de medios activa en Holyrics" aria-label="Agregar ${esc(song.title || 'canción')} a la lista de medios activa">${addPlaylistIcon}</button></div></article>`;
    }).join('');
    results.querySelectorAll('[data-song-theme]').forEach(button => {
      const song = visibleSongs[Number(button.dataset.songTheme)];
      button.addEventListener('click', () => { if (!projecting) picker.open(song); });
    });
    results.querySelectorAll('[data-preview]').forEach(button => {
      const song = visibleSongs[Number(button.dataset.preview)];
      button.addEventListener('click', () => preview(song.id));
    });
    results.querySelectorAll('[data-show]').forEach(button => {
      const song = visibleSongs[Number(button.dataset.show)];
      button.addEventListener('click', () => project(song.id));
    });
    results.querySelectorAll('[data-add-playlist]').forEach(button => {
      const song = visibleSongs[Number(button.dataset.addPlaylist)];
      button.addEventListener('click', () => addToPlaylist(song.id, button));
    });
    setProjectionBusy(projecting);
    renderThemePreviews();
    await picker.ready;
    if (request !== searchRequest) return;
    await picker.loadImages(visibleSongs.map(song => picker.projectionThemeId(song)));
  } catch (error) {
    if (request !== searchRequest) return;
    if (visibleSongs.length) toast(`No se pudieron cargar algunas miniaturas: ${error.message}`, true);
    else results.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}
function setProjectionBusy(busy) {
  const blocked = busy || picker.isApplying();
  document.querySelectorAll('[data-show], #showSong, [data-song-theme], #previewTheme, #lyricsTheme').forEach(button => { button.disabled = blocked; });
  document.querySelector('#overrideSongTheme').disabled = blocked || !picker.isReady();
}
async function project(id) {
  if (projecting || picker.isApplying()) return;
  projecting = true;
  setProjectionBusy(true);
  let shown = false;
  try {
    await picker.ready;
    // Read the saved theme again: it may have changed in Holyrics since the search.
    const song = (await holyrics('GetLyrics', { id, fields: 'id,theme' })).data;
    if (!song) throw new Error('La canción ya no está disponible.');
    syncSongTheme(song);
    const fallback = picker.overrideEnabled() || !songThemeId(song) ? picker.selectedId() : null;
    if (picker.overrideEnabled() && !fallback) {
      toast('Elegí el tema predeterminado que querés aplicar a las canciones.');
      picker.open();
      return;
    }
    await holyrics('ShowLyrics', { id });
    shown = true;
    await waitForSong(id);
    if (fallback) await applySongTheme(id, fallback);
    else if (!songThemeId(song)) await picker.rememberDisplayedTheme(id);
    toast('Canción enviada a proyección');
  } catch (error) { toast(`${shown ? 'La canción se abrió, pero no se pudo aplicar el tema: ' : ''}${error.message}`, true); }
  finally { projecting = false; setProjectionBusy(false); refreshCurrentSlides(); }
}
function scrollToDetail() {
  requestAnimationFrame(() => {
    detail.focus({ preventScroll: true });
    detail.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
}
async function preview(id) {
  const request = ++previewRequest;
  previewSong = null;
  detail.hidden = false;
  detail.innerHTML = '<div class="empty">Cargando canción…</div>';
  scrollToDetail();
  try {
    const song = (await holyrics('GetLyrics', { id })).data;
    if (request !== previewRequest) return;
    if (!song) throw new Error('La canción ya no está disponible.');
    previewSong = { ...song, id: song.id ?? id };
    syncSongTheme(previewSong);
    const slides = song.slides ?? [];
    detail.innerHTML = `<div class="detail-heading"><div><p class="eyebrow">Vista previa</p><h2>${esc(song.title || 'Canción')}</h2><p class="muted">${esc([song.artist, song.author].filter(Boolean).join(' · '))}</p></div><button type="button" class="lyrics-result-theme" id="previewTheme" aria-haspopup="dialog" aria-controls="lyricsThemeDialog"></button><div class="lyrics-result-actions"><button type="button" class="btn primary lyrics-icon-button" id="showSong" title="Proyectar canción" aria-label="Proyectar canción">${projectIcon}</button><button type="button" class="btn secondary lyrics-icon-button" id="addPreviewToPlaylist" title="Agregar a la lista de medios activa en Holyrics" aria-label="Agregar canción a la lista de medios activa">${addPlaylistIcon}</button></div></div><div class="item-list">${slides.map((slide, i) => `<div class="list-item"><div><div class="sub">${esc(slide.slide_description || `Parte ${i + 1}`)}</div><div class="lyric-slide">${esc(slide.text ?? '')}</div></div></div>`).join('')}</div>`;
    detail.querySelector('#previewTheme').addEventListener('click', () => { if (!projecting && previewSong) picker.open(previewSong); });
    detail.querySelector('#showSong').addEventListener('click', () => project(id));
    detail.querySelector('#addPreviewToPlaylist').addEventListener('click', event => addToPlaylist(id, event.currentTarget));
    renderThemePreviews();
    scrollToDetail();
    await picker.ready;
    if (request === previewRequest) picker.loadImages([picker.projectionThemeId(previewSong)]).catch(() => {});
  } catch (error) { if (request === previewRequest) detail.innerHTML = `<div class="empty">${esc(error.message)}</div>`; }
}
