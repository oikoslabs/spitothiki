// v1.9.45: a small search field for long lists (Μικροέξοδα, Μετακινήσεις, Αποδείξεις, Λίστα αγορών).
// Filters the rows already on screen, by word or amount; Greek accents and case don't matter.

export function normalizeQuery(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/ς/g, 'σ')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/(\d),(?=\d)/g, '$1.') // 7,50 → 7.50 (amounts match with comma or dot)
    .replace(/\s+/g, ' ').trim();
}

// Every word of the query must appear in the text («ταξι 9» finds «Ταξί … 9,00 €»).
export function matchesQuery(text, query) {
  const q = normalizeQuery(query);
  if (!q) return true;
  const hay = normalizeQuery(text);
  return q.split(' ').every((word) => hay.includes(word));
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// target = id of the element whose children are the rows.
export function searchFieldHtml(target, value = '', label = 'Αναζήτηση στη λίστα') {
  return `<div class="list-search" data-list-search-box="${esc(target)}"><input class="search-input list-search-input" type="search" data-list-search="${esc(target)}" value="${esc(value)}" placeholder="🔍 Αναζήτηση…" aria-label="${esc(label)}" autocomplete="off" enterkeyhint="search"><button class="icon-button list-search-clear" type="button" data-list-search-clear="${esc(target)}" aria-label="Καθαρισμός αναζήτησης" ${value ? '' : 'hidden'}>✕</button></div>
    <p class="subtle-empty list-search-empty" data-list-search-empty="${esc(target)}" hidden>Δεν βρέθηκε τίποτα</p>`;
}

// Shows only the rows that match; headings (e.g. aisles) hide while searching. Returns how many rows show.
export function filterRows(container, query) {
  if (!container) return 0;
  const searching = Boolean(normalizeQuery(query));
  let shown = 0;
  for (const row of container.children) {
    if (row.matches?.('.aisle-heading')) { row.hidden = searching; continue; }
    const ok = matchesQuery(row.dataset?.search || row.textContent || '', query);
    row.hidden = !ok;
    if (ok) shown += 1;
  }
  return shown;
}
