// On-device document scanner for receipt photos (Pro). Detects a page, lets the
// user drag corners, applies perspective + enhance, then hands a still image to
// the existing (free) OCR path. The cleaned image is not stored — receipts have
// no image field. Lazy-loaded from the receipt photo flow.

export function orderCorners(points) {
  const pts = (points || []).map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  if (pts.length !== 4 || pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Χρειάζονται 4 γωνίες.');
  }
  const byY = [...pts].sort((a, b) => a.y - b.y || a.x - b.x);
  const top = byY.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = byY.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]]; // TL, TR, BR, BL
}

export function quadArea(points) {
  const p = orderCorners(points);
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const b = p[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

function solve8(A, b) {
  // Gaussian elimination with partial pivoting, 8x8.
  const m = A.map((row, i) => [...row.map(Number), Number(b[i])]);
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-12) throw new Error('Η προοπτική δεν μπόρεσε να υπολογιστεί.');
    if (piv !== col) { const tmp = m[col]; m[col] = m[piv]; m[piv] = tmp; }
    const div = m[col][col];
    for (let c = col; c <= n; c++) m[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

// Homography mapping destination rectangle pixels → source image coordinates.
export function homography(srcCorners, destWidth, destHeight) {
  const src = orderCorners(srcCorners);
  const dst = [
    { x: 0, y: 0 },
    { x: destWidth - 1, y: 0 },
    { x: destWidth - 1, y: destHeight - 1 },
    { x: 0, y: destHeight - 1 }
  ];
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i];
    const d = dst[i];
    // Map dest → source: s = H * d
    A.push([d.x, d.y, 1, 0, 0, 0, -s.x * d.x, -s.x * d.y]);
    b.push(s.x);
    A.push([0, 0, 0, d.x, d.y, 1, -s.y * d.x, -s.y * d.y]);
    b.push(s.y);
  }
  const h = solve8(A, b);
  return [...h, 1];
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w };
}

function sampleBilinear(data, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) {
    const xi = Math.max(0, Math.min(width - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(height - 1, Math.round(y)));
    const i = (yi * width + xi) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dx = x - x0;
  const dy = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = i00 + 4;
  const i01 = i00 + width * 4;
  const i11 = i01 + 4;
  const out = [];
  for (let c = 0; c < 4; c++) {
    const v = data[i00 + c] * (1 - dx) * (1 - dy) + data[i10 + c] * dx * (1 - dy) + data[i01 + c] * (1 - dx) * dy + data[i11 + c] * dx * dy;
    out[c] = v;
  }
  return out;
}

export function destSize(corners, maxSide = 1600) {
  const [tl, tr, br, bl] = orderCorners(corners);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  w = Math.max(32, Math.round(w));
  h = Math.max(32, Math.round(h));
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.max(32, Math.round(w * scale)), height: Math.max(32, Math.round(h * scale)) };
}

export function warpQuad(imageData, corners, size) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const { width, height } = size || destSize(corners);
  const H = homography(corners, width, height);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = applyHomography(H, x, y);
      const [r, g, b, a] = sampleBilinear(imageData.data, srcW, srcH, p.x, p.y);
      const i = (y * width + x) * 4;
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
    }
  }
  return { data: out, width, height };
}

export function enhanceImageData(imageData, { contrast = 1.25, sharpen = 0.45 } = {}) {
  const { width, height, data } = imageData;
  const n = width * height;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(n * 0.02)] ?? 0;
  const hi = sorted[Math.min(n - 1, Math.floor(n * 0.98))] ?? 255;
  const span = Math.max(8, hi - lo);
  const mid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = ((gray[i] - lo) / span) * 255;
    v = (v - 128) * contrast + 128;
    mid[i] = Math.max(0, Math.min(255, v));
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = mid[i];
      if (sharpen && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const blur = (
          mid[i - width - 1] + mid[i - width] + mid[i - width + 1] +
          mid[i - 1] + mid[i] + mid[i + 1] +
          mid[i + width - 1] + mid[i + width] + mid[i + width + 1]
        ) / 9;
        v = Math.max(0, Math.min(255, v + (v - blur) * sharpen * 2));
      }
      const o = i * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return { data: out, width, height };
}

function grayscale(data, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  return gray;
}

function sobelMag(gray, width, height) {
  const mag = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] + gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy = -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] + gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      mag[i] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

function fitLine(points, swap) {
  if (!points.length) return null;
  // Least squares: y = a + b x  (or x = a + b y when swap)
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = points.length;
  for (const p of points) {
    const x = swap ? p.y : p.x;
    const y = swap ? p.x : p.y;
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-6) {
    const x = sx / n;
    return swap ? { type: 'x', a: x, b: 0 } : { type: 'y', a: sy / n, b: 0 };
  }
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  return swap ? { type: 'x', a, b } : { type: 'y', a, b }; // x = a + b y  or y = a + b x
}

function lineAt(line, t) {
  if (!line) return null;
  if (line.type === 'x') return { x: line.a + line.b * t, y: t };
  return { x: t, y: line.a + line.b * t };
}

function intersect(a, b) {
  if (!a || !b) return null;
  // Solve two line equations.
  // y = ay + by * x    or   x = ax + bx * y
  const eq = (line) => {
    if (line.type === 'y') return { A: line.b, B: -1, C: -line.a }; // by*x - y = -ay
    return { A: -1, B: line.b, C: -line.a }; // -x + bx*y = -ax
  };
  const p = eq(a);
  const q = eq(b);
  const det = p.A * q.B - q.A * p.B;
  if (Math.abs(det) < 1e-8) return null;
  return { x: (p.C * q.B - q.C * p.B) / det, y: (p.A * q.C - q.A * p.C) / det };
}

export function detectDocumentQuad(imageData, { inset = 0.04 } = {}) {
  const { width, height, data } = imageData;
  const gray = grayscale(data, width, height);
  const mag = sobelMag(gray, width, height);
  let sum = 0;
  for (let i = 0; i < mag.length; i++) sum += mag[i];
  const mean = sum / mag.length;
  let varSum = 0;
  for (let i = 0; i < mag.length; i++) { const d = mag[i] - mean; varSum += d * d; }
  const thresh = mean + Math.sqrt(varSum / mag.length) * 0.6;
  const band = Math.floor(height * 0.12);
  const left = [];
  const right = [];
  for (let y = band; y < height - band; y++) {
    let L = -1;
    let R = -1;
    for (let x = 0; x < width; x++) if (mag[y * width + x] > thresh) { L = x; break; }
    for (let x = width - 1; x >= 0; x--) if (mag[y * width + x] > thresh) { R = x; break; }
    if (L >= 0) left.push({ x: L, y });
    if (R >= 0) right.push({ x: R, y });
  }
  const vband = Math.floor(width * 0.12);
  const top = [];
  const bottom = [];
  for (let x = vband; x < width - vband; x++) {
    let T = -1;
    let B = -1;
    for (let y = 0; y < height; y++) if (mag[y * width + x] > thresh) { T = y; break; }
    for (let y = height - 1; y >= 0; y--) if (mag[y * width + x] > thresh) { B = y; break; }
    if (T >= 0) top.push({ x, y: T });
    if (B >= 0) bottom.push({ x, y: B });
  }
  const L = fitLine(left, true);
  const R = fitLine(right, true);
  const T = fitLine(top, false);
  const B = fitLine(bottom, false);
  let corners = [intersect(T, L), intersect(T, R), intersect(B, R), intersect(B, L)];
  const ok = corners.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= -width * 0.1 && p.x <= width * 1.1 && p.y >= -height * 0.1 && p.y <= height * 1.1);
  if (!ok || quadArea(corners) < width * height * 0.15) {
    const m = inset;
    corners = [
      { x: width * m, y: height * m },
      { x: width * (1 - m), y: height * m },
      { x: width * (1 - m), y: height * (1 - m) },
      { x: width * m, y: height * (1 - m) }
    ];
  }
  return orderCorners(corners.map((p) => ({
    x: Math.max(0, Math.min(width - 1, p.x)),
    y: Math.max(0, Math.min(height - 1, p.y))
  })));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Η φωτογραφία δεν μπόρεσε να ανοίξει.')); };
    img.src = url;
  });
}

function drawToCanvas(img, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}

function toBlob(imageData, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(new ImageData(imageData.data, imageData.width, imageData.height), 0, 0);
    canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('Η εικόνα δεν μπόρεσε να αποθηκευτεί.')); }, type, quality);
  });
}

// Interactive crop: 4 draggable corners, enhance toggle. Resolves a JPEG File/Blob, the
// original file if the user skips, or null if cancelled.
export async function openDocScan(file, { t = (s) => s, escapeHtml = (s) => String(s ?? ''), dialog } = {}) {
  const img = await loadImage(file);
  const { canvas, ctx, width, height } = drawToCanvas(img);
  const source = ctx.getImageData(0, 0, width, height);
  let corners = detectDocumentQuad(source);
  let enhance = true;
  let drag = -1;

  const el = dialog || document.querySelector('#doc-scan-dialog') || makeDialog();
  const view = el.querySelector('#doc-scan-view') || el;
  const stage = el.querySelector('#doc-scan-canvas') || canvas;
  if (stage !== canvas) {
    stage.width = width;
    stage.height = height;
  }
  const label = (s) => escapeHtml(t(s));
  el.querySelector('#doc-scan-title') && (el.querySelector('#doc-scan-title').textContent = t('Σάρωση εγγράφου'));
  const hint = el.querySelector('#doc-scan-hint');
  if (hint) hint.textContent = t('Τράβηξε τις 4 γωνίες της απόδειξης. Η βελτίωση γίνεται στη συσκευή σου και η φωτογραφία δεν αποθηκεύεται.');
  const enhanceBox = el.querySelector('#doc-scan-enhance');
  if (enhanceBox) enhanceBox.checked = enhance;

  const paint = () => {
    const c = stage.getContext('2d');
    c.clearRect(0, 0, stage.width, stage.height);
    c.drawImage(canvas, 0, 0, stage.width, stage.height);
    const sx = stage.width / width;
    const sy = stage.height / height;
    const pts = corners.map((p) => ({ x: p.x * sx, y: p.y * sy }));
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    c.fillStyle = 'rgba(47, 124, 74, 0.18)';
    c.fill();
    c.strokeStyle = '#2f7c4a';
    c.lineWidth = 2;
    c.stroke();
    pts.forEach((p) => {
      c.beginPath();
      c.arc(p.x, p.y, 11, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      c.strokeStyle = '#2f7c4a';
      c.lineWidth = 2;
      c.stroke();
    });
  };

  const pointFromEvent = (event) => {
    const rect = stage.getBoundingClientRect();
    const ev = event.touches ? event.touches[0] : event;
    const x = ((ev.clientX - rect.left) / rect.width) * width;
    const y = ((ev.clientY - rect.top) / rect.height) * height;
    return { x, y };
  };
  const nearest = (p) => {
    let best = 0;
    let d = Infinity;
    corners.forEach((c, i) => {
      const dist = Math.hypot(c.x - p.x, c.y - p.y);
      if (dist < d) { d = dist; best = i; }
    });
    const limit = Math.max(28, Math.max(width, height) * 0.08);
    return d <= limit ? best : -1;
  };

  const onDown = (event) => {
    const p = pointFromEvent(event);
    drag = nearest(p);
    if (drag >= 0) event.preventDefault();
  };
  const onMove = (event) => {
    if (drag < 0) return;
    event.preventDefault();
    const p = pointFromEvent(event);
    corners[drag] = { x: Math.max(0, Math.min(width - 1, p.x)), y: Math.max(0, Math.min(height - 1, p.y)) };
    paint();
  };
  const onUp = () => { drag = -1; };

  const finish = (value) => {
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    el.removeEventListener('click', onClick);
    if (el.open) el.close();
    resolve(value);
  };

  const confirm = async () => {
    try {
      let image = warpQuad(source, corners);
      if (enhance) image = enhanceImageData(image);
      const blob = await toBlob(image);
      finish(new File([blob], file.name || 'receipt.jpg', { type: 'image/jpeg' }));
    } catch (err) {
      finish(file);
    }
  };

  const onClick = (event) => {
    const action = event.target?.closest?.('[data-action]')?.dataset.action;
    if (action === 'doc-scan-confirm') confirm();
    else if (action === 'doc-scan-skip') finish(file);
    else if (action === 'doc-scan-cancel') finish(null);
    else if (action === 'doc-scan-auto') { corners = detectDocumentQuad(source); paint(); }
    else if (event.target?.id === 'doc-scan-enhance') enhance = event.target.checked;
  };

  let resolve;
  const done = new Promise((r) => { resolve = r; });
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  el.addEventListener('click', onClick);
  paint();
  if (typeof el.showModal === 'function' && !el.open) el.showModal();
  return done;
}

function makeDialog() {
  const el = document.createElement('dialog');
  el.id = 'doc-scan-dialog';
  el.className = 'menu-sheet doc-scan-dialog';
  el.innerHTML = `<div class="dialog-heading"><div><p class="eyebrow">Pro</p><h2 id="doc-scan-title">Σάρωση εγγράφου</h2></div><button class="icon-button" type="button" data-action="doc-scan-cancel" aria-label="Κλείσιμο">×</button></div>
    <p class="field-hint" id="doc-scan-hint">Τράβηξε τις 4 γωνίες της απόδειξης. Η βελτίωση γίνεται στη συσκευή σου και η φωτογραφία δεν αποθηκεύεται.</p>
    <div class="doc-scan-stage"><canvas id="doc-scan-canvas"></canvas></div>
    <label class="check-row"><input type="checkbox" id="doc-scan-enhance" checked> <span>Βελτίωση εικόνας</span></label>
    <div class="dialog-actions">
      <button class="button button-quiet" type="button" data-action="doc-scan-auto">Αυτόματες γωνίες</button>
      <button class="button button-quiet" type="button" data-action="doc-scan-skip">Χωρίς περικοπή</button>
      <button class="button button-primary" type="button" data-action="doc-scan-confirm">Συνέχεια στην αναγνώριση</button>
    </div>`;
  document.body.appendChild(el);
  return el;
}

export const DOC_SCAN_EN = {
  'Σάρωση εγγράφου': 'Document scan',
  'Τράβηξε τις 4 γωνίες της απόδειξης. Η βελτίωση γίνεται στη συσκευή σου και η φωτογραφία δεν αποθηκεύεται.': 'Drag the 4 corners of the receipt. Enhancement runs on your device and the photo is not stored.',
  'Βελτίωση εικόνας': 'Enhance image',
  'Αυτόματες γωνίες': 'Auto corners',
  'Χωρίς περικοπή': 'Skip crop',
  'Συνέχεια στην αναγνώριση': 'Continue to recognition',
  'Χρειάζονται 4 γωνίες.': 'Four corners are required.',
  'Η προοπτική δεν μπόρεσε να υπολογιστεί.': 'Perspective could not be calculated.',
  'Η φωτογραφία δεν μπόρεσε να ανοίξει.': 'The photo could not be opened.',
  'Η εικόνα δεν μπόρεσε να αποθηκευτεί.': 'The image could not be saved.'
};
