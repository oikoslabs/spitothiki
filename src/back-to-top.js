// «Στην αρχή» button: a round ⬆ that appears after scrolling ~300px and scrolls back to the top.
// Works for the page (every tab) and for long dialogs that scroll inside themselves.
export const SHOW_AFTER = 300;
export const shouldShow = (scrollTop, threshold = SHOW_AFTER) => Number(scrollTop) > threshold;
export const scrollBehavior = (reduceMotion) => (reduceMotion ? 'auto' : 'smooth');

const label = () => (document.documentElement.lang === 'en' ? 'Back to top' : 'Στην αρχή');
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function makeButton(extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `back-to-top ${extraClass}`;
  btn.setAttribute('data-no-i18n', '');
  btn.setAttribute('aria-label', label());
  btn.title = label();
  btn.hidden = true;
  btn.innerHTML = '<span aria-hidden="true">⬆</span>';
  return btn;
}

export function initBackToTop() {
  if (typeof document === 'undefined' || document.querySelector('.back-to-top-page')) return;
  const pageBtn = makeButton('back-to-top-page');
  document.body.append(pageBtn);
  let ticking = false;
  const update = () => { ticking = false; pageBtn.hidden = !shouldShow(window.scrollY || document.documentElement.scrollTop); pageBtn.setAttribute('aria-label', label()); };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  pageBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior(reduced()) });
    document.querySelector('main, .main-content')?.focus?.({ preventScroll: true });
  });
  // Dialogs sit in the top layer, so each scrolling dialog gets its own sticky button.
  document.addEventListener('scroll', (event) => {
    const box = event.target;
    if (!(box instanceof HTMLElement) || box.tagName !== 'DIALOG') return;
    let btn = box.querySelector(':scope > .back-to-top-dialog');
    if (!btn) {
      btn = makeButton('back-to-top-dialog');
      btn.addEventListener('click', () => box.scrollTo({ top: 0, behavior: scrollBehavior(reduced()) }));
      box.append(btn);
    }
    btn.hidden = !shouldShow(box.scrollTop);
  }, { capture: true, passive: true });
  update();
}
