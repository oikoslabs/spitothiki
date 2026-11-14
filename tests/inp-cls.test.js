import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('bottom-bar Μενού: press feedback first, open the sheet after paint (INP)', () => {
  const app = read('src/app.js');
  const open = app.slice(app.indexOf("action === 'open-menu'"), app.indexOf("action === 'close-menu'"));
  assert.match(open, /pressFeedback\(button\)/);
  assert.match(open, /afterPaint\(\(\) => \{/);
  assert.ok(open.indexOf('pressFeedback(button)') < open.indexOf('afterPaint('));
  assert.ok(open.indexOf('afterPaint(') < open.indexOf('sheet.showModal()'));
  assert.match(open, /is-active/);
});

test('scan torch: toggle the button immediately, applyConstraints after paint, recover on error', () => {
  const app = read('src/app.js');
  const torch = app.slice(app.indexOf("action === 'scan-torch'"), app.indexOf("action === 'close-scan'"));
  assert.match(torch, /button\.setAttribute\('aria-pressed', String\(on\)\)/);
  assert.match(torch, /🔦 Φακός: ανοιχτός/);
  assert.ok(torch.indexOf("setAttribute('aria-pressed'") < torch.indexOf('afterPaint('));
  assert.ok(torch.indexOf('afterPaint(') < torch.indexOf('apply(on)'));
  assert.match(torch, /button\.hidden = true/);
  assert.match(torch, /\.catch\(/);
});

test('receipt dialog is pinned to the top without waiting for [open], and the body keeps a reserved height (CLS)', () => {
  const css = read('styles.css');
  const block = css.slice(css.indexOf('/* Scan receipt */'), css.indexOf('.receipt-summary'));
  assert.match(block, /\.receipt-dialog \{[^}]*margin-top: max\(12px, 5vh\)/);
  assert.match(block, /\.receipt-dialog \{[^}]*margin-bottom: auto/);
  assert.doesNotMatch(block, /\.receipt-dialog\[open\]/);
  assert.match(block, /#receipt-body \{[^}]*min-height: min\(24rem, 58vh\)/);
  const app = read('src/app.js');
  const open = app.slice(app.indexOf('function openReceiptDialog'), app.indexOf('async function loadReceipt(link'));
  assert.ok(open.indexOf('renderReceipt()') < open.indexOf("showModal()"), 'fill the body before the first paint of the dialog');
});

test('cheap INP wins: menu item close, scan dialog teardown, and sheet sign-in wait for paint', () => {
  const app = read('src/app.js');
  const click = app.slice(app.indexOf("const viewButton = event.target.closest('[data-view]')"), app.indexOf("event.target.id === 'menu-sheet'"));
  assert.match(click, /const fromMenu = viewButton\.closest\('#menu-sheet'\)/);
  assert.match(click, /pressFeedback\(viewButton\)/);
  assert.ok(click.indexOf('pressFeedback(viewButton)') < click.indexOf('afterPaint('));
  assert.ok(click.indexOf('afterPaint(') < click.indexOf("menu-sheet')?.close()"));
  assert.match(app, /function releaseScanner\(\) \{[\s\S]*afterPaint\(\(\) => stop\(\)\)/);
  assert.match(app, /#scan-dialog'\)\.addEventListener\('close', \(\) => \{ releaseScanner\(\); \}/);
  const signin = app.slice(app.indexOf("action === 'sheet-signin'"), app.indexOf("action === 'sheet-drive'"));
  assert.match(signin, /pressFeedback\(button\)/);
  assert.match(signin, /afterPaint\(\(\) => \{ closeProtectSheet\(\); goToSignin\(\); \}/);
});
