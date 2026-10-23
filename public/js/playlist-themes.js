import { holyrics, esc } from './core.js';

const trigger = document.querySelector('#currentTheme');
const dialog = document.querySelector('#themeDialog');
const grid = document.querySelector('#themeGrid');
const message = document.querySelector('#themeMessage');
const thumbnails = new Map();
let currentTheme = null;
let pendingRefresh = null;
let dialogRequest = 0;
let applying = false;

function imageKey(item) { return `${item.type === 'theme' ? 'theme' : 'background'}:${item.id}`; }
function imageMarkup(item) {
  const image = thumbnails.get(imageKey(item));
  return image ? `<img src="${esc(image)}" alt="" class="theme-preview">` : '<span class="theme-preview theme-preview-empty" aria-hidden="true">◐</span>';
}
function rememberImages(data, type) {
  for (const item of data ?? []) {
    if (item.image && /^[A-Za-z0-9+/=\s]+$/.test(item.image)) {
      thumbnails.set(`${type}:${item.id}`, `data:image/jpeg;base64,${item.image}`);
    }
  }
}
function markSelectedTheme() {
  grid.querySelectorAll('[data-theme-id]').forEach(button => {
    button.setAttribute('aria-pressed', String(String(currentTheme?.id) === button.dataset.themeId));
  });
}
function renderCurrentTheme(theme) {
  currentTheme = theme;
  trigger.hidden = !theme;
  if (!theme) {
    trigger.replaceChildren();
    if (dialog.open) dialog.close();
    return;
  }
  const name = theme.name || 'Tema actual';
  const markup = `${imageMarkup(theme)}<span class="current-theme-name">${esc(name)}</span>`;
  if (trigger.innerHTML !== markup) trigger.innerHTML = markup;
  trigger.title = `Cambiar tema: ${name}`;
  trigger.setAttribute('aria-label', `Cambiar tema: ${name}`);
  markSelectedTheme();
}

export function refreshCurrentTheme() {
  if (pendingRefresh) return pendingRefresh;
  if (document.hidden || applying) return Promise.resolve();
  pendingRefresh = (async () => {
    try {
      const result = await holyrics('GetCurrentTheme');
      if (applying) return;
      const theme = result.data?.id != null ? result.data : null;
      renderCurrentTheme(theme);
      if (theme && !thumbnails.has(imageKey(theme))) {
        const type = theme.type === 'theme' ? 'theme' : 'background';
        try {
          const preview = await holyrics('GetThumbnail', { id: theme.id, type });
          rememberImages(preview.data, type);
          // Remember missing previews too, so polling does not request them repeatedly.
          if (!thumbnails.has(imageKey(theme))) thumbnails.set(imageKey(theme), '');
          if (!applying && currentTheme === theme) renderCurrentTheme(theme);
        } catch { /* The theme name remains available if its preview fails. */ }
      }
    } catch {
      // Do not leave an old theme clickable when the connection is lost.
      if (!applying) renderCurrentTheme(null);
    }
  })().finally(() => { pendingRefresh = null; });
  return pendingRefresh;
}

function showMessage(text = '') {
  message.textContent = text;
  message.hidden = !text;
}

async function applyTheme(item) {
  if (applying) return;
  applying = true;
  grid.setAttribute('aria-busy', 'true');
  grid.querySelectorAll('button').forEach(button => { button.disabled = true; });
  showMessage();
  try {
    await holyrics('SetCurrentBackground', { id: item.id, type: 'theme' });
    // Complete any earlier read before checking the theme that was just applied.
    await pendingRefresh;
    dialog.close();
  } catch (error) {
    showMessage(`No se pudo aplicar el tema: ${error.message}`);
  } finally {
    applying = false;
    grid.removeAttribute('aria-busy');
    grid.querySelectorAll('button').forEach(button => { button.disabled = false; });
    refreshCurrentTheme();
  }
}

async function openThemes() {
  if (!currentTheme || applying) return;
  const request = ++dialogRequest;
  dialog.showModal();
  showMessage();
  grid.innerHTML = '<div class="theme-grid-status">Cargando temas…</div>';
  try {
    const result = await holyrics('GetBackgrounds', { type: 'theme' });
    if (!dialog.open || request !== dialogRequest) return;
    const themes = (result.data ?? []).filter(item => item.id != null && (!item.type || item.type === 'theme'))
      .map(item => ({ ...item, type: 'theme' }));
    grid.replaceChildren(...themes.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-choice';
      button.dataset.themeId = String(item.id);
      button.title = item.name || 'Sin nombre';
      button.innerHTML = `${imageMarkup(item)}<span class="theme-choice-name">${esc(item.name || 'Sin nombre')}</span>`;
      button.addEventListener('click', () => applyTheme(item));
      return button;
    }));
    if (!themes.length) grid.innerHTML = '<div class="theme-grid-status">No hay temas disponibles.</div>';
    markSelectedTheme();
    const missing = themes.filter(item => !thumbnails.has(imageKey(item)));
    for (let offset = 0; offset < missing.length; offset += 12) {
      if (!dialog.open || request !== dialogRequest) break;
      const batch = missing.slice(offset, offset + 12);
      try {
        const previews = await holyrics('GetThumbnail', { ids: batch.map(item => item.id), type: 'theme' });
        rememberImages(previews.data, 'theme');
        if (!dialog.open || request !== dialogRequest) break;
        for (const button of grid.querySelectorAll('[data-theme-id]')) {
          const item = batch.find(theme => String(theme.id) === button.dataset.themeId);
          if (item) button.querySelector('.theme-preview').outerHTML = imageMarkup(item);
        }
      } catch {
        showMessage('No se pudieron cargar algunas miniaturas. Puedes elegir un tema por su nombre.');
      }
    }
  } catch (error) {
    if (dialog.open && request === dialogRequest) {
      grid.replaceChildren();
      showMessage(`No se pudieron cargar los temas: ${error.message}`);
    }
  }
}

trigger.addEventListener('click', openThemes);
document.querySelector('#closeThemeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { dialogRequest++; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCurrentTheme(); });
async function pollTheme() {
  await refreshCurrentTheme();
  setTimeout(pollTheme, 1500);
}
pollTheme();
