import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dictionaries } from '../src/i18n.js';
import { adoptCamera, startScanner } from '../src/barcode.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

function fakeStream() {
  const track = { stopped: false, stop() { this.stopped = true; }, getCapabilities() { return {}; }, applyConstraints: async () => {} };
  return { tracks: [track], getVideoTracks() { return this.tracks; }, getTracks() { return this.tracks; } };
}

function installScanMocks({ getUserMedia, formats = ['qr_code', 'ean_13'] } = {}) {
  const previous = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    BarcodeDetector: Object.getOwnPropertyDescriptor(globalThis, 'BarcodeDetector'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document')
  };
  const order = [];
  const navigator = {
    mediaDevices: {
      getUserMedia: getUserMedia || (async () => { order.push('gum'); return fakeStream(); })
    }
  };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: navigator });
  class BarcodeDetector {
    static async getSupportedFormats() { order.push('formats'); return formats; }
    constructor() { order.push('detector'); }
    async detect() { return []; }
  }
  Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, writable: true, value: BarcodeDetector });
  Object.defineProperty(globalThis, 'document', {
    configurable: true, writable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }) }) }
  });
  const video = { srcObject: null, play: async () => { order.push('play'); }, videoWidth: 0, videoHeight: 0 };
  const restore = () => {
    for (const [key, desc] of Object.entries(previous)) {
      if (desc) Object.defineProperty(globalThis, key, desc);
      else delete globalThis[key];
    }
  };
  return { order, video, restore };
}

test('adoptCamera stops the stream when the dialog is aborted before getUserMedia resolves', async () => {
  const stream = fakeStream();
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const ac = new AbortController();
  const adopted = adoptCamera(pending, ac.signal);
  ac.abort();
  release(stream);
  await assert.rejects(adopted, (error) => error.name === 'AbortError');
  assert.equal(stream.tracks[0].stopped, true);
});

test('startScanner opens the camera and plays the preview before BarcodeDetector setup', async () => {
  const { order, video, restore } = installScanMocks();
  try {
    const stop = await startScanner(video, () => {}, { qr: 'all' });
    const gum = order.indexOf('gum');
    const play = order.indexOf('play');
    const formats = order.indexOf('formats');
    assert.ok(gum >= 0 && play > gum && formats > play, `order was ${order.join(' → ')}`);
    assert.ok(video.srcObject, 'preview should be attached after play');
    stop();
    assert.equal(video.srcObject, null);
    assert.equal(video.srcObject === null, true);
    assert.ok(order.includes('detector') || formats >= 0);
  } finally { restore(); }
});

test('startScanner stops an in-flight camera if the dialog is closed before the stream starts', async () => {
  const stream = fakeStream();
  let release;
  const { order, video, restore } = installScanMocks({
    getUserMedia: () => { order.push('gum'); return new Promise((resolve) => { release = resolve; }); }
  });
  try {
    const ac = new AbortController();
    const started = startScanner(video, () => {}, { qr: 'all', signal: ac.signal });
    await Promise.resolve();
    assert.equal(order.includes('gum'), true);
    assert.equal(order.includes('formats'), false);
    ac.abort();
    release(stream);
    await assert.rejects(started, (error) => error.name === 'AbortError');
    assert.equal(stream.tracks[0].stopped, true);
    assert.equal(video.srcObject, null);
    assert.equal(order.includes('formats'), false);
  } finally { restore(); }
});

test('startScanner stops the live stream if the dialog is closed after the preview starts, before detectors finish', async () => {
  let releaseFormats;
  const formatsGate = new Promise((resolve) => { releaseFormats = resolve; });
  const { order, video, restore } = installScanMocks({
    getUserMedia: async () => { order.push('gum'); return fakeStream(); }
  });
  const Original = globalThis.BarcodeDetector;
  class SlowDetector extends Original {
    static async getSupportedFormats() {
      order.push('formats-wait');
      await formatsGate;
      order.push('formats');
      return ['qr_code', 'ean_13'];
    }
  }
  Object.defineProperty(globalThis, 'BarcodeDetector', { configurable: true, writable: true, value: SlowDetector });
  try {
    const ac = new AbortController();
    const started = startScanner(video, () => {}, { qr: 'all', signal: ac.signal });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(order.includes('play'), true);
    assert.ok(video.srcObject);
    const stream = video.srcObject;
    ac.abort();
    releaseFormats();
    await assert.rejects(started, (error) => error.name === 'AbortError');
    assert.equal(stream.getTracks()[0].stopped, true);
    assert.equal(video.srcObject, null);
  } finally { restore(); }
});

test('openScanner paints «Ανοίγει η κάμερα…», starts the camera in the tap, and yields before detector work', () => {
  const app = read('src/app.js');
  const barcode = read('src/barcode.js');
  const open = app.slice(app.indexOf('async function openScanner'), app.indexOf("function openUniversalScan"));
  assert.match(open, /status\.textContent = t\('Ανοίγει η κάμερα…'\)/);
  assert.match(open, /adoptCamera\(requestCamera\(\), ac\.signal\)/);
  assert.match(open, /dialog\.showModal\(\)/);
  assert.ok(open.indexOf('requestCamera()') < open.indexOf('dialog.showModal()'));
  assert.ok(open.indexOf('dialog.showModal()') < open.indexOf('await afterPaint()'));
  assert.ok(open.indexOf('await afterPaint()') < open.indexOf('startScanner('));
  assert.match(open, /signal: ac\.signal, streamPromise/);
  assert.match(open, /if \(!dialog\.open\) ac\.abort\(\)/);
  assert.match(open, /error\?\.name === 'AbortError'/);
  assert.match(app, /function afterPaint\(fn\)/);
  assert.match(app, /scheduler\?\.yield/);
  assert.match(app, /requestAnimationFrame\(\(\) => requestAnimationFrame\(run\)\)/);
  assert.match(app, /addEventListener\('pointerdown'/);
  assert.match(app, /warmScanner\(\)/);
  assert.match(barcode, /Start \(or adopt\) the camera first and show the preview, then set up BarcodeDetector/);
  assert.equal(dictionaries.en['Ανοίγει η κάμερα…'], 'Opening camera…');
});

test('the home scan button still starts openScanner in the same tap (camera permission gesture)', () => {
  const app = read('src/app.js');
  assert.match(app, /action === 'quick' && button\.dataset\.quick === 'scan'\) \{ pressFeedback\(button\); runQuickAction\('scan'\); \}/);
  const run = app.slice(app.indexOf('function runQuickAction'), app.indexOf('function helpButton'));
  assert.match(run, /id === 'scan'\) openUniversalScan\(\)/);
});
