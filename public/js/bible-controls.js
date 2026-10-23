import { holyrics } from './core.js';

export function initBibleControls({ enqueue, onChange }) {
  const versionSelect = document.querySelector('#bibleVersion');
  const countButtons = [...document.querySelectorAll('[data-count]')];
  const trigger = document.querySelector('#bibleTheme');
  const dialog = document.querySelector('#bibleThemeDialog');
  const grid = document.querySelector('#bibleThemeGrid');
  const message = document.querySelector('#bibleThemeMessage');
  const status = document.querySelector('#bibleSettingsStatus');
  const previews = new Map();
  let version = '', count = 1, themeId = null, themeScreens = {};
  let applying = false, request = 0;
  function showStatus(text = '') { status.textContent = text; status.hidden = !text; }
  function themeMessage(text = '') { message.textContent = text; message.hidden = !text; }
  function renderCount() {
    countButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === count)));
  }
  function selectTheme() {
    grid.querySelectorAll('[data-theme-id]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeId === String(themeId))));
  }
  function setBusy(value) {
    applying = value;
    versionSelect.disabled = value || !versionSelect.options.length || versionSelect.dataset.unavailable === 'true';
    countButtons.forEach(button => { button.disabled = value; });
    trigger.disabled = value;
    grid.querySelectorAll('button').forEach(button => { button.disabled = value; });
  }
  async function setSettings(settings) {
    const response = await holyrics('SetBibleSettings', settings);
    // Unlike most actions, this API may return status=ok with a list of errors.
    if (response.data !== true) {
      throw new Error(typeof response.data === 'string' ? response.data : `Holyrics no confirmó el ajuste: ${JSON.stringify(response.data ?? response.error ?? 'sin respuesta')}`);
    }
  }
  function change(settings, commit) {
    if (applying) return;
    setBusy(true);
    return enqueue(async () => {
      let saved = false;
      try {
        await setSettings(settings);
        commit();
        saved = true;
        showStatus();
        themeMessage();
        await onChange();
        if (dialog.open) dialog.close();
      } catch (error) {
        versionSelect.value = version;
        renderCount();
        const text = saved ? `Ajuste guardado, pero no se pudo actualizar el pasaje: ${error.message}` : error.message;
        showStatus(text);
        if (dialog.open) themeMessage(text);
      } finally { setBusy(false); }
    });
  }
  versionSelect.addEventListener('change', () => {
    const next = versionSelect.value;
    if (next && next !== version) change({ tab_version_1: next }, () => { version = next; });
  });
  countButtons.forEach(button => button.addEventListener('click', () => {
    const next = Number(button.dataset.count);
    change({ show_x_verses: next }, () => { count = next; renderCount(); });
  }));
  function previewNode(id) {
    const image = previews.get(String(id));
    const node = document.createElement(image ? 'img' : 'span');
    node.className = 'bible-theme-preview';
    if (image) { node.src = image; node.alt = ''; }
    else { node.textContent = '◐'; node.setAttribute('aria-hidden', 'true'); }
    return node;
  }
  async function openThemes() {
    const currentRequest = ++request;
    dialog.showModal();
    themeMessage('Cargando temas…');
    grid.replaceChildren();
    try {
      const [themesResponse, settingsResponse] = await Promise.all([
        holyrics('GetBackgrounds', { type: 'theme' }),
        holyrics('GetBibleSettings')
      ]);
      if (!dialog.open || currentRequest !== request) return;
      const settings = Array.isArray(settingsResponse.data) ? settingsResponse.data[0] : settingsResponse.data;
      themeScreens = settings?.theme ?? {};
      themeId = themeScreens.public;
      const themes = (themesResponse.data ?? []).filter(item => item.id != null && (!item.type || item.type === 'theme'));
      grid.replaceChildren(...themes.map(item => {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'bible-theme-choice';
        button.dataset.themeId = String(item.id); button.title = item.name || 'Sin nombre';
        const name = document.createElement('span'); name.className = 'bible-theme-name'; name.textContent = item.name || 'Sin nombre';
        button.append(previewNode(item.id), name);
        button.addEventListener('click', () => change({ theme: { ...themeScreens, public: String(item.id) } }, () => {
          themeId = item.id;
          themeScreens = { ...themeScreens, public: String(item.id) };
          trigger.title = `Tema de Biblia: ${item.name || 'Sin nombre'}`;
          selectTheme();
        }));
        return button;
      }));
      themeMessage(themes.length ? '' : 'No hay temas disponibles.');
      selectTheme();
      const missing = themes.filter(item => !previews.has(String(item.id)));
      for (let offset = 0; offset < missing.length; offset += 12) {
        if (!dialog.open || currentRequest !== request) break;
        try {
          const result = await holyrics('GetThumbnail', { ids: missing.slice(offset, offset + 12).map(item => String(item.id)), type: 'theme' });
          for (const item of result.data ?? []) {
            if (item.image && /^[A-Za-z0-9+/=\s]+$/.test(item.image)) previews.set(String(item.id), `data:image/jpeg;base64,${item.image}`);
          }
          if (!dialog.open || currentRequest !== request) break;
          grid.querySelectorAll('[data-theme-id]').forEach(button => {
            if (previews.has(button.dataset.themeId)) button.querySelector('.bible-theme-preview').replaceWith(previewNode(button.dataset.themeId));
          });
        } catch { themeMessage('Algunas miniaturas no están disponibles. Podés elegir el tema por su nombre.'); }
      }
    } catch (error) { if (dialog.open && currentRequest === request) themeMessage(error.message); }
  }
  trigger.addEventListener('click', openThemes);
  document.querySelector('#closeBibleThemes').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { request++; });

  async function load() {
    setBusy(true);
    const [versionsResult, settingsResult] = await Promise.allSettled([
      holyrics('GetBibleVersionsV2').catch(() => holyrics('GetBibleVersions')),
      holyrics('GetBibleSettings')
    ]);
    const settingsData = settingsResult.status === 'fulfilled' ? settingsResult.value.data : null;
    const settings = Array.isArray(settingsData) ? settingsData[0] : settingsData;
    version = settings?.tab_version_1 ?? '';
    themeScreens = settings?.theme ?? {};
    themeId = themeScreens.public;
    const versions = versionsResult.status === 'fulfilled' ? versionsResult.value.data ?? [] : [];
    const options = new Map();
    for (const item of versions) {
      const id = item.version || item.key;
      if (id && !String(id).startsWith('#shortcut ') && !options.has(id)) options.set(id, new Option(item.title || id, id));
    }
    if (version && !options.has(version)) options.set(version, new Option(version, version));
    versionSelect.replaceChildren(...options.values());
    if (!version) versionSelect.prepend(new Option('Actual en Holyrics', ''));
    versionSelect.value = version;
    versionSelect.dataset.unavailable = String(!options.size);
    if (!options.size) versionSelect.replaceChildren(new Option('No disponible', ''));
    setBusy(false);
    const errors = [];
    if (versionsResult.status === 'rejected') errors.push(`No se pudieron consultar las versiones: ${versionsResult.reason.message}`);
    if (settingsResult.status === 'rejected') errors.push(`No se pudo leer la versión actual: ${settingsResult.reason.message}`);
    showStatus(errors.join(' '));
  }
  // Do not change Holyrics on page load: 1 is the default for the next projection.
  const ready = load().catch(error => {
    versionSelect.dataset.unavailable = 'true';
    versionSelect.replaceChildren(new Option('No disponible', ''));
    setBusy(false);
    showStatus(`No se pudieron cargar los ajustes de Biblia: ${error.message}`);
  });
  return { ready, getOptions: () => ({ show_x_verses: count, ...(version ? { version } : {}) }) };
}
