// Local chapter/verse lookup: typing never sends partial references to Holyrics.
export function initBibleSearch({ books, bookName, onSelect }) {
  const dialog = document.querySelector('#bibleSearchDialog');
  const fields = ['Book', 'Chapter', 'Verse'].map(name => document.querySelector(`#search${name}`));
  const results = document.querySelector('#bibleSearchResults');
  const hint = document.querySelector('#bibleSearchHint');
  let book = null, chapter = null, stage = 0;
  let matches = [];
  const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
  const chapters = () => [...new Set((book?.content ?? []).map(row => Number(row.chapter)))].sort((a, b) => a - b);
  const verses = () => (book?.content ?? []).filter(row => Number(row.chapter) === chapter).sort((a, b) => Number(a.verse) - Number(b.verse));
  function invalidate(from) {
    if (from === 0) book = null;
    if (from <= 1) chapter = null;
    for (let i = from + 1; i < fields.length; i++) { fields[i].value = ''; fields[i].disabled = true; }
  }
  function commit(value) {
    if (stage === 0) {
      invalidate(0);
      book = value;
      fields[0].value = bookName(book);
      fields[1].disabled = false;
      stage = 1;
      fields[1].focus();
    } else if (stage === 1) {
      invalidate(1);
      chapter = value;
      fields[1].value = String(chapter);
      fields[2].disabled = false;
      stage = 2;
      fields[2].focus();
    } else {
      // Closing first prevents a second input/Enter event from submitting again.
      const selection = { book, chapter, verse: Number(value.verse) };
      dialog.close();
      onSelect(selection);
      return;
    }
    render();
  }
  function render(autoAdvance = false) {
    const input = normalize(fields[stage].value);
    const available = stage === 0 ? books : stage === 1 ? chapters() : verses();
    matches = available.filter(item => {
      const name = stage === 0 ? normalize(bookName(item)) : String(stage === 1 ? item : item.verse);
      return name.startsWith(input);
    });
    if (autoAdvance && input && matches.length === 1) { commit(matches[0]); return; }
    const context = stage === 0 ? 'Escribí el nombre de un libro.'
      : stage === 1 ? `${bookName(book)} · ${available.length} capítulos.`
      : `${bookName(book)} ${chapter} · ${available.length} versículos.`;
    hint.textContent = context + (matches.length ? ` ${matches.length} coincidencias.` : ' Sin coincidencias.');
    results.classList.toggle('number-results', stage === 1);
    results.replaceChildren(...matches.map(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bible-search-result';
      button.textContent = stage === 0 ? bookName(item) : stage === 1 ? String(item) : `${item.verse}. ${item.content}`;
      button.addEventListener('click', () => commit(item));
      return button;
    }));
    results.scrollTop = 0;
  }
  fields.forEach((field, index) => {
    field.addEventListener('focus', () => { stage = index; render(); });
    const onInput = event => {
      if (event.isComposing) return;
      stage = index;
      invalidate(index);
      render(true);
    };
    field.addEventListener('input', onInput);
    field.addEventListener('compositionend', onInput);
    field.addEventListener('keydown', event => {
      if (event.isComposing || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (!['Tab', 'Enter'].includes(event.key)) return;
      const input = normalize(field.value);
      const exact = matches.find(item => normalize(stage === 0 ? bookName(item) : stage === 1 ? item : item.verse) === input);
      const selection = exact ?? (matches.length === 1 && input ? matches[0] : null);
      if (selection != null) { event.preventDefault(); commit(selection); }
      else if (event.key === 'Enter') event.preventDefault();
    });
  });
  const openButton = document.querySelector('#openBibleSearch');
  openButton.disabled = false;
  openButton.addEventListener('click', () => {
    stage = 0;
    fields[0].value = '';
    invalidate(0);
    dialog.showModal();
    fields[0].focus();
    render();
  });
  document.querySelector('#closeBibleSearch').addEventListener('click', () => dialog.close());
  // Native dialog cancel handles Escape without closing the projected verse.
}
