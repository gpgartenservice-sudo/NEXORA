// Unit-Tests: Akzentfarbe und Lunas Aussehen (Hut, Farben der Figur). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ACCENT_COLORS, accentName, DEFAULT_ACCENT, readAccent, rgbaOf } from '../../src/constants/accent.ts';
import { DEFAULT_LUNA, hatHidesAntenna, LUNA_HATS, lunaPalette, readLunaLook, shadeHex } from '../../src/features/assistant/luna-look.ts';
import { DEFAULT_DESIGN, designActive, designToJson, readDesign, sameDesign } from '../../src/features/design/design-logic.ts';

test('Akzentfarbe: nur Farben aus der Auswahl', () => {
  assert.equal(DEFAULT_ACCENT, '#2FE39A');
  assert.equal(readAccent(undefined), DEFAULT_ACCENT);
  assert.equal(readAccent(' #a78bfa\n'), '#A78BFA'); // so steht sie in der Datei auf dem Handy
  assert.equal(readAccent('#123456'), DEFAULT_ACCENT);
  assert.equal(readAccent(42), DEFAULT_ACCENT);
  assert.equal(accentName('#FBBF24'), 'Gold');
  assert.equal(rgbaOf('#2FE39A', 0.45), 'rgba(47,227,154,0.45)');
  assert.equal(new Set(ACCENT_COLORS.map((c) => c.hex)).size, ACCENT_COLORS.length);
  // schwarze Schrift auf der Akzentfarbe muss lesbar bleiben (Kontrast mind. 4,5 : 1)
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const c of ACCENT_COLORS) assert.ok((lum(c.hex) + 0.05) / 0.05 >= 4.5, c.name);
});

test('Luna: Hut lesen', () => {
  assert.deepEqual(readLunaLook(undefined), DEFAULT_LUNA);
  assert.deepEqual(readLunaLook({ hat: 'crown' }), { hat: 'crown' });
  assert.deepEqual(readLunaLook({ hat: 'sombrero' }), DEFAULT_LUNA);
  assert.equal(new Set(LUNA_HATS.map((h) => h.key)).size, LUNA_HATS.length);
  assert.equal(hatHidesAntenna('crown'), true);
  assert.equal(hatHidesAntenna('bow'), false);
  assert.equal(hatHidesAntenna('none'), false);
});

test('Luna: Farben der Figur aus der Akzentfarbe', () => {
  // Standard sieht aus wie bisher
  const green = lunaPalette('#2FE39A');
  assert.deepEqual(green.body, ['#23775A', '#0D261C', '#050A08']);
  assert.equal(green.glow(0.45), 'rgba(47,227,154,0.45)');
  // andere Farben: dunkle Kugel in dieser Farbe
  const pink = lunaPalette('#FF7AB6');
  assert.equal(pink.accent, '#FF7AB6');
  assert.deepEqual(pink.body, ['#803D5B', '#2B151F', '#0B0508']);
  assert.equal(shadeHex('#FF7AB6', 0.5), '#803D5B');
  assert.equal(shadeHex('#000000', 2), '#FFFFFF');
});

test('Design: Akzentfarbe + Hut gespeichert, aber kein Pro-Design', () => {
  const d = readDesign({ base: 'classic', accent: '#FBBF24', luna: { hat: 'helmet' } });
  assert.equal(d.accent, '#FBBF24');
  assert.deepEqual(d.luna, { hat: 'helmet' });
  assert.equal(designActive(d), false); // zählt nicht als Hintergrund → auch ohne Pro
  assert.deepEqual(readDesign(designToJson(d)), d);
  assert.equal(sameDesign(d, DEFAULT_DESIGN), false);
  assert.equal(readDesign({}).accent, DEFAULT_ACCENT);
  assert.deepEqual(readDesign({}).luna, DEFAULT_LUNA);
  // kurzzeitig gespeichert: Lunas Farbe → wird zur Akzentfarbe
  assert.equal(readDesign({ luna: { color: '#ff7ab6', hat: 'crown' } }).accent, '#FF7AB6');
});
