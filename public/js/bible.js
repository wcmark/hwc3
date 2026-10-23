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
    // Retain the mode of the verse actually sent, even if the checkbox changed.
    if (verseSession?.quick ?? document.querySelector('#quickMode').checked) {
      await holyrics('CloseCurrentQuickPresentation');
    } else {
      const current = await holyrics('GetCurrentPresentation');
      if (current.data?.type !== 'verse') return;
      await holyrics('CloseCurrentPresentation');
    }
    verseSession = null;
    selectButton(versesNode.children, null);
    projectionStatus.textContent = 'Versículo cerrado.';
  });
}
document.querySelector('#closeVerse').addEventListener('click', closeVerse);
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
  if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'Escape') closeVerse();
  else moveVerse(event.key === 'ArrowRight' ? 1 : -1);
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
  // Read the actual live verse, including changes made directly in Holyrics.
  // A quick verse may be covering a song; never change that underlying song.
  const [quickResult, mainResult] = await Promise.allSettled([
    holyrics('GetCurrentQuickPresentation'), holyrics('GetCurrentPresentation')
  ]);
  const quickData = quickResult.status === 'fulfilled' ? quickResult.value.data : null;
  const mainData = mainResult.status === 'fulfilled' ? mainResult.value.data : null;
  const quick = Boolean(quickData?.id);
  const data = quick ? quickData : mainData?.type === 'verse' ? mainData : null;
  if (!data) {
    if (quickResult.status === 'rejected' && verseSession?.quick) throw quickResult.reason;
    if (mainResult.status === 'rejected') throw mainResult.reason;
    verseSession = null;
    selectButton(versesNode.children, null);
    return;
  }
  const id = String(data.id);
  if (!/^\d{8}$/.test(id)) throw new Error('Holyrics no entregó una referencia válida del versículo activo.');
  const book = books.find(item => Number(item.number) === Number(id.slice(0, 2)));
  const chapter = Number(id.slice(2, 5));
  const rows = (book?.content ?? []).filter(row => Number(row.chapter) === chapter).sort((a, b) => Number(a.verse) - Number(b.verse));
  const index = rows.findIndex(row => Number(row.verse) === Number(id.slice(5)));
  if (!book || index < 0) throw new Error('El pasaje activo no está disponible en la Biblia local.');
  await presentVerse({ book, chapter, rows, index, quick }, { scroll: false });
}
const controls = initBibleControls({ enqueue, onChange: refreshDisplayedVerse });
const booksReady = loadBooks();
