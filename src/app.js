import { MAX_QUANTITY, createPantryItem, createShoppingItem, expiringWithin, expiryStatus, expiryWarning, normalizeSearch, normalizeUnit, pantrySummary, receiveShoppingItem, returnShoppingItem, shoppingListText, syncShoppingWithItem, toggleShoppingItem } from './domain.js';
import { lookupBarcode, normalizeBarcode, startScanner } from './barcode.js';
import { authProviders, firebaseConfig } from './firebase-config.js';
import { loadState, parseBackup, saveState } from './storage.js';
import { fetchMealDbSuggestions, ingredientName, pantryIngredients, suggestBuiltin } from './recipes.js';
import { CATEGORIES, WASTE_REASONS, applyWaste, createStore, createWaste, groupByStore, monthKey, monthlySpending, moveCategory, purchaseFor, shiftMonth, storeOrder, wasteStats } from './features.js';
import { RECURRING_INTERVALS, applyRecurring, createRecurring, dueFromSnapshot, expirySnapshot, parseVoiceItems } from './features.js';
import { getLang, locale, setLang, t, translateDom, untranslatedGreek } from './i18n.js';

const viewRoot = document.querySelector('#view-content');
const itemDialog = document.querySelector('#item-dialog');
const confirmDialog = document.querySelector('#confirm-dialog');
const itemForm = document.querySelector('#item-form');
const backupFile = document.querySelector('#backup-file');
const toast = document.querySelector('#toast');

let state = loadState();
const VIEWS = ['overview', 'pantry', 'shopping', 'cook', 'insights', 'settings'];
let activeView = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let pantryQuery = '';
let pantryCategory = 'Όλα';
let toastTimer;
let confirmAction = null;

const CATEGORY_ICONS = {
  'Γαλακτοκομικά': '🥛', 'Φρούτα & λαχανικά': '🥬', 'Κρέας & ψάρι': '🍗',
  'Ξηρά τρόφιμα': '🌾', 'Κατεψυγμένα': '🧊', 'Ροφήματα': '☕',
  'Καθαριότητα': '🧽', 'Άλλο': '🧺'
};

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

function daysUntil(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const [ty, tm, td] = localDateKey().split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(ty, tm - 1, td);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.round((target - today) / 86_400_000);
}

function expiryLabel(value) {
  const status = expiryStatus(value, localDateKey());
  const days = daysUntil(value);
  if (status === 'none') return '';
  if (status === 'expired') return t('Έληξε {date}', { date: formatDate(value) });
  if (days === 0) return t('Λήγει σήμερα');
  if (days === 1) return t('Λήγει αύριο');
  if (status === 'soon') return t('Λήγει σε {days} ημέρες', { days });
  return t('Λήξη {date}', { date: formatDate(value) });
}

function showToast(message) {
  toast.textContent = t(message);
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function persist() {
  try {
    saveState(state);
    renderNavCounts();
    sync?.push();
    scheduleBackgroundSnapshot();
    return true;
  } catch {
    showToast('Δεν ήταν δυνατή η αποθήκευση στη συσκευή.');
    return false;
  }
}

function renderNavCounts() {
  document.querySelector('#nav-pantry-count').textContent = String(state.items.length);
  document.querySelector('#nav-shopping-count').textContent = String(state.shopping.filter((item) => !item.checked).length);
}

function pendingLabel(count) {
  return t(count === 1 ? '{count} εκκρεμές προϊόν' : '{count} εκκρεμή προϊόντα', { count });
}

function setActiveNavigation() {
  document.body.dataset.screen = activeView;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('is-active', active);
    if (button.classList.contains('nav-item')) {
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  });
}

function renderHeader(title, description, actionLabel = '') {
  return `<header class="page-heading"><div><p class="eyebrow">ΣΠΙΤΟΘΗΚΗ</p><h1>${title}</h1><p>${description}</p></div>${actionLabel ? `<button class="button button-primary" type="button" data-action="add-item"><span aria-hidden="true">＋</span>${actionLabel}</button>` : ''}</header>`;
}

function renderEmpty(title, description, action = 'add-item', label = 'Προσθήκη προϊόντος', emoji = '🧺') {
  return `<div class="empty-state"><span class="empty-art" aria-hidden="true">${emoji}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p><button class="button button-primary" type="button" data-action="${action}">${escapeHtml(label)}</button></div>`;
}

function renderExpiryPill(item) {
  if (!item.expiry) return '';
  const status = expiryStatus(item.expiry, localDateKey());
  const variant = status === 'expired' ? 'expired' : status === 'soon' ? '' : 'fresh';
  return `<span class="expiry-pill ${variant}">${status === 'expired' ? '!' : status === 'soon' ? '◷' : '✓'} ${escapeHtml(expiryLabel(item.expiry))}</span>`;
}

function renderMiniProduct(item) {
  const icon = CATEGORY_ICONS[item.category] || '🧺';
  return `<div class="product-row"><span class="product-emoji" aria-hidden="true">${icon}</span><div class="product-main"><strong class="product-name">${escapeHtml(item.name)}</strong><div class="product-detail"><span>${escapeHtml(t(item.category || 'Άλλο'))}</span>${renderExpiryPill(item)}</div></div><span class="quantity-chip">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</span></div>`;
}

function renderInventoryCard(item) {
  const icon = CATEGORY_ICONS[item.category] || '🧺';
  const location = item.location ? `<span class="meta-tag">${escapeHtml(t(item.location))}</span>` : '';
  const expiry = item.expiry ? `<span class="meta-tag">${escapeHtml(expiryLabel(item.expiry))}</span>` : '';
  const low = Number(item.minimum) > 0 && Number(item.quantity) <= Number(item.minimum);
  const lowTag = low ? '<span class="meta-tag low-stock-tag">Χαμηλό απόθεμα</span>' : '';
  return `<article class="inventory-card">
    <span class="product-emoji" aria-hidden="true">${icon}</span>
    <div class="product-main"><strong class="product-name">${escapeHtml(item.name)}</strong><div class="inventory-meta"><span class="meta-tag">${escapeHtml(t(item.category || 'Άλλο'))}</span>${location}${expiry}${lowTag}</div><span class="quantity-chip">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</span></div>
    <div class="card-actions">
      <button class="icon-button" type="button" data-action="adjust-quantity" data-id="${escapeHtml(item.id)}" data-delta="-1" aria-label="${escapeHtml(t('Μείωση ποσότητας για {name}', { name: item.name }))}">−</button>
      <button class="icon-button" type="button" data-action="adjust-quantity" data-id="${escapeHtml(item.id)}" data-delta="1" aria-label="${escapeHtml(t('Αύξηση ποσότητας για {name}', { name: item.name }))}">＋</button>
      <button class="icon-button" type="button" data-action="edit-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Επεξεργασία {name}', { name: item.name }))}">✎</button>
      <button class="icon-button" type="button" data-action="waste-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Πετάχτηκε: {name}', { name: item.name }))}" title="${escapeHtml(t('Πετάχτηκε: {name}', { name: item.name }))}">🗑</button>
      <button class="icon-button danger" type="button" data-action="delete-item" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: item.name }))}">×</button>
      <button class="button button-quiet small-action" type="button" data-action="add-to-shopping" data-id="${escapeHtml(item.id)}">Στη λίστα</button>
    </div>
  </article>`;
}

function renderOverview() {
  const summary = pantrySummary(state.items, localDateKey());
  const upcoming = state.items.filter((item) => ['soon', 'expired'].includes(expiryStatus(item.expiry, localDateKey())))
    .sort((a, b) => String(a.expiry).localeCompare(String(b.expiry))).slice(0, 4);
  const lowStock = state.items.filter((item) => Number(item.minimum) > 0 && Number(item.quantity) <= Number(item.minimum)).slice(0, 4);
  return `<section class="hero-panel"><div class="hero-copy"><p class="eyebrow">ΜΙΚΡΕΣ ΣΥΝΗΘΕΙΕΣ, ΠΙΟ ΗΡΕΜΟ ΣΠΙΤΙ</p><h1>Η κουζίνα σου,<br>με μια ματιά.</h1><p>Ξέρεις τι έχεις, τι τελειώνει και τι χρειάζεται να μπει στη λίστα.</p></div><div class="hero-illustration" aria-hidden="true"><span>🫒</span></div></section>
    <section class="stats-grid" aria-label="Σύνοψη αποθέματος">
      <article class="stat-card"><span class="stat-icon">🧺</span><div><strong>${summary.products}</strong><span>προϊόντα στο σπίτι</span></div></article>
      <article class="stat-card"><span class="stat-icon amber">◷</span><div><strong>${summary.expiringSoon + summary.expired}</strong><span>λήγουν ή έληξαν</span></div></article>
      <article class="stat-card"><span class="stat-icon blue">＋</span><div><strong>${summary.lowStock}</strong><span>χρειάζονται αναπλήρωση</span></div></article>
    </section>
    ${summary.expired ? `<div class="alert-banner" role="status">${t(summary.expired === 1 ? '⚠️ Έχεις {count} προϊόν που έχει λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.' : '⚠️ Έχεις {count} προϊόντα που έχουν λήξει. Έλεγξέ τα πριν τα χρησιμοποιήσεις.', { count: summary.expired })}</div>` : ''}
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-heading"><div><h2>Έλεγξε τις ημερομηνίες</h2><p>Ό,τι λήγει μέσα στις επόμενες 7 ημέρες</p></div><button class="panel-link" type="button" data-view="pantry">Όλο το απόθεμα →</button></div><div class="product-list">${upcoming.length ? upcoming.map(renderMiniProduct).join('') : renderEmpty('Όλα καλά εδώ', 'Δεν έχεις προϊόντα που λήγουν σύντομα.', 'add-item', 'Πρόσθεσε προϊόν', '🌿')}</div></section>
      <div class="dashboard-side"><section class="panel"><div class="panel-heading"><div><h2>Χρειάζονται αναπλήρωση</h2><p>Με βάση το ελάχιστο απόθεμα</p></div></div><div class="product-list">${lowStock.length ? lowStock.map(renderMiniProduct).join('') : `<p class="subtle-empty">${state.items.length ? 'Δεν υπάρχει κάτι που να χρειάζεται αναπλήρωση.' : 'Όταν προσθέσεις προϊόντα, θα τα βλέπεις εδώ.'}</p>`}</div>${lowStock.length ? '<button class="button button-quiet full-width" type="button" data-view="pantry">Δες το απόθεμα</button>' : ''}</section>
      <section class="panel quick-panel"><div class="panel-heading"><div><h2>Γρήγορες κινήσεις</h2><p>Τα βασικά, χωρίς ψάξιμο</p></div></div><div class="quick-actions"><button class="quick-action" type="button" data-action="add-item"><span class="quick-action-icon">＋</span><span><strong>Πρόσθεσε προϊόν</strong><small>Καταχώρισε κάτι που έφερες σπίτι</small></span><span class="arrow">›</span></button><button class="quick-action" type="button" data-view="cook"><span class="quick-action-icon">🍳</span><span><strong>Τι να μαγειρέψω;</strong><small>Ιδέες με ό,τι λήγει πρώτο</small></span><span class="arrow">›</span></button><button class="quick-action" type="button" data-view="shopping"><span class="quick-action-icon">✓</span><span><strong>Άνοιξε τη λίστα</strong><small>${t('{pending} για ψώνια', { pending: pendingLabel(state.shopping.filter((item) => !item.checked).length) })}</small></span><span class="arrow">›</span></button></div></section></div>
    </div>`;
}

function renderPantryList() {
  const list = document.querySelector('#inventory-list');
  const count = document.querySelector('#inventory-count');
  if (!list || !count) return;
  const q = normalizeSearch(pantryQuery.trim());
  const filtered = state.items.filter((item) => {
    const matchesText = !q || normalizeSearch(`${item.name} ${item.category} ${item.location} ${t(item.category)} ${t(item.location)}`).includes(q);
    const matchesCategory = pantryCategory === 'Όλα' || item.category === pantryCategory;
    return matchesText && matchesCategory;
  }).sort((a, b) => a.name.localeCompare(b.name, getLang()));
  count.textContent = t(filtered.length === 1 ? '{count} προϊόν' : '{count} προϊόντα', { count: filtered.length });
  list.innerHTML = filtered.length ? filtered.map(renderInventoryCard).join('') : renderEmpty(state.items.length ? 'Δεν βρήκα προϊόντα' : 'Το απόθεμα είναι άδειο', state.items.length ? 'Δοκίμασε άλλη αναζήτηση ή κατηγορία.' : 'Πρόσθεσε τα πρώτα προϊόντα που έχεις στο σπίτι.', state.items.length ? 'clear-filters' : 'add-item', state.items.length ? 'Καθαρισμός φίλτρων' : 'Προσθήκη προϊόντος');
  translateDom(list);
  translateDom(count);
}

function renderPantry() {
  const categories = ['Όλα', ...new Set(state.items.map((item) => item.category || 'Άλλο'))];
  return `${renderHeader('Το απόθεμά μου', 'Όσα έχεις στο σπίτι, οργανωμένα σε ένα σημείο.', 'Προσθήκη προϊόντος')}
    <section class="panel"><div class="toolbar"><label class="search-wrap"><span aria-hidden="true">⌕</span><input id="pantry-search" class="search-input" type="search" value="${escapeHtml(pantryQuery)}" placeholder="Αναζήτηση προϊόντος ή θέσης" aria-label="Αναζήτηση στο απόθεμα"></label><span class="inventory-count" id="inventory-count">${t('{count} προϊόντα', { count: state.items.length })}</span></div>
    <div class="filter-row" aria-label="Φίλτρο κατηγορίας">${categories.map((category) => `<button type="button" class="filter-chip ${pantryCategory === category ? 'is-active' : ''}" data-action="filter-category" data-category="${escapeHtml(category)}" aria-pressed="${pantryCategory === category}">${category === 'Όλα' ? '' : `<span aria-hidden="true">${CATEGORY_ICONS[category] || '🧺'}</span> `}${escapeHtml(category)}</button>`).join('')}</div>
    <div id="inventory-list" class="inventory-list"></div></section>`;
}

function renderShoppingRow(item) {
  return `<div class="shopping-row ${item.checked ? 'checked has-price' : ''}"><input class="shopping-check" type="checkbox" data-action="toggle-shopping" data-id="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''} aria-label="${escapeHtml(t(item.checked ? 'Ολοκληρώθηκε: {name}' : 'Σημείωση ως αγορασμένο: {name}', { name: item.name }))}"><div><strong class="shopping-row-name">${escapeHtml(item.name)}</strong><div class="shopping-row-detail">${escapeHtml(item.quantity)} ${escapeHtml(t(item.unit))}</div></div><span class="shopping-state">${item.checked ? (item.pantryAdded ? 'Μπήκε στο απόθεμα' : 'Μπήκε στο καλάθι') : ''}</span>${item.checked ? renderPriceField(item) : ''}<button class="icon-button danger" type="button" data-action="remove-shopping" data-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(t('Αφαίρεση {name} από τη λίστα', { name: item.name }))}">×</button></div>`;
}

function renderPriceField(row) {
  const purchase = (state.purchases || []).find((p) => p.id === `pur-${row.id}`);
  const label = t('Τιμή για {name}', { name: row.name });
  return `<label class="price-field" title="${escapeHtml(label)}"><span aria-hidden="true">€</span><input class="field-input price-input" type="number" inputmode="decimal" min="0" max="100000" step="0.01" data-id="${escapeHtml(row.id)}" value="${purchase ? escapeHtml(purchase.price) : ''}" placeholder="Τιμή" aria-label="${escapeHtml(label)}"></label>`;
}

const STORE_KEY = 'spitothiki:store';
let storesOpen = false;
const activeStore = () => { let id = ''; try { id = localStorage.getItem(STORE_KEY) || ''; } catch {} return (state.stores || []).find((store) => store.id === id) || null; };
const categoryLabel = (category) => `${CATEGORY_ICONS[category] || '🧺'} ${t(category)}`;

function renderStoreBar() {
  const current = activeStore();
  const stores = state.stores || [];
  const chip = (id, label, active) => `<button type="button" class="filter-chip ${active ? 'is-active' : ''}" data-action="set-store" data-store="${escapeHtml(id)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  const bar = `<div class="store-bar" role="group" aria-label="Σειρά λίστας ανά κατάστημα">${chip('', 'Χωρίς κατάστημα', !current)}${stores.map((store) => chip(store.id, store.name, current?.id === store.id)).join('')}<button type="button" class="panel-link" data-action="toggle-stores" aria-expanded="${storesOpen}">⚙ Καταστήματα</button></div>`;
  if (!storesOpen) return bar;
  const order = current ? storeOrder(current.order) : [];
  return `${bar}<div class="store-manager" id="store-manager"><form id="store-form" class="store-form" novalidate><input class="field-input" name="name" maxlength="40" placeholder="π.χ. Σουπερμάρκετ της γειτονιάς" aria-label="Όνομα καταστήματος"><button class="button button-quiet" type="submit">＋ Νέο κατάστημα</button></form>
    ${current ? `<p class="field-hint">${escapeHtml(t('Σειρά διαδρόμων στο «{name}»: βάλε τις κατηγορίες με τη σειρά που περπατάς.', { name: current.name }))}</p><ol class="aisle-list">${order.map((category, index) => `<li class="aisle-row"><span class="aisle-number">${index + 1}</span><span class="aisle-name">${escapeHtml(categoryLabel(category))}</span><button class="icon-button" type="button" data-action="aisle-up" data-category="${escapeHtml(category)}" ${index === 0 ? 'disabled' : ''} aria-label="${escapeHtml(t('Πιο νωρίς: {name}', { name: t(category) }))}">↑</button><button class="icon-button" type="button" data-action="aisle-down" data-category="${escapeHtml(category)}" ${index === order.length - 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('Πιο αργά: {name}', { name: t(category) }))}">↓</button></li>`).join('')}</ol>
    <div class="settings-actions"><button class="button button-quiet" type="button" data-action="delete-store">${escapeHtml(t('Διαγραφή καταστήματος «{name}»', { name: current.name }))}</button></div>` : '<p class="field-hint">Διάλεξε ή φτιάξε ένα κατάστημα για να ορίσεις τη σειρά των διαδρόμων.</p>'}</div>`;
}

function renderShoppingRows(pending, checked) {
  const store = activeStore();
  if (!store) return [...pending, ...checked].map(renderShoppingRow).join('');
  const groups = groupByStore(pending, store, state.items);
  return `${groups.map((group) => `<div class="aisle-heading"><span>${escapeHtml(t('Διάδρομος {n}', { n: group.aisle }))}</span> ${escapeHtml(categoryLabel(group.category))}</div>${group.rows.map(renderShoppingRow).join('')}`).join('')}${checked.length ? `<div class="aisle-heading">${escapeHtml(t('Στο καλάθι'))}</div>${checked.map(renderShoppingRow).join('')}` : ''}`;
}

function renderShopping() {
  const pending = state.shopping.filter((item) => !item.checked);
  const checked = state.shopping.filter((item) => item.checked);
  return `${renderHeader('Λίστα αγορών', 'Σημείωσε όσα χρειάζεσαι και πάρε τη λίστα μαζί σου.')}
    <div class="shopping-layout"><section class="panel"><div class="panel-heading"><div><h2>Τι χρειάζεται το σπίτι;</h2><p>${pending.length ? pendingLabel(pending.length) : 'Κανένα εκκρεμές προϊόν'}</p></div><div class="panel-links">${pending.length ? '<button class="panel-link" type="button" data-action="share-shopping">↗ Κοινοποίηση</button>' : ''}${checked.length ? '<button class="panel-link" type="button" data-action="clear-completed">Καθάρισε τα αγορασμένα</button>' : ''}</div></div>
    <form id="shopping-form" class="shopping-add-form shopping-main-form" novalidate><input class="field-input" name="name" required maxlength="80" placeholder="π.χ. Φέτα" aria-label="Προϊόν για αγορά"><input class="field-input" name="quantity" type="number" min="0.1" max="${MAX_QUANTITY}" step="0.1" value="1" aria-label="Ποσότητα"><select class="field-input unit-select" name="unit" aria-label="Μονάδα">${unitOptions()}</select><select class="field-input category-select" name="category" aria-label="Κατηγορία"><option value="">Κατηγορία: αυτόματα</option>${CATEGORIES.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</option>`).join('')}</select><button class="button button-primary" type="submit">＋ Προσθήκη</button>${SpeechRecognitionApi ? '<button class="button button-quiet voice-button" type="button" data-action="voice-add" aria-label="Προσθήκη με φωνή" title="Προσθήκη με φωνή">🎤</button>' : ''}</form>
    <p class="form-error" id="shopping-error" role="alert" hidden></p>
    ${renderStoreBar()}
    <div class="shopping-list">${state.shopping.length ? renderShoppingRows(pending, checked) : renderEmpty('Η λίστα είναι άδεια', 'Πρόσθεσε όσα χρειάζεσαι πριν πας για ψώνια.', 'focus-shopping', 'Γράψε το πρώτο προϊόν', '🛒')}</div></section>
    <aside class="panel shopping-summary"><span class="stat-icon">🛍️</span><h2>Μικρή υπενθύμιση</h2><p>Κράτησε τη λίστα απλή και πρόσθεσε μόνο ό,τι χρειάζεσαι.</p><div class="shopping-summary-list"><div class="summary-line"><span>Εκκρεμούν</span><strong>${pending.length}</strong></div><div class="summary-line"><span>Στο καλάθι</span><strong>${checked.length}</strong></div><div class="summary-line"><span>Στη συσκευή</span><strong>Ιδιωτικά</strong></div></div></aside></div>
    ${renderRecurringPanel()}`;
}

function renderSettings() {
  return `${renderHeader('Ρυθμίσεις', 'Διαχείριση και αντίγραφο ασφαλείας των δεδομένων σου.')}
    <div class="settings-grid"><section class="panel settings-card"><span class="stat-icon">🔒</span><h2>Απόρρητο πρώτα</h2><p>Το απόθεμα και η λίστα αγορών αποθηκεύονται στη συσκευή σου και η εφαρμογή δουλεύει και χωρίς internet. Αν συνδεθείς, συγχρονίζονται ιδιωτικά μέσω Firebase μόνο με τα μέλη του νοικοκυριού σου. Δεν υπάρχουν διαφημίσεις ούτε παρακολούθηση.</p><div class="privacy-note">Η αναζήτηση barcode στέλνει μόνο τον αριθμό του barcode στο Open Food Facts. Αν δεν έχεις συνδεθεί και καθαρίσεις τα δεδομένα του browser ή αλλάξεις συσκευή, χρησιμοποίησε αντίγραφο ασφαλείας.</div></section>
    <section class="panel settings-card"><span class="stat-icon">◐</span><h2>Εμφάνιση</h2><p>Διάλεξε φωτεινό ή σκούρο θέμα, ή άφησέ το να ακολουθεί τη συσκευή.</p><div class="theme-options" role="group" aria-label="Θέμα">${[['auto', 'Αυτόματο'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']].map(([value, label]) => `<button type="button" class="filter-chip ${currentTheme() === value ? 'is-active' : ''}" data-action="set-theme" data-theme="${value}" aria-pressed="${currentTheme() === value}">${label}</button>`).join('')}</div></section>
    ${renderLanguageCard()}
    ${renderSyncCard()}
    ${renderNotificationCard()}
    <section class="panel settings-card"><span class="stat-icon blue">↗</span><h2>Αντίγραφο ασφαλείας</h2><p>Εξήγαγε ή εισήγαγε ένα αρχείο JSON. Το αρχείο περιέχει τα προϊόντα και τη λίστα αγορών σου.</p><div class="settings-actions"><button class="button button-primary" type="button" data-action="export-backup">⬇ Εξαγωγή αντιγράφου</button><button class="button button-quiet" type="button" data-action="import-backup">⬆ Εισαγωγή αντιγράφου</button></div></section>
    <section class="panel settings-card"><span class="stat-icon amber">✨</span><h2>Δοκιμαστικά δεδομένα</h2><p>Γέμισε την εφαρμογή με ενδεικτικά προϊόντα για να δεις πώς λειτουργεί.</p><div class="settings-actions"><button class="button button-quiet" type="button" data-action="load-demo">Φόρτωση παραδειγμάτων</button></div></section>
    <section class="panel settings-card danger-zone"><span class="stat-icon" style="background:var(--red-soft)">⌫</span><h2>Καθαρισμός δεδομένων</h2><p>Διέγραψε όλα τα προϊόντα και τις λίστες από αυτή τη συσκευή.</p><div class="settings-actions"><button class="button button-danger" type="button" data-action="clear-data">Διαγραφή όλων</button></div></section></div>`;
}

function renderApp() {
  setActiveNavigation();
  renderNavCounts();
  if (activeView === 'overview') viewRoot.innerHTML = renderOverview();
  else if (activeView === 'pantry') viewRoot.innerHTML = renderPantry();
  else if (activeView === 'shopping') viewRoot.innerHTML = renderShopping();
  else if (activeView === 'insights') viewRoot.innerHTML = renderInsights();
  else if (activeView === 'cook') { viewRoot.innerHTML = renderCook(); loadOnlineRecipes(); }
  else viewRoot.innerHTML = renderSettings();
  if (activeView === 'pantry') renderPantryList();
  translateDom(viewRoot);
}

function navigate(view) {
  if (!VIEWS.includes(view)) return;
  activeView = view;
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
  pantryQuery = view === 'pantry' ? pantryQuery : '';
  renderApp();
  viewRoot.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openItemDialog(id = '') {
  itemForm.reset();
  document.querySelector('#form-error').hidden = true;
  const existing = state.items.find((item) => item.id === id);
  itemForm.elements.id.value = existing?.id || '';
  itemForm.elements.name.value = existing?.name || '';
  itemForm.elements.category.value = existing?.category || 'Άλλο';
  itemForm.elements.location.value = existing?.location || '';
  itemForm.elements.quantity.value = existing?.quantity ?? 1;
  itemForm.elements.unit.value = normalizeUnit(existing?.unit);
  updateNameCounter();
  updateExpiryWarning();
  itemForm.elements.minimum.value = existing?.minimum ?? 0;
  itemForm.elements.expiry.value = existing?.expiry || '';
  itemForm.elements.barcode.value = existing?.barcode || '';
  document.querySelector('#barcode-status').textContent = '';
  document.querySelector('#dialog-title').textContent = t(existing ? 'Επεξεργασία προϊόντος' : 'Νέο προϊόν');
  itemDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#item-name').focus());
}

function updateNameCounter() {
  const input = document.querySelector('#item-name');
  document.querySelector('#item-name-count').textContent = `${input.value.length}/${input.maxLength}`;
}

function updateExpiryWarning() {
  const warning = document.querySelector('#expiry-warning');
  warning.textContent = t(expiryWarning(itemForm.elements.expiry.value, localDateKey()));
  warning.hidden = !warning.textContent;
}

async function shareShoppingList() {
  const text = shoppingListText(state.shopping).split('\n').map((line, i) => i === 0 ? t(line) : line.replace(/ (\S+)$/, (m, unit) => ` ${t(unit)}`)).join('\n');
  if (!text) { showToast('Η λίστα δεν έχει εκκρεμή προϊόντα.'); return; }
  if (navigator.share) {
    try { await navigator.share({ title: t('Λίστα αγορών'), text }); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  const dialog = document.querySelector('#share-dialog');
  document.querySelector('#share-text').value = text;
  document.querySelector('#share-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  document.querySelector('#share-viber').href = `viber://forward?text=${encodeURIComponent(text)}`;
  dialog.showModal();
}

async function copyShareText() {
  const field = document.querySelector('#share-text');
  try { await navigator.clipboard.writeText(field.value); }
  catch { field.select(); document.execCommand('copy'); }
  showToast('Η λίστα αντιγράφηκε.');
}

let stopScanner = null;
let sync = null;
let syncStatus = { state: firebaseConfig ? 'loading' : 'disabled' };

const AUTH_ERRORS = {
  'auth/invalid-credential': 'Λάθος email ή κωδικός.', 'auth/wrong-password': 'Λάθος email ή κωδικός.', 'auth/user-not-found': 'Λάθος email ή κωδικός.',
  'auth/email-already-in-use': 'Υπάρχει ήδη λογαριασμός με αυτό το email.', 'auth/weak-password': 'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.',
  'auth/invalid-email': 'Το email δεν είναι σωστό.', 'auth/popup-closed-by-user': 'Η σύνδεση ακυρώθηκε.', 'auth/unauthorized-domain': 'Το domain δεν έχει εγκριθεί στο Firebase (Authorized domains).',
  'auth/operation-not-allowed': 'Αυτός ο τρόπος σύνδεσης δεν έχει ενεργοποιηθεί στο Firebase.', 'auth/network-request-failed': 'Χωρίς σύνδεση στο internet.',
  'permission-denied': 'Δεν επιτρέπεται (έλεγξε τον κωδικό πρόσκλησης ή τους κανόνες του Firestore).', 'not-found': 'Δεν βρέθηκε το νοικοκυριό.'
};
const authMessage = (error) => t(AUTH_ERRORS[error?.code] || error?.message || 'Κάτι πήγε στραβά.');

async function startSync() {
  if (!firebaseConfig) return;
  try {
    const { createFirebaseSync } = await import('./sync-firebase.js');
    sync = await createFirebaseSync({
      config: firebaseConfig,
      getState: () => state,
      setState: (next) => { state = next; try { saveState(state); } catch {} renderApp(); },
      onStatus: (status) => { syncStatus = status; if (activeView === 'settings') renderApp(); }
    });
  } catch {
    syncStatus = { state: 'error', message: navigator.onLine === false ? 'Χωρίς σύνδεση: ο συγχρονισμός θα ξεκινήσει όταν επιστρέψει το internet.' : 'Δεν φόρτωσε το Firebase.' };
    if (activeView === 'settings') renderApp();
  }
}

function renderSyncCard() {
  const status = syncStatus;
  const head = '<section class="panel settings-card sync-card" id="sync-card"><span class="stat-icon blue">⇅</span><h2>Συγχρονισμός συσκευών</h2>';
  if (status.state === 'disabled') {
    return `${head}<p>Ανενεργός. Για να μοιράζεσαι το απόθεμα και τη λίστα με άλλες συσκευές ή μέλη του σπιτιού, χρειάζεται ρύθμιση Firebase στο <code>src/firebase-config.js</code>.</p><p class="field-hint">Μέχρι τότε όλα μένουν μόνο σε αυτή τη συσκευή. Μπορείς να μεταφέρεις δεδομένα με το αντίγραφο ασφαλείας.</p></section>`;
  }
  if (status.state === 'loading' || status.state === 'connecting') return `${head}<p id="sync-status">Σύνδεση…</p></section>`;
  if (status.state === 'signed-out' || (status.state === 'error' && !status.user)) {
    return `${head}<p>Συνδέσου για να συγχρονίζονται το απόθεμα και η λίστα σε όλες τις συσκευές σου. Τα δεδομένα αυτής της συσκευής θα ενωθούν με όσα έχεις ήδη.</p>
      ${status.message ? `<p class="form-error" id="sync-status">${escapeHtml(t(status.message))}</p>` : '<p class="field-hint" id="sync-status">Αποσυνδεδεμένος</p>'}
      ${authProviders.includes('google') ? '<div class="settings-actions"><button class="button button-primary" type="button" data-action="sync-google">Σύνδεση με Google</button></div>' : ''}
      ${authProviders.includes('password') ? `<form id="sync-email-form" class="sync-email-form" novalidate><input class="field-input" name="email" type="email" autocomplete="email" placeholder="Email" aria-label="Email" required><input class="field-input" name="password" type="password" autocomplete="current-password" placeholder="Κωδικός" aria-label="Κωδικός" minlength="6" required>
        <div class="settings-actions"><button class="button button-quiet" type="submit" name="mode" value="signin">Σύνδεση</button><button class="button button-quiet" type="submit" name="mode" value="signup">Νέος λογαριασμός</button><button class="text-button" type="submit" name="mode" value="reset">Ξέχασα τον κωδικό</button></div></form>` : ''}</section>`;
  }
  const who = status.user?.email || status.user?.name || 'Συνδεδεμένος';
  const shared = status.householdId && status.user && status.householdId !== status.user.uid;
  const line = status.state === 'error' ? `<p class="form-error" id="sync-status">${escapeHtml(t(status.message || 'Σφάλμα συγχρονισμού'))}</p>`
    : `<p class="field-hint" id="sync-status">${status.offline ? 'Εκτός σύνδεσης: οι αλλαγές θα σταλούν μόλις επιστρέψει το internet.' : 'Συγχρονισμένο ✓'}</p>`;
  return `${head}<p>Συνδεδεμένος ως <strong>${escapeHtml(who)}</strong>${shared ? ' · κοινό νοικοκυριό' : ''}.</p>${line}
    <div class="settings-actions"><button class="button button-quiet" type="button" data-action="sync-invite">Πρόσκληση μέλους</button>${shared ? '<button class="button button-quiet" type="button" data-action="sync-leave">Αποχώρηση από νοικοκυριό</button>' : ''}<button class="button button-quiet" type="button" data-action="sync-signout">Αποσύνδεση</button></div>
    <form id="sync-join-form" class="sync-join-form" novalidate><input class="field-input" name="invite" placeholder="Κωδικός πρόσκλησης" aria-label="Κωδικός πρόσκλησης" autocomplete="off"><button class="button button-quiet" type="submit">Συμμετοχή</button></form>
    <p class="field-hint">Με τη συμμετοχή σε άλλο νοικοκυριό, τα προϊόντα αυτής της συσκευής προστίθενται στο κοινό απόθεμα.</p></section>`;
}

async function syncAction(fn, success) {
  try { const result = await fn(); if (success) showToast(typeof success === 'function' ? success(result) : success); }
  catch (error) { showToast(authMessage(error)); }
}

async function fillFromBarcode(code) {
  const status = document.querySelector('#barcode-status');
  const barcode = normalizeBarcode(code);
  itemForm.elements.barcode.value = barcode || String(code || '');
  if (!barcode) { status.textContent = t('Ο κωδικός δεν είναι έγκυρος barcode.'); return; }
  const editingId = itemForm.elements.id.value;
  const known = state.items.find((item) => item.barcode === barcode && item.id !== editingId);
  if (known) {
    itemForm.elements.name.value = itemForm.elements.name.value || known.name;
    itemForm.elements.category.value = known.category || itemForm.elements.category.value;
    updateNameCounter();
    status.textContent = t('Υπάρχει ήδη στο απόθεμα ως «{name}».', { name: known.name });
    return;
  }
  status.textContent = t('Αναζήτηση στο Open Food Facts…');
  try {
    const product = await lookupBarcode(barcode);
    if (!product) { status.textContent = t('Δεν βρέθηκε το προϊόν. Γράψε το όνομα και θα το θυμάμαι για αυτόν τον barcode.'); return; }
    if (!itemForm.elements.name.value.trim() || !editingId) itemForm.elements.name.value = product.name;
    if (product.category) itemForm.elements.category.value = product.category;
    updateNameCounter();
    status.textContent = t('Βρέθηκε: {name}. Έλεγξε τα στοιχεία πριν την αποθήκευση.', { name: product.name });
  } catch (error) {
    status.textContent = t(navigator.onLine === false ? 'Χωρίς σύνδεση: η αναζήτηση δεν είναι διαθέσιμη.' : t(error.message || 'Η αναζήτηση απέτυχε.'));
  }
}

async function openScanner() {
  const dialog = document.querySelector('#scan-dialog');
  const status = document.querySelector('#scan-status');
  status.textContent = t('Άνοιγμα κάμερας…');
  dialog.showModal();
  try {
    stopScanner = await startScanner(document.querySelector('#scan-video'), (code) => {
      stopScanner = null;
      dialog.close();
      fillFromBarcode(code);
    });
    if (dialog.open) status.textContent = t('Στόχευσε τον barcode με την κάμερα.');
    else closeScanner();
  } catch (error) {
    status.textContent = t(error?.name === 'NotAllowedError' ? 'Δεν δόθηκε άδεια για την κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.'
      : error?.name === 'NotFoundError' ? 'Δεν βρέθηκε κάμερα. Μπορείς να γράψεις τον barcode με το χέρι.'
      : (error.message || 'Η σάρωση δεν είναι διαθέσιμη.'));
  }
}

function closeScanner() {
  stopScanner?.();
  stopScanner = null;
  const dialog = document.querySelector('#scan-dialog');
  if (dialog.open) dialog.close();
}

const NOTIFY_KEY = 'spitothiki:notifications';
// Shared with sw.js: the service worker reads this snapshot for periodic background checks.
const DATA_CACHE = 'spitothiki-data';
const SNAPSHOT_URL = './__expiry.json';
const PERIODIC_TAG = 'spitothiki-expiry';
const backgroundSyncSupported = () => typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype;

async function readBackgroundSnapshot() {
  try { const res = await (await caches.open(DATA_CACHE)).match(SNAPSHOT_URL); return res ? await res.json() : null; } catch { return null; }
}

async function writeBackgroundSnapshot() {
  if (!('caches' in window)) return;
  const settings = notifySettings();
  try {
    const cache = await caches.open(DATA_CACHE);
    if (!settings.enabled) { await cache.delete(SNAPSHOT_URL); return; }
    const snapshot = expirySnapshot(state.items, { days: settings.days, lang: getLang(), lastNotified: settings.lastNotified,
      titleOne: t('1 προϊόν λήγει σύντομα'), titleMany: t('{count} προϊόντα λήγουν σύντομα', { count: '{count}' }), more: t(' και {count} ακόμη', { count: '{count}' }) });
    await cache.put(SNAPSHOT_URL, new Response(JSON.stringify(snapshot), { headers: { 'content-type': 'application/json' } }));
  } catch {}
}

// Periodic Background Sync (Chromium, installed app only): lets the service worker check expiries about once a day.
async function updateBackgroundCheck() {
  await writeBackgroundSnapshot();
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (!registration?.periodicSync) return;
  try {
    if (notifySettings().enabled) {
      const permission = await navigator.permissions?.query({ name: 'periodic-background-sync' }).catch(() => null);
      if (!permission || permission.state === 'granted') await registration.periodicSync.register(PERIODIC_TAG, { minInterval: 12 * 60 * 60 * 1000 });
    } else await registration.periodicSync.unregister(PERIODIC_TAG);
  } catch {}
}

let snapshotTimer;
function scheduleBackgroundSnapshot() {
  clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => { if (notifySettings().enabled) writeBackgroundSnapshot(); }, 500);
}

function notifySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTIFY_KEY) || '{}');
    return { enabled: Boolean(saved.enabled), days: Number.isInteger(saved.days) && saved.days >= 0 && saved.days <= 30 ? saved.days : 3, lastNotified: String(saved.lastNotified || '') };
  } catch { return { enabled: false, days: 3, lastNotified: '' }; }
}

function saveNotifySettings(changes) {
  try { localStorage.setItem(NOTIFY_KEY, JSON.stringify({ ...notifySettings(), ...changes })); } catch {}
}

function notificationsSupported() {
  return 'Notification' in window;
}

async function showNotification(title, body) {
  const options = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'spitothiki-expiry', lang: getLang() };
  const registration = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  if (registration?.showNotification) return registration.showNotification(title, options);
  return new Notification(title, options);
}

// Checks expiries when the app opens or comes back to the foreground; notifies at most once per day.
async function checkExpiryNotifications() {
  const settings = notifySettings();
  if (!settings.enabled || !notificationsSupported() || Notification.permission !== 'granted') return;
  const today = localDateKey();
  if (settings.lastNotified === today) return;
  const swSnapshot = await readBackgroundSnapshot();
  if (swSnapshot?.lastNotified === today) { saveNotifySettings({ lastNotified: today }); return; }
  const due = expiringWithin(state.items, today, settings.days);
  if (!due.length) return;
  const names = due.slice(0, 3).map((item) => `${item.name} (${expiryLabel(item.expiry).toLocaleLowerCase(locale())})`).join(', ');
  const more = due.length > 3 ? t(' και {count} ακόμη', { count: due.length - 3 }) : '';
  try {
    await showNotification(due.length === 1 ? t('1 προϊόν λήγει σύντομα') : t('{count} προϊόντα λήγουν σύντομα', { count: due.length }), `${names}${more}.`);
    saveNotifySettings({ lastNotified: today });
    await writeBackgroundSnapshot();
  } catch {}
}

async function enableNotifications() {
  if (!notificationsSupported()) { showToast('Ο browser δεν υποστηρίζει ειδοποιήσεις.'); return; }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') { showToast('Οι ειδοποιήσεις δεν επιτράπηκαν. Μπορείς να τις ενεργοποιήσεις από τις ρυθμίσεις του browser.'); renderApp(); return; }
  saveNotifySettings({ enabled: true, lastNotified: '' });
  updateBackgroundCheck();
  renderApp();
  showToast('Οι ειδοποιήσεις ενεργοποιήθηκαν.');
  checkExpiryNotifications();
}

function renderNotificationCard() {
  const settings = notifySettings();
  const permission = notificationsSupported() ? Notification.permission : 'unsupported';
  const active = settings.enabled && permission === 'granted';
  const status = permission === 'unsupported' ? 'Ο browser δεν υποστηρίζει ειδοποιήσεις.'
    : permission === 'denied' ? 'Οι ειδοποιήσεις είναι μπλοκαρισμένες στις ρυθμίσεις του browser.'
    : active ? 'Ενεργές' : 'Ανενεργές';
  return `<section class="panel settings-card"><span class="stat-icon amber">🔔</span><h2>Ειδοποιήσεις λήξης</h2><p>Όταν ανοίγεις την εφαρμογή, σου θυμίζουμε (μία φορά τη μέρα) ό,τι λήγει μέσα στις επόμενες ημέρες.</p>
    <p class="field-hint" id="notify-status">${escapeHtml(t('Κατάσταση: {status}', { status: t(status) }))}</p>
    <label class="field-label" for="notify-days">Ειδοποίηση για λήξη μέσα σε (ημέρες)</label><input class="field-input notify-days" id="notify-days" type="number" min="0" max="30" step="1" value="${settings.days}" inputmode="numeric">
    <div class="settings-actions">${active ? '<button class="button button-quiet" type="button" data-action="disable-notifications">Απενεργοποίηση</button>' : `<button class="button button-primary" type="button" data-action="enable-notifications" ${permission === 'unsupported' || permission === 'denied' ? 'disabled' : ''}>Ενεργοποίηση ειδοποιήσεων</button>`}</div>
    <p class="field-hint" id="notify-background">${backgroundSyncSupported() ? 'Έλεγχος στο παρασκήνιο: διαθέσιμος. Με την εφαρμογή εγκατεστημένη, ο browser ελέγχει περίπου μία φορά τη μέρα, όποτε κρίνει.' : 'Έλεγχος στο παρασκήνιο: δεν υποστηρίζεται από αυτόν τον browser. Ο έλεγχος γίνεται όταν ανοίγεις την εφαρμογή.'}</p>
    <p class="field-hint">Ειδοποιήσεις push με την εφαρμογή εντελώς κλειστή θα χρειάζονταν server (Cloud Functions), που αυτή η έκδοση δεν έχει.</p></section>`;
}

function renderLanguageCard() {
  const lang = getLang();
  return `<section class="panel settings-card"><span class="stat-icon blue">🌐</span><h2>Γλώσσα</h2><p>Διάλεξε τη γλώσσα της εφαρμογής. Τα δεδομένα σου δεν αλλάζουν.</p><div class="theme-options" role="group" aria-label="Γλώσσα" data-no-i18n>${[['el', 'Ελληνικά'], ['en', 'English']].map(([value, label]) => `<button type="button" class="filter-chip ${lang === value ? 'is-active' : ''}" data-action="set-lang" data-lang="${value}" lang="${value}" aria-pressed="${lang === value}">${label}</button>`).join('')}</div></section>`;
}

function applyLanguage() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = t('Σπιτοθήκη — Το σπίτι σε τάξη');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('Οργάνωσε τα τρόφιμα του σπιτιού, τις ημερομηνίες λήξης και τη λίστα αγορών σου.'));
  const toggle = document.querySelector('#lang-toggle');
  if (toggle) { toggle.textContent = lang === 'en' ? 'ΕΛ' : 'EN'; toggle.setAttribute('aria-label', lang === 'en' ? 'Switch to Greek' : 'Αλλαγή σε English'); toggle.setAttribute('title', toggle.getAttribute('aria-label')); }
  translateDom(document.body);
}

function changeLanguage(lang) {
  setLang(lang);
  applyLanguage();
  renderApp();
}

// Exposed for the smoke test.
window.__i18n = { getLang, untranslatedGreek };

const THEME_KEY = 'spitothiki:theme';

function currentTheme() {
  try { const theme = localStorage.getItem(THEME_KEY); return theme === 'light' || theme === 'dark' ? theme : 'auto'; } catch { return 'auto'; }
}

function applyTheme(theme = currentTheme()) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121a16' : '#f5f6f0');
}

function setTheme(theme) {
  try { if (theme === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, theme); } catch {}
  applyTheme(theme);
  renderApp();
}

function showConfirm(message, action, title = 'Να συνεχίσω;') {
  confirmAction = action;
  document.querySelector('#confirm-title').textContent = t(title);
  document.querySelector('#confirm-message').textContent = t(message);
  confirmDialog.showModal();
}

function addItemToShopping(item) {
  const existing = state.shopping.find((row) => !row.checked && (row.itemId ? row.itemId === item.id : row.name.toLocaleLowerCase('el-GR') === item.name.toLocaleLowerCase('el-GR')));
  if (existing) {
    existing.quantity = Number(existing.quantity) + Math.max(1, Number(item.minimum) - Number(item.quantity));
    existing.itemId = item.id;
  } else {
    state.shopping.push(createShoppingItem({ itemId: item.id, name: item.name, quantity: Math.max(1, Math.ceil(Number(item.minimum) - Number(item.quantity))), unit: item.unit }));
  }
  persist();
  showToast(t('Το {name} προστέθηκε στη λίστα.', { name: item.name }));
}

// ---------- Recurring items ----------
const INTERVAL_LABELS = { 7: 'Κάθε εβδομάδα', 14: 'Κάθε 2 εβδομάδες', 30: 'Κάθε μήνα' };
const intervalLabel = (days) => INTERVAL_LABELS[days] ? t(INTERVAL_LABELS[days]) : t('Κάθε {days} ημέρες', { days });
const UNITS = ['τεμ.', 'πακέτα', 'κιλά', 'γραμμάρια', 'λίτρα'];
const unitOptions = (selected = 'τεμ.') => UNITS.map((unit) => `<option value="${unit}" ${unit === selected ? 'selected' : ''}>${escapeHtml(t(unit))}</option>`).join('');

function runRecurring() {
  const result = applyRecurring(state.recurring || [], state.shopping, localDateKey());
  if (!result.changed) return;
  state.recurring = result.recurring;
  state.shopping = result.shopping;
  persist(); renderApp();
  if (result.added.length) showToast(t('Μπήκαν στη λίστα (επαναλαμβανόμενα): {names}', { names: result.added.map((row) => row.name).join(', ') }));
}

function renderRecurringPanel() {
  const rules = [...(state.recurring || [])].sort((a, b) => String(a.nextDue).localeCompare(String(b.nextDue)));
  return `<section class="panel recurring-panel" id="recurring-panel"><div class="panel-heading"><div><h2>Επαναλαμβανόμενα</h2><p>Μπαίνουν μόνα τους στη λίστα όταν έρθει η ώρα.</p></div></div>
    <form id="recurring-form" class="shopping-add-form recurring-form" novalidate><input class="field-input" name="name" required maxlength="80" placeholder="π.χ. Γάλα" aria-label="Επαναλαμβανόμενο προϊόν"><input class="field-input" name="quantity" type="number" min="0.1" max="${MAX_QUANTITY}" step="0.1" value="1" aria-label="Ποσότητα"><select class="field-input unit-select" name="unit" aria-label="Μονάδα">${unitOptions()}</select><select class="field-input" name="everyDays" aria-label="Κάθε πότε">${RECURRING_INTERVALS.map((days) => `<option value="${days}">${escapeHtml(intervalLabel(days))}</option>`).join('')}</select><button class="button button-quiet" type="submit">＋ Προσθήκη</button></form>
    <p class="form-error" id="recurring-error" role="alert" hidden></p>
    <div class="recurring-list">${rules.length ? rules.map((rule) => `<div class="recurring-row"><div><strong class="product-name">${escapeHtml(rule.name)}</strong><div class="shopping-row-detail">${escapeHtml(rule.quantity)} ${escapeHtml(t(rule.unit))} · ${escapeHtml(intervalLabel(rule.everyDays))} · ${escapeHtml(t('Επόμενη: {date}', { date: formatDate(rule.nextDue) }))}</div></div><button class="icon-button danger" type="button" data-action="remove-recurring" data-id="${escapeHtml(rule.id)}" aria-label="${escapeHtml(t('Διαγραφή {name}', { name: rule.name }))}">×</button></div>`).join('') : '<p class="subtle-empty">Π.χ. γάλα κάθε εβδομάδα ή απορρυπαντικό κάθε μήνα.</p>'}</div></section>`;
}

// ---------- Voice add (Web Speech API) ----------
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function startVoiceAdd(button) {
  if (!SpeechRecognitionApi) { showToast('Η φωνητική προσθήκη δεν υποστηρίζεται σε αυτόν τον browser.'); return; }
  if (recognition) { recognition.stop(); return; }
  recognition = new SpeechRecognitionApi();
  recognition.lang = getLang() === 'en' ? 'en-US' : 'el-GR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  button.classList.add('is-listening');
  showToast('Σε ακούω… πες π.χ. «ψωμί και αυγά».');
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results || []).map((result) => result[0]?.transcript || '').join(' ');
    const parsed = parseVoiceItems(transcript);
    if (!parsed.length) { showToast('Δεν κατάλαβα κάποιο προϊόν. Δοκίμασε ξανά.'); return; }
    for (const entry of parsed) state.shopping.push(createShoppingItem({ name: entry.name, quantity: entry.quantity }));
    if (persist()) { renderApp(); showToast(t('Προστέθηκαν: {names}', { names: parsed.map((entry) => entry.name).join(', ') })); }
  };
  recognition.onerror = (event) => { showToast(event?.error === 'not-allowed' ? 'Δεν δόθηκε άδεια για το μικρόφωνο.' : 'Η φωνητική προσθήκη απέτυχε. Δοκίμασε ξανά.'); };
  recognition.onend = () => { recognition = null; document.querySelector('[data-action="voice-add"]')?.classList.remove('is-listening'); };
  try { recognition.start(); } catch { recognition = null; button.classList.remove('is-listening'); }
}

// ---------- What do I cook? ----------
let onlineRecipes = { key: '', state: 'idle', list: [] };
let shownRecipes = [];

const recipeKey = () => Object.entries(pantryIngredients(state.items, localDateKey())).map(([id, entry]) => `${id}:${entry.urgency}`).sort().join(',');

function loadOnlineRecipes() {
  const key = recipeKey();
  if (!key || onlineRecipes.key === key || navigator.onLine === false) return;
  onlineRecipes = { key, state: 'loading', list: [] };
  fetchMealDbSuggestions(state.items, localDateKey())
    .then((list) => { if (onlineRecipes.key === key) onlineRecipes = { key, state: 'done', list: list.filter((r) => r.matched.length).slice(0, 4) }; })
    .catch(() => { if (onlineRecipes.key === key) onlineRecipes = { key, state: 'error', list: [] }; })
    .finally(() => { if (activeView === 'cook') { viewRoot.innerHTML = renderCook(); translateDom(viewRoot); } });
}

function missingNames(recipe) {
  const lang = getLang();
  return [...recipe.missing.map((id) => ingredientName(id, lang)), ...(recipe.missingRaw || [])];
}

function addMissingToList(recipeId) {
  const recipe = shownRecipes.find((entry) => entry.id === recipeId);
  if (!recipe) return;
  const pendingNames = new Set(state.shopping.filter((row) => !row.checked).map((row) => normalizeSearch(row.name).trim()));
  const names = missingNames(recipe).filter((name) => !pendingNames.has(normalizeSearch(name).trim()));
  if (!names.length) { showToast('Όλα τα υλικά είναι ήδη στη λίστα.'); return; }
  for (const name of names) state.shopping.push(createShoppingItem({ name: name.charAt(0).toLocaleUpperCase() + name.slice(1) }));
  if (persist()) { renderApp(); showToast(t('Μπήκαν στη λίστα: {names}', { names: names.join(', ') })); }
}

function renderRecipeCard(recipe, pantry) {
  const lang = getLang();
  const chip = (id, kind) => {
    const urgent = kind === 'have' && pantry[id]?.urgency >= 1;
    return `<span class="ingredient-chip ${kind}${urgent ? ' urgent' : ''}">${kind === 'have' ? (urgent ? '◷' : '✓') : '+'} ${escapeHtml(ingredientName(id, lang))}</span>`;
  };
  const missingCount = recipe.missing.length + (recipe.missingRaw || []).length;
  return `<article class="panel recipe-card" data-recipe="${escapeHtml(recipe.id)}"><div class="recipe-head">${recipe.thumb ? `<img class="recipe-thumb" src="${escapeHtml(recipe.thumb)}/preview" alt="" loading="lazy">` : '<span class="stat-icon">🍲</span>'}<div><h3 class="recipe-name" data-no-i18n lang="${recipe.source === 'mealdb' ? 'en' : lang}">${escapeHtml(recipe.name[lang] || recipe.name.el)}</h3>
    <p class="field-hint">${recipe.source === 'mealdb' ? escapeHtml(t('Από TheMealDB (στα αγγλικά)')) : escapeHtml(t('Συνταγή της Σπιτοθήκης'))}${recipe.urgent.length ? ` · <strong class="recipe-urgent">${escapeHtml(t('χρησιμοποιεί ό,τι λήγει σύντομα'))}</strong>` : ''}</p></div></div>
    <p class="recipe-label">${escapeHtml(t('Έχεις ({count})', { count: recipe.matched.length }))}</p><div class="ingredient-chips">${recipe.matched.map((id) => chip(id, 'have')).join('')}</div>
    ${missingCount ? `<p class="recipe-label">${escapeHtml(t('Λείπουν ({count})', { count: missingCount }))}</p><div class="ingredient-chips" data-no-i18n>${recipe.missing.map((id) => chip(id, 'need')).join('')}${(recipe.missingRaw || []).map((name) => `<span class="ingredient-chip need" lang="en">+ ${escapeHtml(name)}</span>`).join('')}</div>` : `<p class="recipe-label ok">${escapeHtml(t('Τα έχεις όλα!'))}</p>`}
    ${recipe.steps ? `<details class="recipe-steps"><summary>${escapeHtml(t('Πώς γίνεται'))}</summary><p>${escapeHtml(recipe.steps[lang] || recipe.steps.el)}</p></details>` : ''}
    <div class="settings-actions">${missingCount ? `<button class="button button-primary" type="button" data-action="add-missing" data-recipe="${escapeHtml(recipe.id)}">${escapeHtml(t('＋ Τα υπόλοιπα στη λίστα'))}</button>` : ''}${recipe.url ? `<a class="button button-quiet" href="${escapeHtml(recipe.url)}" target="_blank" rel="noopener">${escapeHtml(t('Συνταγή ↗'))}</a>` : ''}</div></article>`;
}

function renderCook() {
  const today = localDateKey();
  const pantry = pantryIngredients(state.items, today);
  const builtin = suggestBuiltin(state.items, today);
  const online = onlineRecipes.key === recipeKey() ? onlineRecipes : { state: navigator.onLine === false ? 'offline' : 'loading', list: [] };
  shownRecipes = [...builtin, ...online.list];
  const urgentNames = state.items.filter((item) => pantry[Object.keys(pantry).find((id) => pantry[id].items.includes(item))]?.urgency >= 1).map((item) => item.name);
  const onlineStatus = { loading: 'Ψάχνω κι άλλες ιδέες στο TheMealDB…', offline: 'Χωρίς σύνδεση: δείχνω μόνο τις συνταγές της εφαρμογής.', error: 'Το TheMealDB δεν απάντησε. Δείχνω τις συνταγές της εφαρμογής.', done: online.list.length ? '' : 'Το TheMealDB δεν βρήκε κάτι ταιριαστό.' }[online.state] || '';
  return `${renderHeader('Τι να μαγειρέψω;', 'Ιδέες με ό,τι έχεις στο σπίτι, πρώτα όσα λήγουν σύντομα.')}
    ${urgentNames.length ? `<div class="alert-banner" role="status">◷ ${escapeHtml(t('Λήγουν σύντομα: {names}', { names: urgentNames.join(', ') }))}</div>` : ''}
    ${builtin.length || online.list.length ? `<div class="recipe-grid" id="recipe-list">${builtin.map((recipe) => renderRecipeCard(recipe, pantry)).join('')}</div>` : renderEmpty('Δεν βρήκα συνταγές', 'Πρόσθεσε στο απόθεμα βασικά υλικά (π.χ. αυγά, ντομάτες, ρύζι) για να δεις ιδέες.', 'add-item', 'Προσθήκη προϊόντος', '🍳')}
    ${online.list.length ? `<h2 class="section-title">Περισσότερες ιδέες από TheMealDB</h2><div class="recipe-grid" id="recipe-online">${online.list.map((recipe) => renderRecipeCard(recipe, pantry)).join('')}</div>` : ''}
    ${onlineStatus ? `<p class="field-hint" id="recipe-online-status">${escapeHtml(t(onlineStatus))}${online.state === 'error' ? ` <button class="text-button" type="button" data-action="retry-recipes">${escapeHtml(t('Ξανά'))}</button>` : ''}</p>` : ''}`;
}

// ---------- Food waste ----------
const WASTE_LABELS = { expired: 'Έληξε', spoiled: 'Χάλασε', leftover: 'Περίσσεψε', other: 'Άλλος λόγος' };

function openWasteDialog(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const dialog = document.querySelector('#waste-dialog');
  const form = document.querySelector('#waste-form');
  form.elements.itemId.value = item.id;
  form.elements.quantity.value = item.quantity > 0 ? item.quantity : 1;
  form.elements.quantity.max = String(Math.max(Number(item.quantity), 1));
  form.elements.reason.innerHTML = WASTE_REASONS.map((reason) => `<option value="${reason}">${escapeHtml(t(WASTE_LABELS[reason]))}</option>`).join('');
  form.elements.reason.value = expiryStatus(item.expiry, localDateKey()) === 'expired' ? 'expired' : 'spoiled';
  document.querySelector('#waste-name').textContent = `${item.name} · ${item.quantity} ${t(item.unit)}`;
  document.querySelector('#waste-error').hidden = true;
  dialog.showModal();
}

// ---------- Insights: spending & waste ----------
let insightsMonth = monthKey(localDateKey());
const money = (value) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR' }).format(value || 0);
const monthLabel = (month) => new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(`${month}-15T12:00:00`));

function renderBars(rows, format) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `<div class="bar-list">${rows.map((row) => `<div class="bar-row"><span class="bar-label">${escapeHtml(row.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Math.round((row.value / max) * 100))}%"></span></span><strong class="bar-value">${escapeHtml(format(row.value))}</strong></div>`).join('')}</div>`;
}

function renderInsights() {
  const spending = monthlySpending(state.purchases || [], insightsMonth);
  const previous = monthlySpending(state.purchases || [], shiftMonth(insightsMonth, -1));
  const waste = wasteStats(state.waste || [], insightsMonth);
  const isCurrent = insightsMonth >= monthKey(localDateKey());
  return `${renderHeader('Στατιστικά', 'Πόσα ξοδεύεις και τι πετιέται, ανά μήνα.')}
    <div class="month-switch" role="group" aria-label="Μήνας"><button class="icon-button" type="button" data-action="insights-month" data-delta="-1" aria-label="Προηγούμενος μήνας">‹</button><strong id="insights-month" data-no-i18n>${escapeHtml(monthLabel(insightsMonth))}</strong><button class="icon-button" type="button" data-action="insights-month" data-delta="1" aria-label="Επόμενος μήνας" ${isCurrent ? 'disabled' : ''}>›</button></div>
    <div class="settings-grid insights-grid">
    <section class="panel settings-card" id="spending-card"><span class="stat-icon blue">€</span><h2>Έξοδα</h2>
      <p class="big-number" id="spending-total">${escapeHtml(money(spending.total))}</p>
      <p class="field-hint">${escapeHtml(t('{count} αγορές με τιμή · προηγούμενος μήνας: {prev}', { count: spending.count, prev: money(previous.total) }))}</p>
      ${spending.byCategory.length ? renderBars(spending.byCategory.map((row) => ({ label: categoryLabel(row.category), value: row.total })), money) : '<p class="subtle-empty">Όταν τσεκάρεις κάτι ως αγορασμένο, γράψε την τιμή του (€) στη λίστα αγορών για να βλέπεις εδώ τα έξοδα.</p>'}</section>
    <section class="panel settings-card" id="waste-card"><span class="stat-icon amber">🗑</span><h2>Σπατάλη τροφίμων</h2>
      <p class="big-number" id="waste-total">${waste.count}</p>
      <p class="field-hint">${escapeHtml(t(waste.count === 1 ? 'φορά που πετάχτηκε κάτι' : 'φορές που πετάχτηκε κάτι'))}</p>
      ${waste.count ? `${renderBars(WASTE_REASONS.filter((reason) => waste.byReason[reason]).map((reason) => ({ label: t(WASTE_LABELS[reason]), value: waste.byReason[reason] })), String)}
      <h3 class="insights-subtitle">Πετιούνται πιο συχνά</h3><ul class="waste-top">${waste.top.map((entry) => `<li><span class="product-name">${escapeHtml(entry.name)}</span><strong>× ${entry.count}</strong></li>`).join('')}</ul>` : '<p class="subtle-empty">Τίποτα αυτόν τον μήνα. Όταν πετάς κάτι, πάτα 🗑 στο απόθεμα για να το καταγράψεις.</p>'}</section></div>`;
}

function makeDemoItems() {
  const today = localDateKey();
  const addDays = (amount) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() + amount); return localDateKey(date); };
  return [
    createPantryItem({ name: 'Γάλα', quantity: 1, unit: 'λίτρα', minimum: 2, category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: addDays(3) }),
    createPantryItem({ name: 'Μήλα', quantity: 4, unit: 'τεμ.', minimum: 2, category: 'Φρούτα & λαχανικά', location: 'Ντουλάπι', expiry: addDays(6) }),
    createPantryItem({ name: 'Ρύζι', quantity: 2, unit: 'πακέτα', minimum: 1, category: 'Ξηρά τρόφιμα', location: 'Ντουλάπι' }),
    createPantryItem({ name: 'Γιαούρτι', quantity: 2, unit: 'τεμ.', minimum: 2, category: 'Γαλακτοκομικά', location: 'Ψυγείο', expiry: addDays(1) }),
    createPantryItem({ name: 'Ελαιόλαδο', quantity: 1, unit: 'λίτρα', minimum: 1, category: 'Ξηρά τρόφιμα', location: 'Ντουλάπι' })
  ];
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `spitothiki-backup-${localDateKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Το αντίγραφο ασφαλείας κατέβηκε.');
}

function handleAction(button) {
  const { action, id } = button.dataset;
  if (action === 'add-item') openItemDialog();
  else if (action === 'close-dialog') itemDialog.close();
  else if (action === 'edit-item') openItemDialog(id);
  else if (action === 'navigate') navigate(button.dataset.view);
  else if (action === 'adjust-quantity') {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    const nextQuantity = Math.min(MAX_QUANTITY, Math.max(0, Number(item.quantity) + Number(button.dataset.delta)));
    if (nextQuantity === Number(item.quantity) && Number(button.dataset.delta) > 0) { showToast(t('Η μέγιστη ποσότητα είναι {max}.', { max: MAX_QUANTITY })); return; }
    state.items = state.items.map((entry) => entry.id === id ? { ...entry, quantity: nextQuantity, updatedAt: new Date().toISOString() } : entry);
    persist(); renderApp();
  } else if (action === 'delete-item') {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    showConfirm(t('Θα αφαιρεθεί το «{name}» από το απόθεμα.', { name: item.name }), () => {
      state.items = state.items.filter((entry) => entry.id !== id);
      persist(); renderApp(); showToast('Το προϊόν αφαιρέθηκε.');
    }, 'Αφαίρεση προϊόντος;');
  } else if (action === 'add-to-shopping') {
    const item = state.items.find((entry) => entry.id === id);
    if (item) addItemToShopping(item);
  } else if (action === 'toggle-shopping') {
    const row = state.shopping.find((entry) => entry.id === id);
    if (!row) return;
    const result = row.checked ? returnShoppingItem(state.items, row) : receiveShoppingItem(state.items, row);
    if (row.checked) state.purchases = (state.purchases || []).filter((p) => p.id !== `pur-${row.id}`);
    state.items = result.items;
    state.shopping = toggleShoppingItem(state.shopping, id).map((entry) => entry.id === id ? result.row : entry);
    persist(); renderApp();
    if (result.message) showToast(result.message);
  } else if (action === 'remove-shopping') {
    state.shopping = state.shopping.filter((entry) => entry.id !== id);
    persist(); renderApp(); showToast('Το προϊόν αφαιρέθηκε από τη λίστα.');
  } else if (action === 'sync-google') syncAction(() => sync.signInWithGoogle());
  else if (action === 'sync-signout') syncAction(() => sync.signOut(), 'Αποσυνδέθηκες. Τα δεδομένα μένουν σε αυτή τη συσκευή.');
  else if (action === 'sync-invite') syncAction(async () => {
    const code = await sync.createInvite();
    try { await navigator.clipboard.writeText(code); } catch {}
    showConfirm(t('Δώσε αυτόν τον κωδικό στο άλλο μέλος (αντιγράφηκε): {code}', { code }), null, 'Κωδικός πρόσκλησης');
  });
  else if (action === 'sync-leave') showConfirm('Θα επιστρέψεις στο δικό σου νοικοκυριό. Τα κοινά προϊόντα θα μείνουν στο κοινό νοικοκυριό.', () => syncAction(() => sync.leaveHousehold(), 'Αποχώρησες από το νοικοκυριό.'), 'Αποχώρηση;');
  else if (action === 'scan-barcode') openScanner();
  else if (action === 'close-scan') closeScanner();
  else if (action === 'lookup-barcode') fillFromBarcode(itemForm.elements.barcode.value);
  else if (action === 'enable-notifications') enableNotifications();
  else if (action === 'disable-notifications') { saveNotifySettings({ enabled: false }); updateBackgroundCheck(); renderApp(); showToast('Οι ειδοποιήσεις απενεργοποιήθηκαν.'); }
  else if (action === 'set-theme') setTheme(button.dataset.theme);
  else if (action === 'set-store') { try { if (button.dataset.store) localStorage.setItem(STORE_KEY, button.dataset.store); else localStorage.removeItem(STORE_KEY); } catch {} renderApp(); }
  else if (action === 'toggle-stores') { storesOpen = !storesOpen; renderApp(); }
  else if (action === 'aisle-up' || action === 'aisle-down') {
    const store = activeStore();
    if (store) { state.stores = state.stores.map((entry) => entry.id === store.id ? moveCategory(entry, button.dataset.category, action === 'aisle-up' ? -1 : 1) : entry); persist(); renderApp(); }
  } else if (action === 'delete-store') {
    const store = activeStore();
    if (store) showConfirm(t('Θα διαγραφεί το κατάστημα «{name}». Η λίστα δεν αλλάζει.', { name: store.name }), () => { state.stores = state.stores.filter((entry) => entry.id !== store.id); try { localStorage.removeItem(STORE_KEY); } catch {} persist(); renderApp(); }, 'Διαγραφή καταστήματος;');
  }
  else if (action === 'waste-item') openWasteDialog(id);
  else if (action === 'close-waste') document.querySelector('#waste-dialog').close();
  else if (action === 'insights-month') { insightsMonth = shiftMonth(insightsMonth, Number(button.dataset.delta)); renderApp(); }
  else if (action === 'add-missing') addMissingToList(button.dataset.recipe);
  else if (action === 'retry-recipes') { onlineRecipes = { key: '', state: 'idle', list: [] }; renderApp(); }
  else if (action === 'voice-add') startVoiceAdd(button);
  else if (action === 'remove-recurring') { state.recurring = (state.recurring || []).filter((rule) => rule.id !== id); persist(); renderApp(); showToast('Το επαναλαμβανόμενο αφαιρέθηκε.'); }
  else if (action === 'set-lang') changeLanguage(button.dataset.lang);
  else if (action === 'toggle-lang') changeLanguage(getLang() === 'en' ? 'el' : 'en');
  else if (action === 'share-shopping') shareShoppingList();
  else if (action === 'copy-share') copyShareText();
  else if (action === 'close-share') document.querySelector('#share-dialog').close();
  else if (action === 'clear-completed') {
    state.shopping = state.shopping.filter((entry) => !entry.checked);
    persist(); renderApp(); showToast('Η λίστα καθαρίστηκε.');
  } else if (action === 'filter-category') {
    pantryCategory = button.dataset.category || 'Όλα';
    renderApp();
  } else if (action === 'clear-filters') {
    pantryCategory = 'Όλα'; pantryQuery = ''; renderApp();
  } else if (action === 'focus-shopping') {
    document.querySelector('#shopping-form input[name="name"]')?.focus();
  } else if (action === 'export-backup') downloadBackup();
  else if (action === 'import-backup') backupFile.click();
  else if (action === 'load-demo') {
    const loadDemo = () => { state = { ...state, items: makeDemoItems(), shopping: [] }; persist(); renderApp(); showToast('Τα παραδείγματα φορτώθηκαν.'); };
    if (state.items.length || state.shopping.length) showConfirm('Τα τωρινά δεδομένα θα αντικατασταθούν από δοκιμαστικά προϊόντα.', loadDemo, 'Φόρτωση παραδειγμάτων;');
    else loadDemo();
  } else if (action === 'clear-data') {
    showConfirm(`${t('Θα διαγραφούν όλα τα προϊόντα και η λίστα αγορών από αυτή τη συσκευή.')}${syncStatus.user ? t(' Επειδή είσαι συνδεδεμένος, θα διαγραφούν και από τις συγχρονισμένες συσκευές.') : ''}${t(' Φρόντισε να έχεις αντίγραφο αν τα χρειάζεσαι.')}`, () => {
      state = { items: [], shopping: [], recurring: [], stores: [], purchases: [], waste: [] }; persist(); renderApp(); showToast('Τα δεδομένα διαγράφηκαν.');
    }, 'Διαγραφή όλων των δεδομένων;');
  }
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { event.preventDefault(); navigate(viewButton.dataset.view); return; }
  const button = event.target.closest('[data-action]');
  if (button && button.type !== 'checkbox') handleAction(button);
});

document.addEventListener('change', (event) => {
  if (event.target.classList?.contains('price-input')) {
    const row = state.shopping.find((entry) => entry.id === event.target.dataset.id);
    if (!row) return;
    const value = event.target.value.trim();
    state.purchases = (state.purchases || []).filter((p) => p.id !== `pur-${row.id}`);
    if (value !== '') {
      try { state.purchases.push(purchaseFor(row, value, { items: state.items, date: localDateKey(), storeId: activeStore()?.id || '' })); }
      catch (error) { showToast(error.message); return; }
    }
    persist();
    showToast(value === '' ? 'Η τιμή αφαιρέθηκε.' : t('Η τιμή αποθηκεύτηκε: {price}', { price: money(Number(value.replace(',', '.'))) }));
    return;
  }
  const checkbox = event.target.closest('[data-action="toggle-shopping"]');
  if (checkbox) handleAction(checkbox);
  if (event.target === backupFile && backupFile.files?.[0]) {
    const file = backupFile.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseBackup(reader.result);
        showConfirm(t('Το αντίγραφο περιέχει {items} προϊόντα και {shopping} είδη στη λίστα. Θα αντικαταστήσει τα τωρινά δεδομένα.', { items: imported.items.length, shopping: imported.shopping.length }), () => {
          state = { ...state, ...imported }; persist(); renderApp(); showToast('Το αντίγραφο εισήχθη.');
        }, 'Εισαγωγή αντιγράφου;');
      } catch (error) { showToast(error.message || 'Δεν ήταν δυνατή η εισαγωγή.'); }
      backupFile.value = '';
    };
    reader.onerror = () => showToast('Δεν ήταν δυνατή η ανάγνωση του αρχείου.');
    reader.readAsText(file);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'notify-days') {
    const days = Math.round(Number(event.target.value));
    if (Number.isFinite(days) && days >= 0 && days <= 30) { saveNotifySettings({ days, lastNotified: '' }); scheduleBackgroundSnapshot(); }
  }
  if (event.target.id === 'item-name') updateNameCounter();
  if (event.target.id === 'item-expiry') updateExpiryWarning();
  if (event.target.id === 'pantry-search') {
    const caret = event.target.selectionStart;
    pantryQuery = event.target.value;
    renderPantryList();
    const input = document.querySelector('#pantry-search');
    input?.focus(); input?.setSelectionRange(caret, caret);
  }
});

document.addEventListener('submit', (event) => {
  if (event.target === itemForm) {
    event.preventDefault();
    const formData = new FormData(itemForm);
    const current = state.items.find((item) => item.id === String(formData.get('id') || ''));
    try {
      const item = createPantryItem({
        id: current?.id,
        createdAt: current?.createdAt,
        name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit'),
        minimum: formData.get('minimum'), category: formData.get('category'), location: formData.get('location'), expiry: formData.get('expiry'),
        barcode: normalizeBarcode(formData.get('barcode'))
      });
      if (current) state.shopping = syncShoppingWithItem(state.shopping, current, item);
      state.items = current ? state.items.map((entry) => entry.id === current.id ? item : entry) : [item, ...state.items];
      if (persist()) { itemDialog.close(); renderApp(); showToast(current ? 'Οι αλλαγές αποθηκεύτηκαν.' : 'Το προϊόν προστέθηκε.'); }
    } catch (error) {
      const message = document.querySelector('#form-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία και δοκίμασε ξανά.');
      message.hidden = false;
    }
  }

  if (event.target.id === 'sync-email-form') {
    event.preventDefault();
    const email = String(event.target.elements.email.value || '').trim();
    const password = String(event.target.elements.password.value || '');
    const mode = event.submitter?.value || 'signin';
    if (!email) { showToast('Γράψε το email σου.'); return; }
    if (mode === 'reset') { syncAction(() => sync.resetPassword(email), 'Σου στείλαμε email για νέο κωδικό.'); return; }
    if (password.length < 6) { showToast('Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες.'); return; }
    syncAction(() => mode === 'signup' ? sync.signUpWithEmail(email, password) : sync.signInWithEmail(email, password));
    return;
  }
  if (event.target.id === 'sync-join-form') {
    event.preventDefault();
    const invite = String(event.target.elements.invite.value || '').trim();
    if (!invite) { showToast('Γράψε τον κωδικό πρόσκλησης.'); return; }
    syncAction(() => sync.joinHousehold(invite), 'Μπήκες στο κοινό νοικοκυριό.');
    return;
  }

  if (event.target.id === 'store-form') {
    event.preventDefault();
    try {
      const store = createStore({ name: event.target.elements.name.value });
      state.stores = [...(state.stores || []), store];
      try { localStorage.setItem(STORE_KEY, store.id); } catch {}
      persist(); renderApp(); showToast(t('Το κατάστημα «{name}» προστέθηκε.', { name: store.name }));
    } catch (error) { showToast(error.message); }
    return;
  }
  if (event.target.id === 'waste-form') {
    event.preventDefault();
    const item = state.items.find((entry) => entry.id === event.target.elements.itemId.value);
    if (!item) return;
    try {
      const record = createWaste(item, { quantity: event.target.elements.quantity.value, reason: event.target.elements.reason.value }, localDateKey());
      state.waste = [...(state.waste || []), record];
      state.items = applyWaste(state.items, record);
      if (persist()) { document.querySelector('#waste-dialog').close(); renderApp(); showToast(t('Καταγράφηκε ως σπατάλη: {name}.', { name: item.name })); }
    } catch (error) { const message = document.querySelector('#waste-error'); message.textContent = t(error.message); message.hidden = false; }
    return;
  }

  if (event.target.id === 'recurring-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const rule = createRecurring({ name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit'), everyDays: formData.get('everyDays') }, localDateKey());
      state.recurring = [...(state.recurring || []), rule];
      persist();
      showToast(t('Το «{name}» θα μπαίνει στη λίστα: {every}.', { name: rule.name, every: intervalLabel(rule.everyDays).toLocaleLowerCase(locale()) }));
      runRecurring(); renderApp();
    } catch (error) {
      const message = document.querySelector('#recurring-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία.');
      message.hidden = false;
    }
    return;
  }

  if (event.target.id === 'shopping-form') {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const category = String(formData.get('category') || '');
      state.shopping.push({ ...createShoppingItem({ name: formData.get('name'), quantity: formData.get('quantity'), unit: formData.get('unit') }), ...(CATEGORIES.includes(category) ? { category } : {}) });
      if (persist()) { renderApp(); showToast('Προστέθηκε στη λίστα αγορών.'); document.querySelector('#shopping-form input[name="name"]')?.focus(); }
      return;
    } catch (error) {
      const message = document.querySelector('#shopping-error');
      message.textContent = t(error.message || 'Έλεγξε τα στοιχεία.');
      message.hidden = false;
    }
  }
});

document.querySelector('#scan-dialog').addEventListener('close', () => { stopScanner?.(); stopScanner = null; });
itemForm.elements.barcode.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); fillFromBarcode(event.target.value); }
});

confirmDialog.addEventListener('close', () => {
  if (confirmDialog.returnValue === 'confirm' && confirmAction) confirmAction();
  confirmAction = null;
});

applyLanguage();
applyTheme();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

state.items = state.items.map((item) => ({ ...item, unit: normalizeUnit(item.unit) }));
state.shopping = state.shopping.map((item) => ({ ...item, unit: normalizeUnit(item.unit) }));
renderApp();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

function runDailyChecks() {
  runRecurring();
  checkExpiryNotifications();
}
runDailyChecks();
updateBackgroundCheck();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runDailyChecks(); });
// While the app stays open (e.g. a tablet in the kitchen), re-check every hour so a new day is noticed.
setInterval(runDailyChecks, 60 * 60 * 1000);

startSync();
