// Formatting helpers shared by the screens (pure apart from the current language and today's date).
import { expiryStatus } from './domain.js';
import { locale, t } from './i18n.js';

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  return new Intl.DateTimeFormat(locale(), options).format(date);
}

export function daysUntil(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const [ty, tm, td] = localDateKey().split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(ty, tm - 1, td);
  if (!Number.isFinite(target) || !Number.isFinite(today)) return null;
  return Math.round((target - today) / 86_400_000);
}

export function expiryLabel(value) {
  const status = expiryStatus(value, localDateKey());
  const days = daysUntil(value);
  if (status === 'none') return '';
  if (status === 'expired') return t('Έληξε {date}', { date: formatDate(value) });
  if (days === 0) return t('Λήγει σήμερα');
  if (days === 1) return t('Λήγει αύριο');
  if (status === 'soon') return t('Λήγει σε {days} ημέρες', { days });
  return t('Λήξη {date}', { date: formatDate(value) });
}

export const readKey = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const writeKey = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} };
