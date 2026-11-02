// Unit-Tests fürs Firmenlogo. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { base64ToBytes, contentBox, fitInto, fitWithin, hasTransparency, imageType } from '../../src/features/documents/logo-logic.ts';

/** Bild w×h, Hintergrund bg, Rechteck [x,y,w,h] in Farbe fg */
function image(w, h, bg, rect, fg = [20, 120, 80, 255]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inside = rect && x >= rect[0] && x < rect[0] + rect[2] && y >= rect[1] && y < rect[1] + rect[3];
      px.set(inside ? fg : bg, (y * w + x) * 4);
    }
  return px;
}

test('fitWithin verkleinert proportional, vergrößert nie', () => {
  assert.deepEqual(fitWithin(1600, 400, 800, 480), { width: 800, height: 200 });
  assert.deepEqual(fitWithin(500, 1000, 800, 480), { width: 240, height: 480 });
  assert.deepEqual(fitWithin(120, 40, 800, 480), { width: 120, height: 40 });
});

test('fitInto passt ins PDF-Feld (auch größer)', () => {
  assert.deepEqual(fitInto(100, 50, 180, 40), { width: 80, height: 40 });
  assert.deepEqual(fitInto(900, 100, 180, 40), { width: 180, height: 20 });
});

test('Durchsichtige Ränder werden abgeschnitten', () => {
  const px = image(20, 10, [0, 0, 0, 0], [5, 2, 6, 3]);
  assert.deepEqual(contentBox(px, 20, 10), { x: 5, y: 2, width: 6, height: 3 });
  assert.equal(hasTransparency(px), true);
});

test('Weiße Ränder werden abgeschnitten (z. B. JPG)', () => {
  const px = image(20, 10, [255, 255, 255, 255], [1, 1, 18, 4]);
  assert.deepEqual(contentBox(px, 20, 10), { x: 1, y: 1, width: 18, height: 4 });
  assert.equal(hasTransparency(px), false);
});

test('Farbiger Hintergrund bleibt komplett', () => {
  const px = image(8, 8, [10, 10, 10, 255], [2, 2, 2, 2], [255, 255, 255, 255]);
  assert.deepEqual(contentBox(px, 8, 8), { x: 0, y: 0, width: 8, height: 8 });
});

test('Komplett leeres Bild -> null', () => {
  assert.equal(contentBox(image(6, 6, [0, 0, 0, 0]), 6, 6), null);
});

test('Bildtyp an den ersten Bytes erkennen', () => {
  assert.equal(imageType([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png');
  assert.equal(imageType([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');
  assert.equal(imageType([0x47, 0x49, 0x46, 0x38]), null);
  assert.deepEqual([...base64ToBytes('iVBORw0K')], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
});
