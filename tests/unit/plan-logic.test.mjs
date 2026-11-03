// Unit-Tests: Abo (Gratis/Pro). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMPARISON,
  FREE_LIMITS,
  isPro,
  parsePlan,
  planLabel,
  quotaText,
  trialDaysLeft,
} from '../../src/features/plan/plan-logic.ts';

const NOW = new Date('2026-11-03T10:00:00Z');
const raw = (o = {}) => ({
  plan: 'free',
  status: 'trial',
  trial_ends_at: '2026-10-20T10:00:00Z',
  current_period_end: null,
  month: '2026-11',
  usage: { nexy: { used: 17, limit: 20 }, receipt: { used: 5, limit: 5 } },
  ...o,
});

test('Antwort der Datenbank prüfen', () => {
  const p = parsePlan(raw());
  assert.equal(p.plan, 'free');
  assert.deepEqual(p.usage.nexy, { used: 17, limit: 20 });
  assert.equal(parsePlan({ plan: 'gold' }), null);
  assert.equal(parsePlan(null), null);
  // fehlende Zahlen -> Standardgrenzen
  assert.deepEqual(parsePlan({ plan: 'free' }).usage.receipt, { used: 0, limit: FREE_LIMITS.receipt });
  assert.equal(parsePlan({ plan: 'pro' }).usage.nexy.limit, 300);
  assert.equal(parsePlan(raw({ trial_ends_at: 'quatsch' })).trial_ends_at, null);
});

test('Testphase zählt wie Pro, Tage aufgerundet', () => {
  assert.equal(isPro('trial'), true);
  assert.equal(isPro('pro'), true);
  assert.equal(isPro('free'), false);
  const t = parsePlan(raw({ plan: 'trial', trial_ends_at: '2026-11-15T09:00:00Z' }));
  assert.equal(trialDaysLeft(t, NOW), 12);
  assert.equal(planLabel(t, NOW), 'Pro-Test · noch 12 Tage');
  assert.equal(planLabel(parsePlan(raw({ plan: 'trial', trial_ends_at: '2026-11-03T20:00:00Z' })), NOW), 'Pro-Test · noch 1 Tag');
  assert.equal(planLabel(parsePlan(raw({ plan: 'pro' })), NOW), 'Pro');
  assert.equal(planLabel(parsePlan(raw()), NOW), 'Gratis');
  assert.equal(trialDaysLeft(parsePlan(raw()), NOW), null);
});

test('Verbleibende Gratis-Nachrichten/Belege', () => {
  const p = parsePlan(raw());
  assert.equal(quotaText(p, 'nexy'), 'Noch 3 von 20 Nexy-Nachrichten in diesem Monat');
  assert.equal(quotaText(p, 'receipt'), 'Noch 0 von 5 Belegen zum Auslesen in diesem Monat');
  assert.equal(quotaText(parsePlan(raw({ plan: 'pro' })), 'nexy'), null);
});

test('Vergleich: Pro kann alles, Gratis hat die Grundfunktionen', () => {
  assert.ok(COMPARISON.every((r) => r.pro !== false));
  assert.ok(COMPARISON.filter((r) => r.free === true).length >= 5);
});

test('Server sagt „nur mit Pro“ (Datenbank PT402 bzw. Text)', async () => {
  const { isProRequired, proRequiredText } = await import('../../src/features/plan/plan-logic.ts');
  assert.equal(isProRequired({ code: 'PT402', message: 'pro_required' }), true);
  assert.equal(isProRequired({ code: 'P0001', message: 'pro_required' }), true);
  assert.equal(isProRequired({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isProRequired(null), false);
  assert.match(proRequiredText('dunning'), /^„1\. Mahnung und letzte Mahnung“ gibt es mit NEXORA Pro\./);
});
