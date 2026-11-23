// Unit-Tests: Lunas Gesten, Stupser-Reaktionen und Jubel bei erreichten Zielen. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIZZY_TAPS,
  DIZZY_WINDOW_MS,
  DOUBLE_TAP_MS,
  GESTURE_MS,
  gestureLine,
  idleDelay,
  nextTap,
  NO_TAPS,
  pickIdleGesture,
} from '../../src/features/assistant/luna-moves.ts';
import { goalCheerLine, goalProgress, newlyReached } from '../../src/features/goals/goals-logic.ts';

const IDLE = ['wink', 'tilt', 'wave', 'wow', 'twirl'];

test('Ruhe-Gesten: nur die kleinen Gesten, nie zweimal dieselbe hintereinander', () => {
  for (let i = 0; i < 50; i++) {
    const r = i / 50;
    const g = pickIdleGesture(null, () => r);
    assert.ok(IDLE.includes(g), g);
    for (const last of IDLE) assert.notEqual(pickIdleGesture(last, () => r), last);
  }
  // Grenzfall: Zufall ganz oben
  assert.ok(IDLE.includes(pickIdleGesture('wink', () => 0.999999)));
  // alle kommen vor
  const all = new Set(Array.from({ length: 100 }, (_, i) => pickIdleGesture(null, () => i / 100)));
  assert.deepEqual([...all].sort(), [...IDLE].sort());
});

test('Ruhe-Gesten: die erste kommt bald, danach mit Abstand', () => {
  assert.equal(idleDelay(true, () => 0), 6000);
  assert.equal(idleDelay(true, () => 1), 10000);
  assert.equal(idleDelay(false, () => 0), 10000);
  assert.equal(idleDelay(false, () => 1), 18000);
});

test('Jede Geste hat eine Dauer', () => {
  for (const [name, ms] of Object.entries(GESTURE_MS)) assert.ok(ms >= 500 && ms <= 3000, `${name}: ${ms}`);
});

const tapAll = (times) => {
  let state = NO_TAPS;
  return times.map((t) => {
    const r = nextTap(state, t);
    state = r.state;
    return r.kind;
  });
};

test('Stupser: einmal = hüpfen, Doppelklick = Pirouette', () => {
  assert.deepEqual(tapAll([1000]), ['boop']);
  assert.deepEqual(tapAll([1000, 1000 + DOUBLE_TAP_MS - 20]), ['boop', 'twirl']);
  // zu langsam für einen Doppelklick
  assert.deepEqual(tapAll([1000, 1000 + DOUBLE_TAP_MS + 50]), ['boop', 'boop']);
  // zwei Doppelklicks mit Pause = zwei Pirouetten
  assert.deepEqual(tapAll([1000, 1200, 5000, 5200]), ['boop', 'twirl', 'boop', 'twirl']);
});

test('Stupser: wildes Draufklicken = schwindelig (nicht lauter Pirouetten)', () => {
  const fast = Array.from({ length: DIZZY_TAPS }, (_, i) => 1000 + i * 150);
  const kinds = tapAll(fast);
  assert.equal(kinds.at(-1), 'dizzy');
  assert.equal(kinds.filter((k) => k === 'twirl').length, 1);
  // danach zählt es neu
  let state = NO_TAPS;
  for (const t of fast) state = nextTap(state, t).state;
  assert.equal(state.taps.length, 0);
  assert.equal(nextTap(state, 3000).kind, 'boop');
});

test('Stupser: verteilt über längere Zeit macht nicht schwindelig', () => {
  const slow = Array.from({ length: DIZZY_TAPS + 4 }, (_, i) => 1000 + i * (DIZZY_WINDOW_MS / 4));
  assert.ok(!tapAll(slow).includes('dizzy'));
});

test('Sprüche: nur für Gesten, bei denen Luna etwas sagt', () => {
  assert.ok(gestureLine('giggle', () => 0).length > 0);
  assert.ok(gestureLine('dizzy', () => 0.99).length > 0);
  assert.equal(gestureLine('wink'), null);
  assert.equal(gestureLine('yawn'), null);
});

// ——— Ziel erreicht ———

const NOW = new Date(2026, 10, 4, 12, 0);
const goal = (o) => ({
  id: 'g1',
  kind: 'custom',
  period: 'once',
  target: 3,
  title: 'Website fertig',
  progress: 0,
  due_on: null,
  archived: false,
  created_at: '2026-11-01T10:00:00Z',
  ...o,
});
const data = { orders: [], customers: [], posts: [] };
const withProgress = (g) => ({ goal: g, progress: goalProgress(g, data, NOW) });

test('Ziel erreicht: beim ersten Blick wird nichts gefeiert', () => {
  const r = newlyReached(null, [withProgress(goal({ progress: 3 }))]);
  assert.deepEqual(r.reached, []);
  assert.equal(r.seen.size, 1);
});

test('Ziel erreicht: gefeiert wird der Wechsel von offen auf geschafft – einmal', () => {
  const first = newlyReached(null, [withProgress(goal({ progress: 2 }))]);
  const second = newlyReached(first.seen, [withProgress(goal({ progress: 3 }))]);
  assert.deepEqual(
    second.reached.map((g) => g.id),
    ['g1'],
  );
  const third = newlyReached(second.seen, [withProgress(goal({ progress: 4 }))]);
  assert.deepEqual(third.reached, []);
});

test('Ziel erreicht: neue Ziele, die schon geschafft sind, zählen nicht', () => {
  const first = newlyReached(null, []);
  const second = newlyReached(first.seen, [withProgress(goal({ id: 'neu', progress: 5 }))]);
  assert.deepEqual(second.reached, []);
});

test('Ziel erreicht: Lunas Satz ist gut vorlesbar', () => {
  const revenue = goalCheerLine(goal({ kind: 'revenue', period: 'month', target: 5000 }), () => 0);
  assert.match(revenue, /5\.000 Euro Umsatz diesen Monat/);
  assert.doesNotMatch(revenue, /€/);
  const custom = goalCheerLine(goal({}), () => 0.99);
  assert.match(custom, /„Website fertig“/);
  const customers = goalCheerLine(goal({ kind: 'customers', period: 'week', target: 1 }), () => 0.5);
  assert.match(customers, /1 neuer Kunde diese Woche/);
  for (const line of [revenue, custom, customers]) assert.doesNotMatch(line, /\p{Extended_Pictographic}/u);
});
