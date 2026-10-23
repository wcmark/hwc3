const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const sameText = (a, b) => String(a).replace(/\s+/g, ' ').trim() === String(b).replace(/\s+/g, ' ').trim();
const color = value => /^#?[\da-f]{6}$/i.test(String(value ?? '')) ? `#${String(value).replace(/^#/, '')}` : null;

function content(slide) {
  const raw = String(slide?.text ?? '');
  const marker = raw.match(/^[ \t]*##\(([^)\r\n]+)\)/m)?.[1]?.trim() ?? '';
  const text = raw.replace(/^[ \t]*##\([^)\r\n]+\)[ \t]*(?:\r?\n)?/gm, '').trim();
  return { text, marker, description: String(slide?.slide_description ?? '').trim() };
}

export function presentationKey(data) {
  return data ? JSON.stringify([data.type, data.id, data.song_id, data.name]) : '';
}

export function slideSignature(data) {
  return JSON.stringify([presentationKey(data), data?.total_slides,
    data?.slides?.map(slide => [slide.number, slide.text, slide.slide_description])]);
}

export function imageUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(value)) return value;
  if (/^[A-Za-z0-9+/=\s]+$/.test(value)) return `data:image/png;base64,${value}`;
  return '';
}

export function buildSlideModel(data, song, definitions = []) {
  const isSong = data.type === 'song';
  const total = Number(data.total_slides);
  const supplied = Array.isArray(data.slides) ? data.slides : [];
  const live = supplied.length ? supplied : Number.isInteger(total) && total > 0 && total <= 5000
    ? Array.from({ length: total }, (_, index) => ({ number: index + 1, text: '' })) : [];
  const source = isSong && Array.isArray(song?.slides) ? song.slides.map(content) : [];
  const resolveSection = name => {
    const definition = definitions.find(item => [item.name, item.tag, ...(item.aliases ?? [])].some(alias => normalize(alias) === normalize(name)));
    return {
      key: normalize(definition?.name || name), name: definition?.name || name,
      tag: definition?.tag || name, bg: color(definition?.bg_color), fg: color(definition?.font_color)
    };
  };
  let inherited = null, previousSourceLabel = '';
  source.forEach(item => {
    const name = item.description || item.marker;
    const section = name ? resolveSection(name) : inherited;
    item.start = Boolean(section && (!inherited || section.key !== inherited.key || item.marker || (name && !previousSourceLabel)));
    item.section = section;
    inherited = section;
    previousSourceLabel = name;
  });
  const parsedOrder = String(song?.order ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const order = parsedOrder.length && parsedOrder.every(value => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= source.length)
    ? parsedOrder.map(value => Number(value) - 1) : [];
  const matches = indices => indices.length === live.length && indices.every((index, position) => sameText(source[index].text, content(live[position]).text));
  const originalIndices = source.map((_, index) => index);
  const matchesOriginal = source.length > 0 && matches(originalIndices);
  const aligned = order.length && matches(order) ? order : matchesOriginal ? originalIndices : null;
  const cards = [];
  let sections = [];
  let activeSection = null, previousRaw = '';
  live.forEach((slide, position) => {
    const parsed = content(slide);
    const raw = parsed.description || parsed.marker;
    let sourceIndex = aligned?.[position] ?? -1;
    if (sourceIndex < 0 && parsed.text) {
      const candidates = source.map((item, index) => sameText(item.text, parsed.text) ? index : -1).filter(index => index >= 0);
      if (candidates.length === 1) sourceIndex = candidates[0];
    }
    const sourceItem = source[sourceIndex];
    const section = isSong ? raw ? resolveSection(raw) : sourceItem?.section ?? activeSection : null;
    const starts = Boolean(section && (!activeSection || activeSection.key !== section.key || parsed.marker
      || (raw && !previousRaw && !sourceItem)
      || sourceItem?.start));
    const number = Number.isInteger(slide.number) && slide.number > 0 ? slide.number : position + 1;
    const card = { number, text: parsed.text, badge: starts ? section : null };
    cards.push(card);
    if (starts) sections.push({ ...section, target: number, numbers: [] });
    if (section && sections.length) sections.at(-1).numbers.push(number);
    activeSection = section;
    previousRaw = raw;
  });
  // Some versions expose the original slides instead of the expanded song order.
  // Keep real slide targets while showing each configured repeat in the section bar.
  if (isSong && matchesOriginal && order.length && (order.length !== source.length || !order.every((value, index) => value === index))) {
    const orderedSections = [];
    let previousSection = null;
    for (const index of order) {
      const item = source[index], section = item.section;
      if (section && (!previousSection || section.key !== previousSection.key || item.start)) {
        orderedSections.push({ ...section, target: cards[index].number, numbers: [] });
      }
      if (section && orderedSections.length) orderedSections.at(-1).numbers.push(cards[index].number);
      previousSection = section;
    }
    if (orderedSections.length) sections = orderedSections;
  }
  const totals = new Map(), seen = new Map();
  sections.forEach(section => totals.set(section.key, (totals.get(section.key) || 0) + 1));
  sections.forEach(section => {
    section.occurrence = (seen.get(section.key) || 0) + 1;
    section.repeats = totals.get(section.key);
    seen.set(section.key, section.occurrence);
  });
  return { isSong, cards, sections, previewsAvailable: supplied.length > 0 };
}
