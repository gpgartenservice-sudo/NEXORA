// Unit-Tests: Termine (Aufträge + eigene, Überschneidungen, Offenes, Route, Kalender). Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildEvents,
  clashes,
  dayLabel,
  eventsByDay,
  feedToken,
  feedUrls,
  foldLine,
  googleCalendarUrl,
  icsFileName,
  icsText,
  localStamp,
  nexyEvents,
  openItems,
  overlapping,
  routeUrl,
  sellerAddress,
  timeLabel,
  toIcs,
  upcoming,
} from '../../src/features/appointments/appointment-logic.ts';

const customers = [
  { id: 'c1', name: 'Peter Müller', address: 'Hauptstraße 12, 59755 Arnsberg', phone: '0171 999' },
  { id: 'c2', name: 'Lisa Wagner', address: null, phone: null },
];
const order = (o) => ({ id: 'o1', title: 'Hecke schneiden', customer_id: 'c1', meeting_at: null, meeting_done: false, execution_at: null, completed: false, cancelled: false, offer_sent: false, offer_accepted: false, price: null, billing: 'once', ...o });
const appt = (o) => ({ id: 'a1', title: 'Steuerberatung', starts_at: '2026-11-05T13:00:00.000Z', ends_at: null, all_day: false, location: null, customer_id: null, notes: null, done: false, created_at: '', updated_at: '', ...o });

test('Termine aus Aufträgen und eigene, sortiert; stornierte fehlen', () => {
  const ev = buildEvents(
    [
      order({ meeting_at: '2026-11-05T08:00:00.000Z', meeting_done: true, execution_at: '2026-11-10T07:00:00.000Z' }),
      order({ id: 'o2', title: 'Weg', meeting_at: '2026-11-05T09:00:00.000Z', cancelled: true }),
    ],
    customers,
    [appt({}), appt({ id: 'a2', title: 'Urlaub', starts_at: '2026-11-04T23:00:00.000Z', all_day: true, customer_id: 'c2', location: 'Mallorca' })],
  );
  assert.deepEqual(ev.map((e) => e.key), ['appointment-a2', 'meeting-o1', 'appointment-a1', 'execution-o1']);
  const meeting = ev[1];
  assert.equal(meeting.kind, 'meeting');
  assert.equal(meeting.end, '2026-11-05T09:00:00.000Z'); // 60 Minuten
  assert.equal(meeting.location, 'Hauptstraße 12, 59755 Arnsberg');
  assert.equal(meeting.customerName, 'Peter Müller');
  assert.equal(meeting.done, true);
  assert.equal(ev[3].end, '2026-11-10T09:00:00.000Z'); // Ausführung 120 Minuten
  assert.equal(ev[2].end, '2026-11-05T14:00:00.000Z'); // eigener Termin ohne Ende: 60 Minuten
  assert.equal(ev[0].allDay, true);
  assert.equal(ev[0].end, '2026-11-05T23:00:00.000Z'); // ganztägig bis Mitternacht (lokal)
  assert.equal(ev[0].location, 'Mallorca');
});

test('Ort: eigener Ort, sonst Adresse des Kunden', () => {
  const [e] = buildEvents([], customers, [appt({ customer_id: 'c1' })]);
  assert.equal(e.location, 'Hauptstraße 12, 59755 Arnsberg');
});

test('Je Tag (lokale Zeit) und Überschneidungen', () => {
  const ev = buildEvents(
    [order({ meeting_at: '2026-11-05T08:00:00.000Z' }), order({ id: 'o3', meeting_at: '2026-11-05T08:30:00.000Z' })],
    customers,
    [appt({ starts_at: '2026-11-05T23:30:00.000Z' }), appt({ id: 'a3', starts_at: '2026-11-05T10:00:00.000Z' })],
  );
  const days = eventsByDay(ev);
  assert.deepEqual([...days.keys()], ['2026-11-05', '2026-11-06']);
  assert.equal(days.get('2026-11-05').length, 3);
  assert.deepEqual([...overlapping(ev)].sort(), ['meeting-o1', 'meeting-o3']);
  // direkt nacheinander: keine Überschneidung
  const back = buildEvents([], [], [appt({ starts_at: '2026-11-05T09:00:00Z' }), appt({ id: 'b', starts_at: '2026-11-05T10:00:00Z' })]);
  assert.equal(overlapping(back).size, 0);
});

test('Kommende Termine', () => {
  const ev = buildEvents([], [], [appt({ starts_at: '2026-11-03T08:00:00Z' }), appt({ id: 'b', starts_at: '2026-11-03T11:30:00Z' }), appt({ id: 'c', starts_at: '2026-12-20T10:00:00Z' })]);
  const now = new Date('2026-11-03T12:00:00Z');
  assert.deepEqual(upcoming(ev, now).map((e) => e.appointmentId), ['b']); // a ist vorbei, c zu weit weg
  assert.deepEqual(upcoming(ev, now, 60).map((e) => e.appointmentId), ['b', 'c']);
});

test('Offene Punkte', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const items = openItems(
    [
      order({ id: 'past', meeting_at: '2026-11-04T08:00:00Z' }),
      order({ id: 'future', meeting_at: '2026-11-06T08:00:00Z' }),
      order({ id: 'new', created_at: '2026-11-01T08:00:00Z' }),
      order({ id: 'acc', offer_sent: true, offer_accepted: true, price: 100 }),
      order({ id: 'exec', execution_at: '2026-11-03T08:00:00Z', price: 100 }),
      order({ id: 'execToday', execution_at: '2026-11-05T08:00:00Z', price: 100 }),
      order({ id: 'monthly', execution_at: '2026-10-01T08:00:00Z', price: 50, billing: 'monthly' }),
      order({ id: 'done', meeting_at: '2026-11-01T08:00:00Z', completed: true }),
      order({ id: 'cancel', cancelled: true }),
    ],
    customers,
    now,
  );
  assert.deepEqual(
    items.map((i) => `${i.kind}:${i.orderId}`),
    ['confirm_meeting:past', 'schedule_meeting:new', 'schedule_execution:acc', 'finish_order:exec'],
  );
  assert.equal(items[0].customerName, 'Peter Müller');
});

test('Anzeige: Uhrzeit und Tag', () => {
  assert.equal(timeLabel({ start: '2026-11-05T08:00:00Z', end: '2026-11-05T09:30:00Z', allDay: false }), '09:00–10:30');
  assert.equal(timeLabel({ start: '2026-11-04T23:00:00Z', end: '2026-11-05T23:00:00Z', allDay: true }), 'Ganztägig');
  const today = new Date('2026-11-05T10:00:00Z');
  assert.equal(dayLabel('2026-11-05', today), 'Heute');
  assert.equal(dayLabel('2026-11-06', today), 'Morgen');
  assert.equal(dayLabel('2026-11-04', today), 'Gestern');
  assert.equal(dayLabel('2026-11-09', today), 'Montag, 9. Nov.');
  // kompletter Zeitpunkt (z. B. Beginn eines Termins)
  assert.equal(dayLabel('2026-11-06T13:00:00.000Z', today), 'Morgen');
  assert.equal(dayLabel('2026-11-05T22:30:00.000Z', today), 'Heute'); // 23:30 Uhr deutscher Zeit
  assert.equal(dayLabel('2026-11-05T23:30:00.000Z', today), 'Morgen'); // 00:30 Uhr am nächsten Tag
});

test('Tagesroute in Google Maps', () => {
  const url = new URL(routeUrl('Gartenweg 5, 59755 Arnsberg', ['Hauptstraße 12, Arnsberg', null, 'hauptstraße 12, arnsberg', 'Markt 1, Neheim']));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('origin'), 'Gartenweg 5, 59755 Arnsberg');
  assert.equal(url.searchParams.get('destination'), 'Markt 1, Neheim');
  assert.equal(url.searchParams.get('waypoints'), 'Hauptstraße 12, Arnsberg');
  assert.equal(routeUrl(null, [null, '  ']), null);
  assert.equal(new URL(routeUrl(null, ['A'])).searchParams.get('origin'), null);
  assert.equal(new URL(routeUrl(null, Array.from({ length: 15 }, (_, i) => `Ort ${i}`))).searchParams.get('waypoints').split('|').length, 9);
  assert.equal(sellerAddress({ street: 'Gartenweg 5', zip: '59755', city: 'Arnsberg' }), 'Gartenweg 5, 59755 Arnsberg');
  assert.equal(sellerAddress({ street: null, zip: null, city: ' ' }), null);
});

test('Kalender-Datei (.ics): gültig, maskiert, umgebrochen', () => {
  const ev = buildEvents([order({ meeting_at: '2026-11-05T08:00:00.000Z' })], customers, [appt({ id: 'a2', title: 'Urlaub; Strand, Sonne', starts_at: '2026-11-04T23:00:00.000Z', all_day: true, notes: 'Zeile 1\nZeile 2' })]);
  const ics = toIcs(ev, { name: 'Lena Design – NEXORA', now: new Date('2026-11-03T10:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('UID:meeting-o1@nexora'));
  assert.ok(ics.includes('DTSTART:20261105T080000Z\r\nDTEND:20261105T090000Z'));
  assert.ok(ics.includes('SUMMARY:Erstgespräch: Hecke schneiden (Peter Müller)'));
  assert.ok(ics.includes('LOCATION:Hauptstraße 12\\, 59755 Arnsberg'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105\r\nDTEND;VALUE=DATE:20261106'));
  assert.ok(ics.includes('SUMMARY:Urlaub\\; Strand\\, Sonne'));
  assert.ok(ics.includes('DESCRIPTION:Zeile 1\\nZeile 2'));
  assert.ok(ics.includes('DTSTAMP:20261103T100000Z'));
  assert.ok(ics.includes('X-WR-CALNAME:Lena Design – NEXORA'));
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(icsText('a\\b'), 'a\\\\b');
});

test('Lange Zeilen: Umbruch nach 75 Byte, auch bei Umlauten', () => {
  const folded = foldLine(`DESCRIPTION:${'ä'.repeat(60)}`);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => new TextEncoder().encode(p).length <= 75));
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), `DESCRIPTION:${'ä'.repeat(60)}`);
});

test('Google-Kalender-Link und Dateiname', () => {
  const [e] = buildEvents([order({ meeting_at: '2026-11-05T08:00:00.000Z' })], customers, []);
  const url = new URL(googleCalendarUrl(e));
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261105T080000Z/20261105T090000Z');
  assert.equal(url.searchParams.get('text'), 'Erstgespräch: Hecke schneiden (Peter Müller)');
  assert.equal(url.searchParams.get('location'), 'Hauptstraße 12, 59755 Arnsberg');
  assert.ok(url.searchParams.get('details').includes('Telefon: 0171 999'));
  assert.equal(icsFileName(e), 'Termin_2026-11-05_Erstgespraech_Hecke_schneiden_Peter_Mueller.ics');
  const [allDay] = buildEvents([], [], [appt({ starts_at: '2026-11-04T23:00:00.000Z', all_day: true })]);
  assert.equal(new URL(googleCalendarUrl(allDay)).searchParams.get('dates'), '20261105/20261106');
});

test('Abo-Link: zufällig, URL-sicher, lang genug', () => {
  let seed = 7;
  const random = (n) => Uint8Array.from({ length: n }, () => (seed = (seed * 131 + 17) % 256));
  const t = feedToken(random);
  assert.equal(t.length, 40);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  const urls = feedUrls('https://ref.supabase.co/', t);
  assert.equal(urls.https, `https://ref.supabase.co/functions/v1/calendar?token=${t}`);
  assert.equal(urls.webcal, `webcal://ref.supabase.co/functions/v1/calendar?token=${t}`);
  assert.ok(urls.google.startsWith('https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2F'));
});

test('Für Nexy: Termine mit Kurzzeichen, lokale Zeit, ohne erledigte vergangene', () => {
  const ev = buildEvents(
    [
      order({ meeting_at: '2026-11-05T08:00:00.000Z' }),
      order({ id: 'o2', title: 'Alt erledigt', meeting_at: '2026-11-02T08:00:00.000Z', meeting_done: true }),
      order({ id: 'o3', title: 'Alt offen', meeting_at: '2026-11-02T09:00:00.000Z' }),
      order({ id: 'o4', title: 'Viel später', meeting_at: '2027-01-30T09:00:00.000Z' }),
    ],
    customers,
    [{ id: 'a1', title: 'Steuerberatung', starts_at: '2026-11-06T13:00:00.000Z', ends_at: '2026-11-06T14:30:00.000Z', all_day: false, location: null, customer_id: null, notes: null, done: false, created_at: '', updated_at: '' }],
  );
  const { entries, refs } = nexyEvents(ev, new Date('2026-11-03T12:00:00Z'));
  assert.deepEqual(entries.map((e) => e.was), ['Alt offen', 'Hecke schneiden', 'Steuerberatung']);
  assert.equal(entries[1].ref, 'T2');
  assert.equal(refs.T2, 'meeting-o1');
  assert.equal(refs.T3, 'appointment-a1');
  assert.equal(entries[1].art, 'Erstgespräch');
  assert.equal(entries[1].kunde, 'Peter Müller');
  assert.equal(entries[1].beginn, '2026-11-05T09:00');
  assert.equal(entries[1].ende, undefined);
  assert.equal(entries[2].ende, '2026-11-06T15:30');
  assert.match(entries[1].wann, /^Do\.?, 05\.11\.?,? 09:00$/);
});

test('Lokale Zeit und Überschneidungen für neue Termine', () => {
  assert.equal(localStamp('2026-11-05T08:00:00.000Z'), '2026-11-05T09:00');
  assert.equal(localStamp('2026-11-05T23:30:00.000Z', true), '2026-11-06');
  const ev = buildEvents([order({ meeting_at: '2026-11-05T08:00:00.000Z' })], customers, []);
  const hit = clashes(ev, { start: '2026-11-05T08:30:00.000Z', end: '2026-11-05T09:30:00.000Z' });
  assert.deepEqual(hit.map((e) => e.key), ['meeting-o1']);
  assert.equal(clashes(ev, { start: '2026-11-05T09:00:00.000Z', end: '2026-11-05T10:00:00.000Z' }).length, 0); // direkt danach
  assert.equal(clashes(ev, { start: '2026-11-05T08:30:00.000Z', end: '2026-11-05T09:30:00.000Z' }, 'meeting-o1').length, 0); // sich selbst
  assert.equal(clashes(ev, { start: '2026-11-04T23:00:00.000Z', end: '2026-11-05T23:00:00.000Z', allDay: true }).length, 0);
});
