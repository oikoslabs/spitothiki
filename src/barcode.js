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

// Starts the camera in <video> and calls onCode once with the first barcode found.
// Uses the native BarcodeDetector where available, otherwise the ZXing library. Returns a stop() function.
export async function startScanner(video, onCode, { qr = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Η κάμερα δεν είναι διαθέσιμη σε αυτόν τον browser.');
  let formats = [];
  if ('BarcodeDetector' in globalThis) formats = await globalThis.BarcodeDetector.getSupportedFormats().catch(() => []);
  const wanted = formats.filter((f) => (qr ? f === 'qr_code' : /ean|upc|code_128|code_39|itf/.test(f)));
  if (wanted.length) {
    const detector = new globalThis.BarcodeDetector({ formats: wanted });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    let stopped = false;
    const stop = () => { stopped = true; stream.getTracks().forEach((track) => track.stop()); video.srcObject = null; };
    const tick = async () => {
      if (stopped) return;
      try {
        const [found] = await detector.detect(video);
        if (found?.rawValue) { stop(); onCode(found.rawValue); return; }
      } catch {}
      setTimeout(tick, 250);
    };
    tick();
    return stop;
  }
  const ZXing = await loadZxing();
  const reader = new ZXing.BrowserMultiFormatReader();
  let controls;
  controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (result) => {
    if (result) { controls?.stop(); onCode(result.getText()); }
  });
  return () => controls?.stop();
}
