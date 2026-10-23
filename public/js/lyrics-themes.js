import { holyrics, currentInfo, esc, toast } from './core.js';

export const songThemeId = song => song?.theme == null || song.theme === '' ? null : String(song.theme);
const currentSongId = item => item?.type === 'song' ? String(item.song_id ?? item.id ?? '') : null;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function waitForSong(songId) {
  const deadline = performance.now() + 5000;
  while (true) {
    const current = (await holyrics('GetCurrentPresentation')).data;
    if (currentSongId(current) === String(songId)) return;
    // During opening, Holyrics can report the old item, null, or incomplete metadata.
    // Only the requested song is allowed through; no theme is applied while waiting.
    if (performance.now() >= deadline) throw new Error('Holyrics todavía no confirmó la apertura de esta canción. No se cambió el tema de otra presentación.');
    await delay(150);
  }
}

// A presentation ID can differ from the song ID. Check the song before changing it.
export async function applySongTheme(songId, themeId) {
  const current = (await holyrics('GetCurrentPresentation')).data;
  if (currentSongId(current) !== String(songId)) throw new Error('La presentación cambió. No se aplicó el tema a otra presentación.');
  await holyrics('SetCurrentBackground', { id: String(themeId), type: 'theme' });
}

export function initLyricsThemes(onChange, onSongChange = () => {}) {
  const trigger = document.querySelector('#lyricsTheme');
  const dialog = document.querySelector('#lyricsThemeDialog');
  const grid = document.querySelector('#lyricsThemeGrid');
  const message = document.querySelector('#lyricsThemeMessage');
  const title = document.querySelector('#lyricsThemeTitle');
  const options = document.querySelector('#songThemeOptions');
  const clearButton = document.querySelector('#clearSongTheme');
  const closeButton = document.querySelector('#closeLyricsThemes');
  const override = document.querySelector('#overrideSongTheme');
  const themes = new Map(), images = new Map();
  let selected = null, storageKey = '', loadingThemes = null, imageQueue = Promise.resolve(), dialogRequest = 0, applying = false, targetSong = null;
  let initialized = false;
  function projectionThemeId(song) { return override.checked && selected ? selected.id : songThemeId(song) ?? selected?.id ?? null; }
  override.addEventListener('change', () => {
    try { if (storageKey) localStorage.setItem(`${storageKey}:override`, String(override.checked)); } catch { /* Keep the preference for this session. */ }
    renderTrigger();
    onChange();
  });
  function setApplying(value) {
    applying = value;
    trigger.disabled = value;
    closeButton.disabled = value;
    clearButton.disabled = value || !songThemeId(targetSong);
    grid.querySelectorAll('button').forEach(button => { button.disabled = value; });
    onChange();
  }
  function showMessage(value = '') { message.textContent = value; message.hidden = !value; }
  function name(id) { return themes.get(String(id))?.name || (selected?.id === String(id) ? selected.name : '') || 'Tema asignado'; }
  function imageMarkup(id) {
    const src = images.get(String(id));
    return src ? `<img class="theme-preview" src="${esc(src)}" alt="" loading="lazy">` : '<span class="theme-preview theme-preview-empty" aria-hidden="true">◐</span>';
  }
  function renderTrigger() {
    const title = selected ? `Tema predeterminado: ${selected.name}${override.checked ? ' (se aplicará a todas las canciones)' : ' (para canciones sin tema propio)'}` : 'Elegir tema predeterminado';
    trigger.innerHTML = `${imageMarkup(selected?.id)}<span class="current-theme-name">${esc(selected?.name || 'Elegir tema')}</span>`;
    trigger.title = title;
    trigger.setAttribute('aria-label', title);
  }
  async function loadThemes() {
    if (loadingThemes) return loadingThemes;
    loadingThemes = holyrics('GetBackgrounds', { type: 'theme' }).then(result => {
      themes.clear();
      for (const item of result.data ?? []) {
        if (item.id != null && (!item.type || item.type === 'theme')) themes.set(String(item.id), { ...item, id: String(item.id), name: item.name || 'Sin nombre' });
      }
    }).finally(() => { loadingThemes = null; });
    return loadingThemes;
  }
  function loadImages(ids) {
    const work = imageQueue.then(async () => {
      const missing = [...new Set(ids.filter(id => id != null && id !== '').map(String))].filter(id => !images.has(id));
      for (let offset = 0; offset < missing.length; offset += 12) {
        const batch = missing.slice(offset, offset + 12);
        const response = await holyrics('GetThumbnail', { ids: batch, type: 'theme' });
        batch.forEach(id => images.set(id, ''));
        for (const item of response.data ?? []) {
          if (item.image && /^[A-Za-z0-9+/=\s]+$/.test(item.image)) images.set(String(item.id), `data:image/jpeg;base64,${item.image}`);
        }
        renderTrigger();
        onChange();
        grid.querySelectorAll('[data-theme-id]').forEach(button => {
          if (batch.includes(button.dataset.themeId)) button.querySelector('.theme-preview').outerHTML = imageMarkup(button.dataset.themeId);
        });
      }
    });
    imageQueue = work.catch(() => {});
    return work;
  }
  async function choose(item) {
    if (applying) return;
    if (targetSong) return saveSongTheme(item.id);
    setApplying(true);
    selected = { id: item.id, name: item.name };
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(selected)); } catch { /* Selection still works in this session. */ }
    renderTrigger();
    onChange();
    dialog.close();
    try {
      const current = (await holyrics('GetCurrentPresentation')).data;
      const id = currentSongId(current);
      if (id) {
        const song = (await holyrics('GetLyrics', { id, fields: 'id,theme' })).data;
        if (song && (override.checked || !songThemeId(song))) await applySongTheme(id, selected.id);
      }
    } catch (error) { toast(`Tema elegido. No se pudo actualizar la presentación actual: ${error.message}`, true); }
    finally {
      setApplying(false);
      loadImages([selected.id]).catch(() => {});
    }
  }
  async function saveSongTheme(themeId) {
    if (!targetSong || applying) return;
    const song = targetSong, expected = themeId == null ? null : String(themeId);
    setApplying(true);
    showMessage('Guardando tema de la canción…');
    let saved = false;
    try {
      await holyrics('EditSong', { id: song.id, theme: expected });
      let confirmed;
      for (let attempt = 0; attempt < 5; attempt++) {
        confirmed = (await holyrics('GetLyrics', { id: song.id, fields: 'id,title,theme' })).data;
        if (confirmed && songThemeId(confirmed) === expected) break;
        if (attempt < 4) await delay(150);
      }
      if (!confirmed || songThemeId(confirmed) !== expected) throw new Error('Holyrics no confirmó el cambio guardado. Volvé a abrir el selector para consultar la asignación.');
      saved = true;
      targetSong = { ...song, ...confirmed, theme: expected };
      onSongChange(targetSong);
      onChange();
      dialog.close();
      const current = (await holyrics('GetCurrentPresentation')).data;
      const displayTheme = projectionThemeId(targetSong);
      if (currentSongId(current) === String(song.id) && displayTheme != null) await applySongTheme(song.id, displayTheme);
      toast(expected ? 'Tema guardado en la canción' : 'Tema desasignado: la canción usará el predeterminado');
    } catch (error) {
      if (saved) toast(`La asignación se guardó, pero no se pudo actualizar la proyección actual: ${error.message}`, true);
      else showMessage(`No se pudo guardar la asignación: ${error.message}`);
    } finally {
      setApplying(false);
      loadImages([expected ?? selected?.id]).catch(() => {});
    }
  }
  async function rememberDisplayedTheme(songId) {
    // When no theme was chosen, let Holyrics start normally and learn its theme.
    if (selected) return;
    try {
      const current = (await holyrics('GetCurrentPresentation')).data;
      if (currentSongId(current) !== String(songId)) return;
      const item = (await holyrics('GetCurrentTheme')).data;
      if (selected || item?.id == null) return;
      selected = { id: String(item.id), name: item.name || name(item.id) };
      try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(selected)); } catch { /* Keep session selection. */ }
      renderTrigger();
      onChange();
      await loadImages([selected.id]);
    } catch { /* Reading a preview must not interrupt a successful projection. */ }
  }
  async function open(song = null) {
    if (applying) return;
    const request = ++dialogRequest;
    targetSong = null;
    title.textContent = song ? `Tema de ${song.title || 'la canción'}` : 'Tema predeterminado';
    options.hidden = !song;
    clearButton.disabled = true;
    if (!dialog.open) dialog.showModal();
    showMessage();
    grid.innerHTML = '<div class="theme-grid-status">Cargando temas…</div>';
    await ready;
    try {
      await loadThemes();
      if (!dialog.open || request !== dialogRequest) return;
      if (song) {
        const result = await holyrics('GetLyrics', { id: song.id, fields: 'id,title,theme' });
        if (!dialog.open || request !== dialogRequest) return;
        if (!result.data) throw new Error('La canción ya no está disponible.');
        targetSong = { ...song, ...result.data };
        onSongChange(targetSong);
        clearButton.disabled = !songThemeId(targetSong);
      }
      const activeId = targetSong ? songThemeId(targetSong) : selected?.id;
      grid.replaceChildren(...[...themes.values()].map(item => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'theme-choice'; button.dataset.themeId = item.id;
        button.title = item.name; button.setAttribute('aria-label', item.name);
        button.setAttribute('aria-pressed', String(activeId === item.id));
        button.innerHTML = `${imageMarkup(item.id)}<span class="theme-choice-name">${esc(item.name)}</span>`;
        button.addEventListener('click', () => choose(item));
        return button;
      }));
      if (!themes.size) grid.innerHTML = '<div class="theme-grid-status">No hay temas disponibles.</div>';
      await loadImages([...themes.keys()]);
    } catch (error) { if (dialog.open && request === dialogRequest) showMessage(`No se pudieron cargar todos los temas o sus miniaturas: ${error.message}`); }
  }
  trigger.addEventListener('click', () => open());
  clearButton.addEventListener('click', () => saveSongTheme(null));
  closeButton.addEventListener('click', () => { if (!applying) dialog.close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog && !applying) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (applying) event.preventDefault(); });
  dialog.addEventListener('close', () => { ++dialogRequest; });

  const ready = (async () => {
    const [info, current, catalog] = await Promise.allSettled([currentInfo(), holyrics('GetCurrentTheme'), loadThemes()]);
    if (info.status === 'fulfilled' && info.value.activeTeam) {
      storageKey = `hly-lyrics-theme:${info.value.activeTeam}`;
      try { override.checked = localStorage.getItem(`${storageKey}:override`) === 'true'; } catch { /* Defaults to disabled. */ }
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved?.id != null && (catalog.status !== 'fulfilled' || themes.has(String(saved.id)))) selected = { id: String(saved.id), name: themes.get(String(saved.id))?.name || String(saved.name || 'Tema elegido') };
      } catch { /* Missing or unavailable storage should not prevent searching. */ }
    }
    if (!selected && current.status === 'fulfilled' && current.value.data?.id != null) {
      const item = current.value.data;
      selected = { id: String(item.id), name: item.name || name(item.id) };
    }
    initialized = true;
    renderTrigger();
    onChange();
    if (selected) await loadImages([selected.id]).catch(() => {});
  })();
  return { ready, open, name, imageMarkup, loadImages, rememberDisplayedTheme, projectionThemeId, overrideEnabled: () => override.checked, isReady: () => initialized, selectedId: () => selected?.id ?? null, isApplying: () => applying };
}
