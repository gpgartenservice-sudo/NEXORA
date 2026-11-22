// Unit-Tests: Lunas Aussehen (Farbe, Hut). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_LUNA, hatHidesAntenna, LUNA_COLORS, LUNA_HATS, lunaPalette, readLunaLook } from '../../src/features/assistant/luna-look.ts';
import { DEFAULT_DESIGN, designActive, designToJson, readDesign, sameDesign } from '../../src/features/design/design-logic.ts';

test('Luna: gespeichertes Aussehen lesen', () => {
  assert.deepEqual(readLunaLook(undefined), DEFAULT_LUNA);
  assert.deepEqual(readLunaLook({ color: '#ff7ab6', hat: 'crown' }), { color: '#FF7AB6', hat: 'crown' });
  // nur Farben aus der Auswahl, nur bekannte Hüte
  assert.deepEqual(readLunaLook({ color: '#123456', hat: 'sombrero' }), DEFAULT_LUNA);
  assert.equal(new Set(LUNA_HATS.map((h) => h.key)).size, LUNA_HATS.length);
  assert.equal(new Set(LUNA_COLORS.map((c) => c.hex)).size, LUNA_COLORS.length);
});

test('Luna: Farben der Figur', () => {
  // Standard sieht aus wie bisher
  const green = lunaPalette('#2FE39A');
  assert.deepEqual(green.body, ['#23775A', '#0D261C', '#050A08']);
  assert.equal(green.glow(0.45), 'rgba(47,227,154,0.45)');
  // andere Farben: dunkle Kugel in dieser Farbe
  const pink = lunaPalette('#FF7AB6');
  assert.equal(pink.accent, '#FF7AB6');
  assert.deepEqual(pink.body, ['#803D5B', '#2B151F', '#0B0508']);
  assert.equal(hatHidesAntenna('crown'), true);
  assert.equal(hatHidesAntenna('bow'), false);
  assert.equal(hatHidesAntenna('none'), false);
});

test('Luna im Design: gespeichert, verglichen, aber kein Pro-Design', () => {
  const d = readDesign({ base: 'classic', luna: { color: '#FBBF24', hat: 'helmet' } });
  assert.deepEqual(d.luna, { color: '#FBBF24', hat: 'helmet' });
  assert.equal(designActive(d), false); // zählt nicht als Hintergrund → auch ohne Pro
  assert.deepEqual(readDesign(designToJson(d)), d);
  assert.equal(sameDesign(d, DEFAULT_DESIGN), false);
  assert.deepEqual(readDesign({}).luna, DEFAULT_LUNA);
});
