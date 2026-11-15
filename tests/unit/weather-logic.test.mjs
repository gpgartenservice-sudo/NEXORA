// Unit-Tests: Wetter im Kalender (Open-Meteo). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { outdoorWarning, parseForecast, weatherKind, weatherPlace } from '../../src/features/weather/weather-logic.ts';

test('WMO-Codes → Symbol', () => {
  assert.equal(weatherKind(0).kind, 'sun');
  assert.equal(weatherKind(2).kind, 'partly');
  assert.equal(weatherKind(45).kind, 'fog');
  assert.equal(weatherKind(53).kind, 'drizzle');
  assert.equal(weatherKind(63).kind, 'rain');
  assert.equal(weatherKind(81).label, 'Regenschauer');
  assert.equal(weatherKind(75).kind, 'snow');
  assert.equal(weatherKind(95).kind, 'storm');
});

test('Antwort von Open-Meteo lesen', () => {
  const days = parseForecast({
    daily: {
      time: ['2026-11-15', '2026-11-16', 'kaputt'],
      weather_code: [61, null, 0],
      temperature_2m_max: [8.6, 7, 1],
      temperature_2m_min: [3.2, 2, 0],
      precipitation_probability_max: [85, 10, 0],
    },
  });
  assert.equal(days.size, 1);
  assert.deepEqual(days.get('2026-11-15'), { day: '2026-11-15', code: 61, kind: 'rain', label: 'Regen', max: 9, min: 3, rain: 85 });
  assert.equal(parseForecast(null).size, 0);
  assert.equal(parseForecast({ error: true }).size, 0);
});

test('Warnung für Arbeiten draußen', () => {
  const w = (o) => ({ day: '2026-11-15', code: 0, kind: 'sun', label: 'Sonnig', max: 18, min: 8, rain: 0, ...o });
  assert.equal(outdoorWarning(undefined), null);
  assert.equal(outdoorWarning(w({})), null);
  assert.match(outdoorWarning(w({ kind: 'rain', label: 'Regen', rain: 80 })), /Regen angesagt \(80 %\)/);
  assert.equal(outdoorWarning(w({ kind: 'rain', label: 'Regen', rain: 30 })), null);
  assert.match(outdoorWarning(w({ kind: 'storm' })), /Gewitter/);
  assert.match(outdoorWarning(w({ max: 34 })), /34 °C/);
});

test('Ort aus den Firmendaten', () => {
  assert.equal(weatherPlace({ zip: '50667', city: ' Köln ' }), 'Köln|DE');
  assert.equal(weatherPlace({ zip: '1010', city: 'Wien' }), 'Wien');
  assert.equal(weatherPlace({ zip: null, city: '' }), null);
});
