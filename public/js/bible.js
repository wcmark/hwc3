import { holyrics, initShell, toast } from './core.js';
import { initBibleControls } from './bible-controls.js';
import { initBibleSearch } from './bible-search.js';

initShell('/biblia');
const chaptersNode = document.querySelector('#chapters');
const versesNode = document.querySelector('#verses');
const reference = document.querySelector('#reference');
const projectionStatus = document.querySelector('#projectionStatus');
const bookButtons = [];
let books = [];
let selectedBook = null;
let selectedChapter = null;
let verseSession = null;
let liveVerse = null;
let actionQueue = Promise.resolve();
const measure = document.createElement('canvas').getContext('2d');
const toolbar = document.querySelector('#bibleToolbar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bible-toolbar-height', `${toolbar.getBoundingClientRect().height + 12}px`);
}).observe(toolbar);
const scrollBehavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
function scrollToSection(node) {
  requestAnimationFrame(() => { if (!node.hidden) node.scrollIntoView({ block: 'start', behavior: scrollBehavior() }); });
}
function enqueue(action) {
  actionQueue = actionQueue.then(action).catch(error => { toast(error.message, true); });
  return actionQueue;
}

function showVerseClose(projected) {
  const visible = Boolean(projected);
  document.querySelector('#verseCloseBar').hidden = !visible;
  document.body.classList.toggle('bible-has-projection', visible);
  document.documentElement.style.setProperty('--verse-close-height', visible ? '44px' : '0px');
  document.querySelector('#closeVerse').title = `Cerrar versículo ${projected?.quick ? 'en presentación rápida' : 'en presentación normal'} (Esc)`;
}
async function readProjectedVerse() {
  const [quickResult, mainResult] = await Promise.all([
    holyrics('GetCurrentQuickPresentation'), holyrics('GetCurrentPresentation')
  ]);
  if (quickResult.data?.id) return { quick: true, data: quickResult.data };
  if (mainResult.data?.type === 'verse') return { quick: false, data: mainResult.data };
  return null;
}
function syncProjectedVerse(projected) {
  liveVerse = projected;
  showVerseClose(projected);
  if (!projected) {
    verseSession = null;
    selectButton(versesNode.children, null);
    return;
  }
  const id = String(projected.data.id ?? '');
  const book = /^\d{8}$/.test(id) ? books.find(item => Number(item.number) === Number(id.slice(0, 2))) : null;
  const chapter = Number(id.slice(2, 5));
  const rows = (book?.content ?? []).filter(row => Number(row.chapter) === chapter).sort((a, b) => Number(a.verse) - Number(b.verse));
  const index = rows.findIndex(row => Number(row.verse) === Number(id.slice(5)));
  verseSession = book && index >= 0 ? { book, chapter, rows, index, quick: projected.quick } : null;
  selectButton(versesNode.children, null);
  updateVerseHighlight(false);
}

const groups = [
  [5, 'pentateuco'], [17, 'historicos'], [22, 'poeticos'], [39, 'profeticos'],
  [43, 'evangelios'], [44, 'hechos'], [65, 'epistolas'], [66, 'revelaciones']
];
function bookName(book) {
  return book.name.replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('es'));
}
function makeButton(text, className, label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => handler(button));
  return button;
}
function selectButton(buttons, selected) {
  for (const button of buttons) button.setAttribute('aria-pressed', String(button === selected));
}
function clearVerseSelection() {
  versesNode.replaceChildren();
  projectionStatus.textContent = '';
  document.querySelector('#versesSection').hidden = true;
}
function selectBook(book, button, scroll = true) {
  selectedBook = book;
  selectedChapter = null;
  selectButton(bookButtons, button);
  clearVerseSelection();
  reference.textContent = bookName(book);
  document.querySelector('#chaptersTitle').textContent = `${bookName(book)} · Capítulos`;
  const chapters = [...new Set(book.content.map(row => Number(row.chapter)))].sort((a, b) => a - b);
  chaptersNode.replaceChildren(...chapters.map(chapter => makeButton(
    String(chapter), 'bible-number', `${bookName(book)}, capítulo ${chapter}`,
    chapterButton => selectChapter(book, chapter, chapterButton)
  )));
  document.querySelector('#chaptersSection').hidden = !chapters.length;
  document.querySelector('.bible-passage').hidden = !chapters.length;
  if (scroll && chapters.length) scrollToSection(document.querySelector('#chaptersSection'));
}
function selectChapter(book, chapter, button, scroll = true) {
  selectedChapter = chapter;
  selectButton(chaptersNode.children, button);
  clearVerseSelection();
  reference.textContent = `${bookName(book)} ${chapter}`;
  const rows = book.content.filter(row => Number(row.chapter) === chapter)
    .sort((a, b) => Number(a.verse) - Number(b.verse));
  versesNode.replaceChildren(...rows.map((row, index) => {
    const node = makeButton(`${row.verse}. ${row.content}`, 'bible-verse', `${bookName(book)} ${chapter}:${row.verse}. ${row.content}`,
      () => {
        const quick = document.querySelector('#quickMode').checked;
        return enqueue(() => presentVerse({ book, chapter, rows, index, quick }));
      });
    node.dataset.verse = String(row.verse);
    return node;
  }));
  document.querySelector('#versesTitle').textContent = `${bookName(book)} ${chapter} · Versículos`;
  document.querySelector('#versesSection').hidden = !rows.length;
  updateVerseHighlight(false);
  if (scroll && rows.length) scrollToSection(document.querySelector('#versesSection'));
}
function verseId(book, chapter, row) {
  return String(book.number).padStart(2, '0') + String(chapter).padStart(3, '0') + String(row.verse).padStart(3, '0');
}
function updateVerseHighlight(scroll = true) {
  if (!verseSession || selectedBook !== verseSession.book || selectedChapter !== verseSession.chapter) return;
  const { book, chapter, rows, index } = verseSession;
  const button = [...versesNode.children].find(node => node.dataset.verse === String(rows[index].verse));
  const visibleRows = rows.slice(index, index + controls.getOptions().show_x_verses);
  const visibleNumbers = new Set(visibleRows.map(row => String(row.verse)));
  for (const node of versesNode.children) node.setAttribute('aria-pressed', String(visibleNumbers.has(node.dataset.verse)));
  const last = visibleRows.at(-1)?.verse;
  reference.textContent = `${bookName(book)} ${chapter}:${rows[index].verse}${visibleRows.length > 1 ? `–${last}` : ''}`;
  if (scroll) button?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
}
async function presentVerse(session, { scroll = true } = {}) {
  await controls.ready;
  const { book, chapter, rows, index, quick } = session;
  const row = rows[index];
  const label = `${bookName(book)} ${chapter}:${row.verse}`;
  if (selectedBook === book && selectedChapter === chapter) projectionStatus.textContent = `Enviando ${label}…`;
  // Holyrics accepts at most 100 verses per call. Keyboard navigation can continue
  // through the whole chapter by sending the remaining verses from its new position.
  const ids = rows.slice(index, index + 100).map(item => verseId(book, chapter, item));
  try {
    await holyrics('ShowVerse', { ids, quick_presentation: quick, ...controls.getOptions() });
    verseSession = session;
    liveVerse = { quick, data: { id: ids[0], type: 'verse' } };
    showVerseClose(liveVerse);
    updateVerseHighlight(scroll);
    if (selectedBook === book && selectedChapter === chapter) {
      projectionStatus.textContent = `${label} enviado a Holyrics.`;
    }
  } catch (error) {
    if (selectedBook === book && selectedChapter === chapter) projectionStatus.textContent = `No se pudo enviar ${label}.`;
    throw error;
  }
}
function moveVerse(direction) {
  return enqueue(async () => {
    if (!verseSession) return;
    const index = Math.max(0, verseSession.index + direction * controls.getOptions().show_x_verses);
    if (index === verseSession.index || index >= verseSession.rows.length) return;
    await presentVerse({ ...verseSession, index });
  });
}
function closeVerse() {
  return enqueue(async () => {
    const button = document.querySelector('#closeVerse');
    button.disabled = true;
    try {
      // Use live Holyrics state, never the checkbox or a stale local session.
      // A quick verse can overlay a song that must remain open.
      const projected = await readProjectedVerse();
      if (projected) await holyrics(projected.quick ? 'CloseCurrentQuickPresentation' : 'CloseCurrentPresentation');
      syncProjectedVerse(null);
      projectionStatus.textContent = 'Versículo cerrado.';
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
    } finally {
      button.disabled = false;
    }
  });
}
document.querySelector('#closeVerse').addEventListener('click', closeVerse);
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeVerse();
    return;
  }
  if (event.target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  moveVerse(event.key === 'ArrowRight' ? 1 : -1);
});

function fitBookNames() {
  if (!bookButtons.length || !measure) return;
  const style = getComputedStyle(bookButtons[0]);
  measure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  // Measure real glyphs, not ch units: seven wide letters must also fit.
  const minimum = Math.ceil(Math.max(...bookButtons.map(button => {
    const chars = Array.from(button.title);
    return measure.measureText(chars.length > 7 ? chars.slice(0, 7).join('') + '...' : button.title).width;
  })) + inset + 2);
  document.querySelector('.bible-books').style.setProperty('--book-min-width', `${minimum}px`);
  for (const button of bookButtons) {
    const chars = Array.from(button.title);
    const available = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    let count = chars.length;
    while (count > 7 && measure.measureText(chars.slice(0, count).join('') + (count < chars.length ? '...' : '')).width > available) count--;
    button.textContent = chars.slice(0, count).join('') + (count < chars.length ? '...' : '');
  }
}
let fitFrame;
const bookObserver = new ResizeObserver(() => {
  cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(fitBookNames);
});
async function loadBooks() {
  const status = document.querySelector('#booksStatus');
  try {
    const response = await fetch('/public/data/bible.json');
    if (!response.ok) throw new Error('No se pudo cargar bible.json.');
    const data = await response.json();
    if (!Array.isArray(data.books) || !data.books.length) throw new Error('No hay libros disponibles en bible.json.');
    books = [...data.books].sort((a, b) => Number(a.number) - Number(b.number));
    document.querySelector('#localBibleVersion').textContent = `Texto de lectura: ${data.version || 'Biblia local'}. La versión de la barra se aplica a la proyección.`;
    for (const book of books) {
      const number = Number(book.number);
      const group = groups.find(([last]) => number <= last)?.[1] ?? '';
      const button = makeButton(bookName(book), `bible-book ${group}`, bookName(book), node => selectBook(book, node));
      button.title = bookName(book);
      bookButtons.push(button);
      document.querySelector(number <= 39 ? '#oldTestamentBooks' : '#newTestamentBooks').append(button);
      bookObserver.observe(button);
    }
    status.hidden = true;
    fitBookNames();
    document.fonts?.ready.then(fitBookNames);
    initBibleSearch({ books, bookName, onSelect: ({ book, chapter, verse }) => {
      selectBook(book, bookButtons[books.indexOf(book)], false);
      const chapterButton = [...chaptersNode.children].find(node => Number(node.textContent) === chapter);
      selectChapter(book, chapter, chapterButton, false);
      const rows = book.content.filter(row => Number(row.chapter) === chapter).sort((a, b) => Number(a.verse) - Number(b.verse));
      const index = rows.findIndex(row => Number(row.verse) === verse);
      if (index < 0) return;
      scrollToSection(document.querySelector('#versesSection'));
      const quick = document.querySelector('#quickMode').checked;
      enqueue(() => presentVerse({ book, chapter, rows, index, quick }, { scroll: false }));
    } });
  } catch (error) { status.hidden = false; status.textContent = error.message; }
}
async function refreshDisplayedVerse() {
  await booksReady;
  const projected = await readProjectedVerse();
  syncProjectedVerse(projected);
  if (!projected) return;
  if (!verseSession) throw new Error('El pasaje activo no está disponible en la Biblia local.');
  await presentVerse(verseSession, { scroll: false });
}
const controls = initBibleControls({ enqueue, onChange: refreshDisplayedVerse });
const booksReady = loadBooks();
let pollingVerse = false;
function pollProjectedVerse() {
  if (pollingVerse || document.hidden) return;
  pollingVerse = true;
  // Share the action queue so an old poll cannot overwrite a completed close/show.
  enqueue(async () => {
    try {
      await booksReady;
      syncProjectedVerse(await readProjectedVerse());
    } catch {
      // Keep the last known state on connection errors; close checks it again.
    } finally { pollingVerse = false; }
  });
}
pollProjectedVerse();
setInterval(pollProjectedVerse, 1000);
document.addEventListener('visibilitychange', pollProjectedVerse);
