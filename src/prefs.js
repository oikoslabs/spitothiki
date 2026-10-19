// Display preferences (device-local): text size and high contrast. Applied as attributes on <html>
// that styles.css turns into CSS variables (--text-scale and the high-contrast palette).
export const TEXT_KEY = 'spitothiki:text-size';
export const CONTRAST_KEY = 'spitothiki:contrast';
export const TEXT_SIZES = ['normal', 'large', 'xlarge'];

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch {} };

export const normalizeTextSize = (value) => (TEXT_SIZES.includes(value) ? value : 'normal');
export const textSize = () => normalizeTextSize(read(TEXT_KEY));
export const highContrast = () => read(CONTRAST_KEY) === 'high';

export function applyDisplayPrefs(root = document.documentElement, size = textSize(), contrast = highContrast()) {
  if (size === 'normal') delete root.dataset.text; else root.dataset.text = size;
  if (contrast) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
}
export function setTextSize(size) { const v = normalizeTextSize(size); write(TEXT_KEY, v === 'normal' ? null : v); applyDisplayPrefs(); return v; }
export function setHighContrast(on) { write(CONTRAST_KEY, on ? 'high' : null); applyDisplayPrefs(); return Boolean(on); }
