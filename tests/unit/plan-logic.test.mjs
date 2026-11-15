// Unit-Tests: Abo (Gratis/Pro/Business). Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  COMPARISON,
  isPro,
  LIMITS,
  parsePlan,
  planLabel,
  PRICES,
  quotaExceededText,
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
  usage: { nexy: { used: 12, limit: 15 }, receipt: { used: 3, limit: 3 }, voice: { used: 4, limit: 30 } },
  ...o,
});

test('Antwort der Datenbank prüfen', () => {
  const p = parsePlan(raw());
  assert.equal(p.plan, 'free');
  assert.deepEqual(p.usage.nexy, { used: 12, limit: 15 });
  assert.deepEqual(p.usage.voice, { used: 4, limit: 30 });
  assert.equal(parsePlan({ plan: 'gold' }), null);
  assert.equal(parsePlan(null), null);
  // fehlende Zahlen -> Standardgrenzen
  assert.deepEqual(parsePlan({ plan: 'free' }).usage.receipt, { used: 0, limit: 3 });
  assert.equal(parsePlan({ plan: 'pro' }).usage.nexy.limit, 100);
  assert.equal(parsePlan({ plan: 'business' }).usage.receipt.limit, 250);
  assert.equal(parsePlan({ plan: 'trial' }).usage.voice.limit, 70);
  // alte Datenbank ohne Vorlesen-Zähler -> Standardgrenze
  assert.deepEqual(parsePlan(raw({ usage: { nexy: { used: 1, limit: 15 } } })).usage.voice, { used: 0, limit: 30 });
  assert.equal(parsePlan(raw({ trial_ends_at: 'quatsch' })).trial_ends_at, null);
});

test('Testphase und Business zählen wie Pro, Tage aufgerundet', () => {
  assert.equal(isPro('trial'), true);
  assert.equal(isPro('pro'), true);
  assert.equal(isPro('business'), true);
  assert.equal(isPro('free'), false);
  const t = parsePlan(raw({ plan: 'trial', trial_ends_at: '2026-11-15T09:00:00Z' }));
  assert.equal(trialDaysLeft(t, NOW), 12);
  assert.equal(planLabel(t, NOW), 'Pro-Test · noch 12 Tage');
  assert.equal(planLabel(parsePlan(raw({ plan: 'trial', trial_ends_at: '2026-11-03T20:00:00Z' })), NOW), 'Pro-Test · noch 1 Tag');
  assert.equal(planLabel(parsePlan(raw({ plan: 'pro' })), NOW), 'Pro');
  assert.equal(planLabel(parsePlan(raw({ plan: 'business' })), NOW), 'Business');
  assert.equal(planLabel(parsePlan(raw()), NOW), 'Gratis');
  assert.equal(trialDaysLeft(parsePlan(raw()), NOW), null);
});

test('Verbleibende Nachrichten/Belege/Vorlesen – in jedem Abo', () => {
  const p = parsePlan(raw());
  assert.equal(quotaText(p, 'nexy'), 'Noch 3 von 15 Luna-Nachrichten in diesem Monat');
  assert.equal(quotaText(p, 'receipt'), 'Noch 0 von 3 Belegen zum Auslesen in diesem Monat');
  assert.equal(quotaText(p, 'voice'), 'Noch 26 von 30-mal Vorlesen in diesem Monat');
  const pro = parsePlan(raw({ plan: 'pro', usage: { nexy: { used: 40, limit: 100 } } }));
  assert.equal(quotaText(pro, 'nexy'), 'Noch 60 von 100 Luna-Nachrichten in diesem Monat');
});

test('Kontingent aufgebraucht: Text passt zum Abo', () => {
  assert.match(quotaExceededText('nexy', 'free', 15), /^Deine 15 Gratis-Nachrichten an Luna .* Mit Lunaxora Pro geht es gleich weiter/);
  assert.match(quotaExceededText('receipt', 'trial', 20), /^Deine 20 Test-Belege .* selbst ein/);
  assert.match(quotaExceededText('nexy', 'pro', 100), /^Deine 100 Nachrichten .* Mit Lunaxora Business habt ihr fünfmal so viel/);
  assert.match(quotaExceededText('voice', 'business', 600), /600-mal Vorlesen.*als Text\. Ab dem 1\. des nächsten Monats geht es weiter\./);
  // ohne Angaben vom Server: Gratis-Grenze
  assert.match(quotaExceededText('nexy', undefined, undefined), /^Deine 15 Gratis-Nachrichten/);
});

test('Vergleich: Pro und Business können alles, Gratis hat die Grundfunktionen', () => {
  assert.ok(COMPARISON.every((r) => r.pro !== false && r.business !== false));
  assert.ok(COMPARISON.filter((r) => r.free === true).length >= 5);
  const luna = COMPARISON.find((r) => r.label.startsWith('Luna-Nachrichten'));
  assert.deepEqual([luna.free, luna.pro, luna.business], ['15', '100', '500']);
  const seats = COMPARISON.find((r) => r.label === 'Personen im Konto');
  assert.deepEqual([seats.free, seats.pro, seats.business], ['1', '1', '5']);
});

test('Preise: Jahr = zwei Monate geschenkt, Business teurer als Pro', () => {
  for (const t of ['pro', 'business']) {
    const saved = PRICES[t].month * 12 - PRICES[t].year;
    assert.ok(saved >= PRICES[t].month * 1.9 && saved <= PRICES[t].month * 2.1, `${t}: ${saved}`);
  }
  assert.ok(PRICES.business.month > PRICES.pro.month);
  assert.deepEqual([PRICES.pro.month, PRICES.business.month], [50, 150]);
});

test('Grenzen in der App = Grenzen in der Datenbank (nexora_limit, neuestes Skript)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261120090000_feinschliff.sql', import.meta.url), 'utf8');
  const body = sql.slice(sql.indexOf('function public.nexora_limit'), sql.indexOf('$$;', sql.indexOf('function public.nexora_limit')));
  const row = (plan) => {
    const line = body.split('\n').find((l) => (plan === 'free' ? /^\s*else\s+case/.test(l) : l.includes(`when '${plan}'`)));
    const [, nexy, receipt, voice] = line.match(/'nexy' then (\d+)\s+when 'receipt' then (\d+)\s+else (\d+)/);
    return { nexy: +nexy, receipt: +receipt, voice: +voice };
  };
  for (const plan of ['free', 'trial', 'pro', 'business']) assert.deepEqual(row(plan), LIMITS[plan], plan);
});

test('Server sagt „nur mit Pro“ (Datenbank PT402 bzw. Text)', async () => {
  const { isProRequired, proRequiredText } = await import('../../src/features/plan/plan-logic.ts');
  assert.equal(isProRequired({ code: 'PT402', message: 'pro_required' }), true);
  assert.equal(isProRequired({ code: 'P0001', message: 'pro_required' }), true);
  assert.equal(isProRequired({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isProRequired(null), false);
  assert.match(proRequiredText('dunning'), /^„1\. Mahnung und letzte Mahnung“ gibt es mit Lunaxora Pro\./);
});
