import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_PREFS, NOTIFY_OPTIONS, offerReplyNotes, replyTime } from '../../src/features/notifications/notify-logic.ts';

const base = { id: 'a1', number: 'AN-2026-0007', total: 1234.5, customerName: 'Gärtnerei Grün' };
const since = Date.parse('2026-11-20T10:00:00Z');

test('Angebote: Benachrichtigung ist auswählbar und standardmäßig an', () => {
  assert.equal(DEFAULT_PREFS.offers, true);
  assert.ok(NOTIFY_OPTIONS.some((o) => o.key === 'offers'));
});

test('angenommenes Angebot: Name des Annehmenden und Betrag', () => {
  const [n] = offerReplyNotes([{ ...base, accepted_at: '2026-11-20T10:05:00Z', accepted_name: 'Max Muster' }], since);
  assert.equal(n.title, 'Angebot AN-2026-0007 angenommen');
  assert.match(n.body, /^Max Muster hat das Angebot über 1\.234,50\s€ online angenommen\.$/);
});

test('abgelehntes Angebot: Kunde und gekürzte Begründung', () => {
  const note = 'Zu teuer. '.repeat(30);
  const [n] = offerReplyNotes([{ ...base, declined_at: '2026-11-20T10:06:00Z', decline_note: note }], since);
  assert.equal(n.title, 'Angebot AN-2026-0007 abgelehnt');
  assert.ok(n.body.startsWith('Gärtnerei Grün hat das Angebot abgelehnt. „'));
  assert.ok(n.body.endsWith('…“'));
});

test('nur neue Antworten, älteste zuerst', () => {
  const notes = offerReplyNotes(
    [
      { ...base, id: 'alt', accepted_at: '2026-11-20T09:59:00Z' },
      { ...base, id: 'spaet', declined_at: '2026-11-20T10:30:00Z', customerName: null },
      { ...base, id: 'frueh', accepted_at: '2026-11-20T10:01:00Z' },
      { ...base, id: 'offen' },
    ],
    since,
  );
  assert.deepEqual(
    notes.map((n) => n.id),
    ['offer-accepted-frueh', 'offer-declined-spaet'],
  );
  assert.equal(notes[1].body, 'Dein Kunde hat das Angebot abgelehnt.');
  assert.equal(replyTime({ ...base }), 0);
});
