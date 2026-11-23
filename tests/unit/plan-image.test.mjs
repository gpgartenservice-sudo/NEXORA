// Unit-Tests: fertiger Arbeitsplan als Bild (Team → Arbeitsplan → „Plan ansehen“). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { layoutPlanImage, PLAN_PAPER, textWidth, workPlanImageName, wrapText } from '../../src/features/team/plan-image-logic.ts';
import { stampLabel, weekDays } from '../../src/features/team/staff-logic.ts';

const MONDAY = '2026-11-23';
const job = (extra = {}) => ({
  starts_at: '07:30',
  ends_at: '16:00',
  site: 'Garten Müller',
  address: 'Hauptstraße 1, 44135 Dortmund',
  note: null,
  lead: 'anna',
  members: ['anna', 'ben'],
  ...extra,
});
const plan = (jobsMonday = [job()]) => ({
  v: 1,
  week: MONDAY,
  people: { anna: 'Anna Berg', ben: 'Ben Krüger' },
  days: weekDays(MONDAY).map((day, i) => ({ day, holiday: null, jobs: i === 0 ? jobsMonday : [], away: i === 1 ? ['ben'] : [] })),
});
const input = (p = plan(), extra = {}) => ({
  plan: p,
  company: { name: 'GP Gartenservice', lines: ['Musterweg 2', '44135 Dortmund'] },
  version: 1,
  publishedAt: '2026-11-23T17:05:00',
  accent: '#2FE39A',
  ...extra,
});
const texts = (d) => d.items.filter((i) => i.t === 'text').map((i) => i.text);

test('Text umbrechen: passt in die Breite, Absätze bleiben, lange Wörter werden geteilt', () => {
  assert.deepEqual(wrapText('kurz', 10, 200), ['kurz']);
  const lines = wrapText('Hecke schneiden und Laub im ganzen Vorgarten einsammeln, danach Rasen mähen', 9, 120);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(textWidth(l, 9) <= 120, l);
  assert.deepEqual(wrapText('eins\nzwei', 9, 300), ['eins', 'zwei']);
  const long = wrapText('Donaudampfschifffahrtsgesellschaftskapitän', 10, 60);
  assert.ok(long.length > 1);
  assert.equal(long.join(''), 'Donaudampfschifffahrtsgesellschaftskapitän');
  assert.ok(textWidth('WWW', 10) > textWidth('iii', 10));
  assert.ok(textWidth('Abc', 10, true) > textWidth('Abc', 10));
});

test('Bild: Kopf, Woche, alle Tage, Einsatz mit Team, Abwesende, Fußzeile', () => {
  const d = layoutPlanImage(input());
  assert.equal(d.width, 595);
  assert.equal(d.items[0].t, 'rect');
  assert.equal(d.items[0].fill, '#2FE39A');
  const t = texts(d);
  for (const want of ['GP Gartenservice', 'Musterweg 2', 'ARBEITSPLAN', 'Garten Müller', 'Hauptstraße 1, 44135 Dortmund', 'Anna Berg (Teamleiter), Ben Krüger', 'Abwesend: Ben Krüger', 'Erstellt mit Lunaxora · GP Gartenservice'])
    assert.ok(t.includes(want), want);
  assert.ok(t.some((s) => s.startsWith('KW 48 · ')));
  assert.ok(t.includes(`Stand: ${stampLabel('2026-11-23T17:05:00')}`));
  // sieben Tageszeilen, leere Tage mit Hinweis
  assert.equal(d.items.filter((i) => i.t === 'rect' && i.opacity).length, 7);
  assert.equal(t.filter((s) => s === 'Keine Einsätze').length, 6);
  // alles liegt auf der Seite
  for (const i of d.items) if (i.t === 'text') assert.ok(i.y > 0 && i.y < d.height, i.text);
  assert.equal(PLAN_PAPER, '#FFFFFF');
});

test('Bild wird mit mehr Einsätzen länger, Version steht im Stand', () => {
  const one = layoutPlanImage(input());
  const many = layoutPlanImage(input(plan([job(), job({ site: null, members: ['anna'], lead: null, note: 'Schlüssel beim Nachbarn' }), job({ order_title: 'Herbstschnitt' })])));
  assert.ok(many.height > one.height + 40);
  const t = texts(many);
  // ein Einsatz ohne Ort und nur eine Person: Name als Titel
  assert.ok(t.includes('Anna Berg'));
  assert.ok(t.includes('Schlüssel beim Nachbarn'));
  assert.ok(t.includes('Auftrag: Herbstschnitt'));
  assert.ok(texts(layoutPlanImage(input(plan(), { version: 3 }))).some((s) => s.endsWith(' · Version 3')));
});

test('Mit Logo: Logo oben links, Name darunter; Feiertag', () => {
  const p = plan();
  p.days[3].holiday = 'Allerheiligen';
  const d = layoutPlanImage(input(p, { logo: { width: 400, height: 100 } }));
  const logo = d.items.find((i) => i.t === 'logo');
  assert.ok(logo);
  assert.ok(logo.w <= 180 && logo.h <= 40);
  assert.equal(Math.round((logo.w / logo.h) * 10), 40, 'Seitenverhältnis bleibt');
  const name = d.items.find((i) => i.t === 'text' && i.text === 'GP Gartenservice');
  assert.ok(name.y > logo.y + logo.h);
  assert.ok(texts(d).includes('Feiertag: Allerheiligen'));
  assert.ok(texts(d).includes('Feiertag – keine Einsätze'));
});

test('Dateiname und Zeitstempel', () => {
  assert.equal(workPlanImageName(plan()), 'Arbeitsplan_KW48_2026.png');
  assert.equal(stampLabel('2026-11-23T08:05:00'), '23.11.2026, 08:05 Uhr');
  assert.equal(stampLabel('kaputt'), '');
});
