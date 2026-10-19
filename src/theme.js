// Light / dark / automatic theme: saved choice + the attributes the stylesheet reads.
export const THEME_KEY = 'spitothiki:theme';

export function currentTheme() {
  try { const theme = localStorage.getItem(THEME_KEY); return theme === 'light' || theme === 'dark' ? theme : 'auto'; } catch { return 'auto'; }
}

export function applyTheme(theme = currentTheme()) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.dark = dark ? '1' : '';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121a16' : '#f5f6f0');
}
