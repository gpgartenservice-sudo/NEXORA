// Unit-Tests: Einführungen (Schritte, Rundgang, Speichern, Kartenposition). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TOUR, TUTORIALS } from '../../src/features/tutorial/tutorial-content.ts';
import {
  cleanDone,
  highlightRect,
  nextInTour,
  onScreen,
  placeCard,
  shouldAutoStart,
  visibleSteps,
  withDone,
} from '../../src/features/tutorial/tutorial-logic.ts';

test('Inhalte: jeder Bereich hat kurze Schritte mit Titel und Text', () => {
  for (const [id, t] of Object.entries(TUTORIALS)) {
    assert.equal(t.id, id);
    assert.ok(t.steps.length >= 2 && t.steps.length <= 5, `${id}: 2–5 Schritte`);
    for (const s of t.steps) {
      assert.ok(s.title.length > 0 && s.title.length <= 40, `${id}: Titel „${s.title}“`);
      assert.ok(s.text.length > 0 && s.text.length <= 240, `${id}: Text zu lang (${s.text.length})`);
      assert.ok(!s.optional || s.target, `${id}: optionaler Schritt braucht eine Stelle`);
      if (s.target) assert.ok(s.target.startsWith(`${id}.`), `${id}: Stelle ${s.target} gehört zum Bereich`);
    }
    // mindestens ein Schritt ohne „optional“, damit nie eine leere Einführung entsteht
    assert.ok(t.steps.some((s) => !s.optional), `${id}: braucht einen festen Schritt`);
  }
});

test('Rundgang: alle Bereiche der Navigation nacheinander, jeder mit Adresse', () => {
  assert.deepEqual(TOUR, ['home', 'fahrplan', 'kunden', 'auftraege', 'termine', 'aufgaben', 'firma', 'finanzen', 'social', 'nexy']);
  for (const id of TOUR) assert.ok(TUTORIALS[id].href, id);
  assert.equal(nextInTour('home'), 'fahrplan');
  assert.equal(nextInTour('social'), 'nexy');
  assert.equal(nextInTour('nexy'), null);
  assert.equal(nextInTour('auftrag'), null); // nicht im Rundgang
});

test('Optionale Schritte nur, wenn es die Stelle gibt', () => {
  const steps = TUTORIALS.kunden.steps;
  assert.equal(visibleSteps(steps, () => false).length, 2); // leere Kundenliste: Anlegen + Tipp
  assert.equal(visibleSteps(steps, () => true).length, 4);
  assert.deepEqual(
    visibleSteps(steps, (t) => t === 'kunden.suche').map((s) => s.target ?? '-'),
    ['kunden.neu', 'kunden.suche', '-'],
  );
});

test('Gesehen-Liste: nur bekannte, ohne Doppelte; automatisch nur beim ersten Mal', () => {
  assert.deepEqual(cleanDone(['kunden', 'quatsch', 'home', 'kunden', null, 5]), ['home', 'kunden']);
  assert.deepEqual(cleanDone('home'), []);
  assert.deepEqual(withDone(['home'], 'nexy'), ['home', 'nexy']);
  const same = ['home'];
  assert.equal(withDone(same, 'home'), same);
  const base = { ready: true, off: false, done: ['home'], active: false };
  assert.equal(shouldAutoStart('kunden', base), true);
  assert.equal(shouldAutoStart('home', base), false);
  assert.equal(shouldAutoStart('kunden', { ...base, off: true }), false);
  assert.equal(shouldAutoStart('kunden', { ...base, active: true }), false);
  assert.equal(shouldAutoStart('kunden', { ...base, ready: false }), false);
});

test('Karte: unter der Stelle, sonst darüber, sonst unten; ohne Stelle mittig', () => {
  const view = { width: 1280, height: 900 };
  const card = { width: 380, height: 200 };
  assert.deepEqual(placeCard({ x: 300, y: 100, width: 500, height: 80 }, card, view), { left: 300, top: 194, width: 380 });
  assert.deepEqual(placeCard({ x: 300, y: 650, width: 500, height: 200 }, card, view), { left: 300, top: 436, width: 380 });
  // sehr hoch: weder darunter noch darüber Platz -> unten
  assert.deepEqual(placeCard({ x: 300, y: 20, width: 500, height: 860 }, card, view), { left: 300, top: 684, width: 380 });
  // ganz rechts: bleibt im Bild
  assert.equal(placeCard({ x: 1200, y: 100, width: 60, height: 40 }, card, view).left, 1280 - 380 - 16);
  assert.deepEqual(placeCard(null, card, view), { left: 450, top: 350, width: 380 });
  // Handy: volle Breite mit Rand
  assert.deepEqual(placeCard({ x: 20, y: 100, width: 350, height: 60 }, card, { width: 390, height: 844 }), { left: 16, top: 174, width: 358 });
});

test('Hervorhebung: etwas Luft, im Bildschirm; außerhalb = keine', () => {
  const view = { width: 1000, height: 800 };
  assert.deepEqual(highlightRect({ x: 100, y: 100, width: 200, height: 50 }, view), { x: 94, y: 94, width: 212, height: 62 });
  assert.deepEqual(highlightRect({ x: 0, y: 0, width: 1000, height: 800 }, view), { x: 2, y: 2, width: 996, height: 796 });
  assert.equal(onScreen({ x: 0, y: 900, width: 100, height: 50 }, view), false);
  assert.equal(onScreen({ x: 0, y: 780, width: 100, height: 50 }, view), true);
  assert.equal(onScreen({ x: 0, y: 0, width: 0, height: 0 }, view), false);
  assert.equal(onScreen(null, view), false);
});
