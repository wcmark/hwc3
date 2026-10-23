import { holyrics, toast } from './core.js';
import { buildSlideModel, imageUrl, presentationKey, slideSignature } from './playlist-slide-model.js';

const toggle = document.querySelector('#togglePlaylistSlides');
const panel = document.querySelector('#playlistSlides');
const grid = document.querySelector('#playlistSlidesGrid');
const sectionBar = document.querySelector('#playlistSections');
const message = document.querySelector('#playlistSlidesMessage');
const title = document.querySelector('#playlistSlidesName');
const position = document.querySelector('#playlistSlidePosition');
const toolbar = document.querySelector('.playlist-controls');
let expanded = false, stopped = false, navigating = false;
let generation = 0, timer, pending = null, refreshAgain = false;
let current = null, model = null, rendered = '', metadataKey = '', metadataTime = 0;
let definitions = [], song = null;
let previewSignature = '', previewTime = 0;
let previews = new Map();
let selectedOccurrence = -1;

new ResizeObserver(() => {
  document.documentElement.style.setProperty('--playlist-tools-height', `${toolbar.getBoundingClientRect().height}px`);
}).observe(toolbar);

new ResizeObserver(() => {
  document.documentElement.style.setProperty('--playlist-sections-height', `${sectionBar.getBoundingClientRect().height}px`);
}).observe(sectionBar);

let fitFrame;
function scheduleTextFit() {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    if (!expanded || panel.hidden) return;
    grid.querySelectorAll('.playlist-slide-copy').forEach(text => {
      if (!text.clientWidth || !text.clientHeight) return;
      // Absolute positioning keeps the card size independent of its text.
      let low = 4, high = Math.max(low, Math.floor((text.clientHeight - 14) / 1.2));
      let best = low;
      text.style.overflow = 'hidden';
      while (low <= high) {
        const size = Math.floor((low + high) / 2);
        text.style.fontSize = `${size}px`;
        if (text.scrollHeight <= text.clientHeight && text.scrollWidth <= text.clientWidth) {
          best = size; low = size + 1;
        } else high = size - 1;
      }
      text.style.fontSize = `${best}px`;
      text.style.overflow = 'auto';
    });
  });
}
new ResizeObserver(scheduleTextFit).observe(grid);
document.fonts?.ready.then(scheduleTextFit);

const active = () => expanded && !document.hidden && !stopped;
const fresh = epoch => active() && epoch === generation;
function showMessage(text = '') { message.textContent = text; message.hidden = !text; }
function sectionColors(node, section) {
  if (section.bg) node.style.setProperty('--section-bg', section.bg);
  if (section.fg) node.style.setProperty('--section-fg', section.fg);
}
function clearPresentation(text) {
  current = null; model = null; rendered = '';
  grid.replaceChildren(); sectionBar.replaceChildren(); sectionBar.hidden = true;
  title.textContent = ''; position.textContent = '';
  showMessage(text);
}
function setBusy() {
  [...grid.querySelectorAll('button'), ...sectionBar.querySelectorAll('button')].forEach(button => { button.disabled = navigating; });
}
function updateActive() {
  if (!current || !model) return;
  const number = Number(current.slide_number);
  grid.querySelectorAll('[data-slide-number]').forEach(button => {
    const selected = Number(button.dataset.slideNumber) === number;
    button.classList.toggle('is-active', selected);
    if (selected) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  const possible = model.sections.map((section, index) => section.numbers.includes(number) ? index : -1).filter(index => index >= 0);
  // If the API returns original indices, repeated sections share a target.
  // Retain the occurrence explicitly chosen by the operator when possible.
  if (!possible.includes(selectedOccurrence)) selectedOccurrence = possible[0] ?? -1;
  sectionBar.querySelectorAll('[data-section-index]').forEach(button => {
    const selected = Number(button.dataset.sectionIndex) === selectedOccurrence;
    button.classList.toggle('is-active', selected);
    if (selected) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  const total = Number(current.total_slides) || model.cards.length;
  position.textContent = Number.isInteger(number) && number >= 1 && number <= total ? `${number} de ${total}` : '';
}
function updateImages() {
  if (model?.isSong) return;
  grid.querySelectorAll('[data-slide-number]').forEach(button => {
    const url = previews.get(Number(button.dataset.slideNumber));
    if (!url) return;
    const body = button.querySelector('.playlist-slide-body');
    const existing = body.querySelector('img');
    if (existing?.getAttribute('src') === url) return;
    const image = document.createElement('img');
    image.className = 'playlist-slide-image'; image.alt = ''; image.src = url; image.loading = 'lazy';
    body.replaceChildren(image);
  });
}
function render(data) {
  const nextModel = buildSlideModel(data, song, definitions);
  const signature = JSON.stringify([presentationKey(data), nextModel]);
  current = data;
  model = nextModel;
  title.textContent = data.name || 'Presentación actual';
  if (signature !== rendered) {
    const focusedSlide = grid.contains(document.activeElement) ? document.activeElement.dataset.slideNumber : null;
    const focusedSection = sectionBar.contains(document.activeElement) ? document.activeElement.dataset.sectionIndex : null;
    rendered = signature;
    const key = presentationKey(data);
    grid.replaceChildren(...model.cards.map(card => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'playlist-slide'; button.dataset.slideNumber = String(card.number);
      button.setAttribute('aria-label', `Ir a la diapositiva ${card.number}${card.badge ? ` · ${card.badge.name}` : ''}`);
      const body = document.createElement('div'); body.className = 'playlist-slide-body';
      const text = document.createElement('p');
      text.className = card.text ? 'playlist-slide-copy' : 'playlist-slide-placeholder';
      text.textContent = card.text || (model.isSong ? 'Sin texto' : 'Vista previa no disponible');
      body.append(text);
      const footer = document.createElement('span'); footer.className = 'playlist-slide-footer';
      const number = document.createElement('span'); number.className = 'playlist-slide-number'; number.textContent = String(card.number);
      footer.append(number);
      if (card.badge) {
        const badge = document.createElement('span'); badge.className = 'playlist-slide-badge';
        badge.textContent = card.badge.tag; badge.title = card.badge.name; sectionColors(badge, card.badge);
        footer.append(badge);
      }
      button.append(body, footer);
      button.addEventListener('click', () => jump(card.number, key));
      return button;
    }));
    sectionBar.replaceChildren(...model.sections.map((section, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'playlist-section';
      button.dataset.sectionIndex = String(index); sectionColors(button, section);
      const label = document.createElement('span'); label.textContent = section.tag; button.append(label);
      if (section.repeats > 1) {
        const repeat = document.createElement('small'); repeat.textContent = `${section.occurrence}/${section.repeats}`; button.append(repeat);
      }
      button.title = `${section.name}${section.repeats > 1 ? ` · aparición ${section.occurrence} de ${section.repeats}` : ''} · diapositiva ${section.target}`;
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => jump(section.target, key, index));
      return button;
    }));
    sectionBar.hidden = !model.sections.length;
    if (focusedSlide) [...grid.children].find(button => button.dataset.slideNumber === focusedSlide)?.focus({ preventScroll: true });
    if (focusedSection) [...sectionBar.children].find(button => button.dataset.sectionIndex === focusedSection)?.focus({ preventScroll: true });
    scheduleTextFit();
  }
  updateImages(); updateActive(); setBusy();
}

async function jump(number, key, occurrence = -1) {
  if (navigating || !active()) return;
  navigating = true;
  generation++;
  setBusy(); showMessage();
  try {
    // Do not send a stale slide button to a different presentation.
    const { data } = await holyrics('GetCurrentPresentation');
    if (presentationKey(data) !== key || number > Number(data?.total_slides)) {
      showMessage('La presentación cambió. Actualizando diapositivas…');
      return;
    }
    await holyrics('ActionGoToIndex', { index: number - 1 });
    selectedOccurrence = occurrence;
  } catch (error) { toast(`No se pudo cambiar de diapositiva: ${error.message}`, true); }
  finally { navigating = false; setBusy(); refreshCurrentSlides(); }
}

async function update(epoch) {
  const response = await holyrics('GetCurrentPresentation', { include_slides: true, include_slide_comment: true });
  if (!fresh(epoch)) return;
  const data = response.data;
  if (!data) { clearPresentation('No hay una presentación activa.'); return; }
  const key = presentationKey(data);
  if (presentationKey(current) !== key) {
    previews = new Map(); previewSignature = ''; previewTime = 0;
    selectedOccurrence = -1; song = null; definitions = []; metadataKey = ''; metadataTime = 0;
    // Remove the previous presentation immediately while new metadata loads.
    clearPresentation('Cargando diapositivas…');
  }
  let note = '';
  if (data.type === 'song' && (metadataKey !== key || Date.now() - metadataTime > 15000)) {
    const [descriptionsResult, songResult] = await Promise.allSettled([
      holyrics('GetSlideDescriptions'),
      holyrics('GetLyrics', { id: String(data.song_id ?? data.id), fields: 'id,slides,order' })
    ]);
    if (!fresh(epoch)) return;
    if (descriptionsResult.status === 'fulfilled') definitions = Array.isArray(descriptionsResult.value.data) ? descriptionsResult.value.data : [];
    if (songResult.status === 'fulfilled') song = songResult.value.data;
    metadataKey = key; metadataTime = Date.now();
    if (descriptionsResult.status === 'rejected' || songResult.status === 'rejected') note = 'No se pudieron consultar todos los colores o repeticiones de la canción.';
  }
  const signature = slideSignature(data);
  if (previewSignature !== signature) previews = new Map();
  render(data);
  if (!model.cards.length) note = data.type === 'verse'
    ? 'Holyrics no entrega la lista de diapositivas para los versículos. Podés controlarlos desde Biblia.'
    : 'Holyrics no entregó diapositivas para esta presentación.';
  showMessage(note);
  if (data.type !== 'song' && model.cards.length && (previewSignature !== signature || Date.now() - previewTime > 15000)) {
    try {
      const fullResponse = await holyrics('GetCurrentPresentation', {
        include_slides: true, include_slide_comment: true, include_slide_preview: true, slide_preview_size: '320x180'
      });
      if (!fresh(epoch)) return;
      if (slideSignature(fullResponse.data) !== signature) { refreshAgain = true; return; }
      previews = new Map();
      for (const [index, slide] of (fullResponse.data?.slides ?? []).entries()) {
        const url = imageUrl(slide.preview);
        if (url) previews.set(Number(slide.number) || index + 1, url);
      }
      previewSignature = signature; previewTime = Date.now();
      current = fullResponse.data;
      updateImages(); updateActive();
    } catch {
      if (fresh(epoch)) {
        previewSignature = signature; previewTime = Date.now();
        showMessage('No se pudieron cargar las miniaturas. Podés usar los números de diapositiva.');
      }
    }
  }
}

export function refreshCurrentSlides() {
  clearTimeout(timer);
  if (!active() || navigating) return Promise.resolve();
  if (pending) { refreshAgain = true; return pending; }
  const epoch = generation;
  pending = update(epoch).catch(error => {
    if (fresh(epoch)) clearPresentation(`No se pudo consultar la presentación: ${error.message}`);
  }).finally(() => {
    pending = null;
    if (active()) timer = setTimeout(refreshCurrentSlides, refreshAgain ? 0 : 1000);
    refreshAgain = false;
  });
  return pending;
}

toggle.addEventListener('click', () => {
  expanded = !expanded;
  generation++;
  panel.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
  const label = expanded ? 'Ocultar diapositivas' : 'Mostrar diapositivas';
  toggle.setAttribute('aria-label', label); toggle.title = label;
  if (expanded) {
    // Refresh immediately on every opening; the panel never persists as expanded.
    metadataTime = 0; previewTime = 0;
    clearPresentation('Cargando diapositivas…');
    refreshCurrentSlides();
  } else clearTimeout(timer);
});
document.addEventListener('visibilitychange', () => {
  generation++;
  if (document.hidden) clearTimeout(timer);
  else refreshCurrentSlides();
});
window.addEventListener('pagehide', () => { stopped = true; generation++; clearTimeout(timer); });
window.addEventListener('pageshow', () => { stopped = false; refreshCurrentSlides(); });
