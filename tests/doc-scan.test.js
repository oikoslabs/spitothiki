import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHomography, destSize, detectDocumentQuad, enhanceImageData, homography, orderCorners, quadArea, warpQuad } from '../src/doc-scan.js';

test('doc-scan: orderCorners is TL, TR, BR, BL and area is positive', () => {
  const ordered = orderCorners([{ x: 10, y: 80 }, { x: 90, y: 10 }, { x: 10, y: 10 }, { x: 90, y: 80 }]);
  assert.deepEqual(ordered.map((p) => `${p.x},${p.y}`), ['10,10', '90,10', '90,80', '10,80']);
  assert.equal(quadArea(ordered), 80 * 70);
});

test('doc-scan: homography maps destination rectangle corners back to the source quad', () => {
  const src = [{ x: 2, y: 2 }, { x: 12, y: 1 }, { x: 13, y: 11 }, { x: 1, y: 10 }];
  const H = homography(src, 10, 10);
  const tl = applyHomography(H, 0, 0);
  const br = applyHomography(H, 9, 9);
  assert.ok(Math.abs(tl.x - 2) < 0.15 && Math.abs(tl.y - 2) < 0.15);
  assert.ok(Math.abs(br.x - 13) < 0.15 && Math.abs(br.y - 11) < 0.15);
  const size = destSize(src, 100);
  assert.ok(size.width >= 32 && size.height >= 32);
});

test('doc-scan: warp + enhance keep dimensions; detector finds a bright rectangle on a dark field', () => {
  const width = 80;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= 15 && x <= 65 && y >= 15 && y <= 65;
      const v = inside ? 240 : 20;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  // Draw a darker border so Sobel sees edges.
  for (let x = 15; x <= 65; x++) {
    for (const y of [15, 65]) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 10;
    }
  }
  for (let y = 15; y <= 65; y++) {
    for (const x of [15, 65]) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 10;
    }
  }
  const image = { data, width, height };
  const corners = detectDocumentQuad(image);
  assert.equal(corners.length, 4);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  assert.ok(Math.min(...xs) <= 25 && Math.max(...xs) >= 55);
  assert.ok(Math.min(...ys) <= 25 && Math.max(...ys) >= 55);
  const warped = warpQuad(image, [{ x: 15, y: 15 }, { x: 65, y: 15 }, { x: 65, y: 65 }, { x: 15, y: 65 }], { width: 40, height: 40 });
  assert.equal(warped.width, 40);
  const mid = ((20 * 40) + 20) * 4;
  assert.ok(warped.data[mid] > 200);
  const enhanced = enhanceImageData(warped);
  assert.equal(enhanced.width, 40);
  assert.equal(enhanced.data.length, 40 * 40 * 4);
});
