import { holyrics, toast } from './core.js';
import { initBibleSearch } from './bible-search.js';
import { refreshCurrentSlides } from './playlist-slides.js';

const keys = {
  ArrowLeft: 'ActionPrevious', ArrowRight: 'ActionNext', Escape: 'CloseCurrentPresentation',
  F8: 'ToggleF8', F9: 'ToggleF9', F10: 'ToggleF10'
};
const quickActions = {
  ActionPrevious: 'ActionPreviousQuickPresentation', ActionNext: 'ActionNextQuickPresentation',
  CloseCurrentPresentation: 'CloseCurrentQuickPresentation'
};

export function initPresentationControls(onChange = () => {}) {
  let queue = Promise.resolve(), verseSession = null;
  function enqueue(operation) {
    queue = queue.then(operation).catch(error => toast(error.message, true));
    return queue;
  }
  const verseId = (book, chapter, verse) => String(book.number).padStart(2, '0') +
    String(chapter).padStart(3, '0') + String(verse).padStart(3, '0');
  async function present(session) {
    const ids = session.rows.slice(session.index, session.index + 100)
      .map(row => verseId(session.book, session.chapter, row.verse));
    await holyrics('ShowVerse', { ids, quick_presentation: true, show_x_verses: 1 });
    verseSession = session;
  }
  async function runAction(action) {
    if (quickActions[action]) {
      // A quick verse overlays a song: Esc and arrows must operate on that overlay.
      const { data } = await holyrics('GetCurrentQuickPresentation').catch(error => {
        if (verseSession) throw error;
        return { data: null };
      });
      if (data?.id) {
        if (action === 'CloseCurrentPresentation') {
          await holyrics('CloseCurrentQuickPresentation');
          verseSession = null;
        } else {
          const index = verseSession?.rows.findIndex(row =>
            verseId(verseSession.book, verseSession.chapter, row.verse) === String(data.id));
          if (index != null && index >= 0) {
            const next = index + (action === 'ActionNext' ? 1 : -1);
            if (next >= 0 && next < verseSession.rows.length) await present({ ...verseSession, index: next });
          } else await holyrics(quickActions[action]);
        }
        return;
      }
      verseSession = null;
    }
    await holyrics(action);
    onChange();
    refreshCurrentSlides();
  }
  document.querySelectorAll('.playlist-controls [data-action]').forEach(button => {
    button.addEventListener('click', () => enqueue(() => runAction(button.dataset.action)));
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing) return;
    if (event.target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    enqueue(() => runAction(action));
  });

  document.body.insertAdjacentHTML('beforeend', `<dialog id="bibleSearchDialog" class="bible-dialog bible-search-dialog" aria-labelledby="bibleSearchTitle">
    <div class="bible-dialog-header"><h2 id="bibleSearchTitle">Presentación rápida · Buscar pasaje</h2><button id="closeBibleSearch" class="btn secondary" type="button" title="Cancelar búsqueda (Esc)" aria-label="Cancelar búsqueda">×</button></div>
    <div class="bible-search-body"><div class="bible-search-fields">
      <label class="field"><span>Libro</span><input id="searchBook" class="control" autocomplete="off" spellcheck="false" placeholder="Ej.: ge" aria-controls="bibleSearchResults" autofocus></label>
      <label class="field"><span>Capítulo</span><input id="searchChapter" class="control" inputmode="numeric" autocomplete="off" aria-controls="bibleSearchResults" disabled></label>
      <label class="field"><span>Versículo</span><input id="searchVerse" class="control" inputmode="numeric" autocomplete="off" aria-controls="bibleSearchResults" disabled></label>
    </div><p id="bibleSearchHint" class="bible-search-hint" role="status" aria-live="polite"></p><div id="bibleSearchResults" class="bible-search-results"></div>
    <p class="muted tiny">Tab o Enter confirma el número escrito. Al elegir el versículo se proyecta de inmediato. Esc cancela.</p></div>
  </dialog>`);
  async function loadSearch() {
    const response = await fetch('/public/data/bible.json');
    if (!response.ok) throw new Error('No se pudo cargar la Biblia para la búsqueda rápida.');
    const { books } = await response.json();
    initBibleSearch({
      books: books.sort((a, b) => Number(a.number) - Number(b.number)),
      bookName: book => book.name.replace(/(^|\s)\p{L}/gu, letter => letter.toLocaleUpperCase('es')),
      onSelect: ({ book, chapter, verse }) => enqueue(async () => {
        const rows = book.content.filter(row => Number(row.chapter) === chapter)
          .sort((a, b) => Number(a.verse) - Number(b.verse));
        const index = rows.findIndex(row => Number(row.verse) === verse);
        if (index >= 0) await present({ book, chapter, rows, index });
      })
    });
  }
  loadSearch().catch(error => toast(error.message, true));
}
