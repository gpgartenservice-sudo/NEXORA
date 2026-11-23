// Unit-Tests: graue Schrift passend zum Design (src/constants/text-tone.ts). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readTextTone, TEXT_TONES } from '../../src/constants/text-tone.ts';

test('readTextTone: nur "design" schaltet um, alles andere bleibt klassisch', () => {
  assert.equal(readTextTone('design'), 'design');
  assert.equal(readTextTone(' design\n'), 'design');
  for (const raw of [null, undefined, '', 'classic', 'Design', 'kaputt']) assert.equal(readTextTone(raw), 'classic');
});

test('TEXT_TONES: klassisch wie bisher, mit Design heller und gestuft', () => {
  assert.deepEqual(TEXT_TONES.classic, { muted: '#8E8E93', faint: '#55555A' });
  const alpha = (c) => Number(/rgba\(255,255,255,([\d.]+)\)/.exec(c)?.[1]);
  const { muted, faint } = TEXT_TONES.design;
  assert.ok(alpha(muted) > alpha(faint), 'grau bleibt heller als blass');
  assert.ok(alpha(faint) >= 0.5 && alpha(muted) < 1, 'lesbar, aber nicht so hell wie normale Schrift');
});
