// Unit-Tests: Design (Hintergrundfarbe, Farbverlauf, Symbole). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_DESIGN,
  designActive,
  designToJson,
  iconCount,
  iconMotion,
  ICON_OPTIONS,
  normalizeHex,
  readDesign,
} from '../../src/features/design/design-logic.ts';

test('Hex-Farben werden vereinheitlicht', () => {
  assert.equal(normalizeHex('3b82f6'), '#3B82F6');
  assert.equal(normalizeHex(' #ff8800 '), '#FF8800');
  assert.equal(normalizeHex('#38f'), '#3388FF');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('rot'), null);
  assert.equal(normalizeHex(42), null);
});

test('Ohne Einstellung: klassisch, nichts im Hintergrund', () => {
  for (const raw of [null, undefined, {}, 'quatsch']) {
    const d = readDesign(raw);
    assert.deepEqual(d, DEFAULT_DESIGN);
    assert.equal(designActive(d), false);
  }
});

test('Alte Einstellungen werden übernommen', () => {
  const aurora = readDesign({ background: 'aurora' });
  assert.equal(aurora.base, 'gradient');
  assert.equal(aurora.moving, true);
  assert.equal(readDesign({ background: 'business' }).gradient[1], '#8B5CF6');
  const money = readDesign({ background: 'money' });
  assert.equal(money.base, 'classic');
  assert.equal(money.icons, 'money');
  assert.equal(designActive(money), true);
  assert.equal(readDesign({ background: 'none' }).icons, 'none');
});

test('Neue Einstellungen: Farbe + Verlauf + Symbole, Unsinn fällt zurück', () => {
  const d = readDesign({
    base: 'gradient',
    color: 'ff0000',
    gradient: ['#111111', 'kaputt', '#222', '#333333', '#444444'],
    direction: 'right',
    moving: true,
    strength: 'strong',
    icons: 'rockets',
    density: 'many',
  });
  assert.equal(d.color, '#FF0000');
  assert.deepEqual(d.gradient, ['#111111', '#222222', '#333333']);
  assert.equal(d.direction, 'right');
  assert.equal(d.icons, 'rockets');
  // nur eine gültige Farbe → Standard-Verlauf bleibt
  assert.deepEqual(readDesign({ gradient: ['#111111'] }).gradient, DEFAULT_DESIGN.gradient);
  const bad = readDesign({ base: 'neon', icons: 'einhorn', strength: 9, density: 'alle' });
  assert.equal(bad.base, 'classic');
  assert.equal(bad.icons, 'none');
  assert.equal(bad.strength, 'medium');
  assert.equal(bad.density, 'normal');
  // gespeichert wird ohne die alte Einstellung
  assert.equal('background' in designToJson(d), false);
  assert.deepEqual(readDesign(designToJson(d)), d);
});

test('Geld ist der Dollarschein-Emoji, jedes Symbol bewegt sich', () => {
  assert.equal(ICON_OPTIONS.find((o) => o.key === 'money').emoji, '💵');
  for (const o of ICON_OPTIONS) {
    if (o.key === 'none') assert.equal(iconMotion(o.key), null);
    else assert.ok(iconMotion(o.key), o.key);
  }
  assert.ok(iconCount(14, 'many') > iconCount(14, 'normal'));
  assert.ok(iconCount(14, 'few') < iconCount(14, 'normal'));
  assert.ok(iconCount(2, 'few') >= 3);
});
