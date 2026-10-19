import { interpretCode } from './gs1.js';
// Barcode scanning (camera) and product lookup through the Open Food Facts API.
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
const ZXING_SRI = 'sha384-ylLhng89kD62+PVK1cjm4rAYg69zDlGrbbSfAE2Eb8Xqf8RoAQCMcRoUXZh7pAPC';
const OFF_FIELDS = 'product_name,product_name_el,generic_name_el,brands,categories_tags,quantity';

const CATEGORY_RULES = [
  ['Γαλακτοκομικά', ['dairies', 'milks', 'cheeses', 'yogurts', 'butters', 'creams']],
  ['Κατεψυγμένα', ['frozen']],
  ['Κρέας & ψάρι', ['meats', 'fishes', 'seafood', 'poultry', 'sausages', 'hams']],
  ['Ροφήματα', ['beverages', 'coffees', 'teas', 'juices', 'waters', 'sodas', 'drinks']],
  ['Φρούτα & λαχανικά', ['fruits', 'vegetables', 'fresh-foods', 'legumes']],
  ['Ξηρά τρόφιμα', ['cereals', 'pastas', 'rices', 'flours', 'breads', 'biscuits', 'snacks', 'olive-oils', 'vegetable-oils', 'sugars', 'canned', 'sauces', 'spreads', 'honeys']],
  ['Καθαριότητα', ['cleaning', 'detergents', 'household']]
];

export function normalizeBarcode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : '';
}

export function categoryFromTags(tags = []) {
  const list = tags.map((tag) => String(tag).replace(/^[a-z]{2}:/, ''));
  for (const [category, keys] of CATEGORY_RULES) {
    if (list.some((tag) => keys.some((key) => tag === key || tag.endsWith(`-${key}`) || tag.startsWith(`${key}-`)))) return category;
  }
  return '';
}

export function productFromOff(product = {}) {
  const base = String(product.product_name_el || product.generic_name_el || product.product_name || '').trim();
  const brand = String(product.brands || '').split(',')[0].trim();
  const name = brand && base && !base.toLocaleLowerCase('el-GR').includes(brand.toLocaleLowerCase('el-GR')) ? `${base} ${brand}` : (base || brand);
  return { name: name.slice(0, 80), category: categoryFromTags(product.categories_tags || []) };
}

export async function lookupBarcode(code, fetchImpl = globalThis.fetch) {
  const barcode = normalizeBarcode(code);
  if (!barcode) throw new Error('Ο κωδικός δεν είναι έγκυρος barcode.');
  const response = await fetchImpl(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Η αναζήτηση στο Open Food Facts απέτυχε.');
  const data = await response.json();
  if (data.status !== 1 || !data.product) return null;
  const product = productFromOff(data.product);
  return product.name ? product : null;
}

function loadZxing() {
  if (globalThis.ZXingBrowser) return Promise.resolve(globalThis.ZXingBrowser);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ZXING_URL;
    script.integrity = ZXING_SRI;
    script.crossOrigin = 'anonymous';
    script.onload = () => globalThis.ZXingBrowser ? resolve(globalThis.ZXingBrowser) : reject(new Error('zxing'));
    script.onerror = () => reject(new Error('Δεν φόρτωσε ο σαρωτής. Έλεγξε τη σύνδεση.'));
    document.head.append(script);
  });
}

// Formats per scanner mode (BarcodeDetector names). Modes: 'product' (default), 'bill', 'receipt'.
const MODE_FORMATS = {
  product: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'data_matrix', 'qr_code'],
  bill: ['code_128', 'itf', 'code_39', 'pdf417', 'qr_code', 'data_matrix'],
  receipt: ['qr_code', 'code_128', 'itf', 'code_39', 'ean_13', 'pdf417']
};
// ZXing BarcodeFormat enum values for the same names.
const ZX = { aztec: 0, codabar: 1, code_39: 2, code_93: 3, code_128: 4, data_matrix: 5, ean_8: 6, ean_13: 7, itf: 8, pdf417: 10, qr_code: 11, upc_a: 14, upc_e: 15 };
export function scanMode(qr) { return qr === 'any' ? 'bill' : qr ? 'receipt' : 'product'; }
export function scanFormats(mode) { return MODE_FORMATS[mode] || MODE_FORMATS.product; }
export function zxingFormats(mode) { return scanFormats(mode).map((f) => ZX[f]).filter((n) => n !== undefined); }

// Best-effort camera tuning: continuous focus, ~2x zoom when the lens allows it. Returns torch support.
async function tuneCamera(track) {
  const caps = track.getCapabilities?.() || {};
  const advanced = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.zoom && caps.zoom.max >= 1.5) advanced.push({ zoom: Math.min(2, caps.zoom.max) });
  for (const c of advanced) { try { await track.applyConstraints({ advanced: [c] }); } catch {} }
  return Boolean(caps.torch);
}

// Starts the camera in <video> and calls onCode once with the first accepted code.
// Native BarcodeDetector where it supports the mode's formats, otherwise ZXing (TRY_HARDER).
// Scans ~8 times/s, alternating a central crop (the on-screen scan box) and the full frame.
// Returns stop(); stop.torch(on) toggles the flashlight when supported (stop.hasTorch).
export async function startScanner(video, onCode, { qr = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Η κάμερα δεν είναι διαθέσιμη σε αυτόν τον browser.');
  const mode = scanMode(qr);
  const wanted = scanFormats(mode);
  let native = [];
  if ('BarcodeDetector' in globalThis) native = await globalThis.BarcodeDetector.getSupportedFormats().catch(() => []);
  const nativeFormats = wanted.filter((f) => native.includes(f));
  // Product mode accepts retail barcodes and GS1 DataMatrix / GS1 QR / Digital Link; other QR codes are ignored.
  const accept = (value) => mode !== 'product' || interpretCode(value).barcode;
  let decode;
  if (nativeFormats.length) {
    const detector = new globalThis.BarcodeDetector({ formats: nativeFormats });
    decode = async (canvas) => (await detector.detect(canvas))[0]?.rawValue || '';
  } else {
    const ZXing = await loadZxing();
    const hints = new Map([[2, zxingFormats(mode)], [3, true]]); // POSSIBLE_FORMATS, TRY_HARDER
    const reader = new ZXing.BrowserMultiFormatReader(hints);
    decode = async (canvas) => { try { return reader.decodeFromCanvas(canvas).getText(); } catch { return ''; } };
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  const track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  await video.play();
  const hasTorch = track ? await tuneCamera(track) : false;
  let stopped = false, frame = 0;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const stop = () => { stopped = true; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  stop.hasTorch = hasTorch;
  stop.torch = async (on) => { try { await track.applyConstraints({ advanced: [{ torch: Boolean(on) }] }); return true; } catch { return false; } };
  const tick = async () => {
    if (stopped) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (w && h) {
      const crop = frame++ % 2 === 0; // central box: 80% width, 50% height
      const sw = crop ? Math.round(w * 0.8) : w, sh = crop ? Math.round(h * 0.5) : h;
      canvas.width = sw; canvas.height = sh;
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, sw, sh);
      try {
        const value = await decode(canvas);
        if (value && accept(value) && !stopped) { stop(); onCode(value); return; }
      } catch {}
    }
    setTimeout(tick, 125);
  };
  tick();
  return stop;
}
