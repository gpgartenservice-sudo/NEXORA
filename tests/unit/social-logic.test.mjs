// Unit-Tests für Social Media. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkLimits,
  compactNumber,
  computePostStatus,
  dayKey,
  engagementRate,
  isoWeek,
  mergeHashtags,
  parseHashtags,
  postText,
  startOfWeek,
  stepProgress,
  summarizeMetrics,
  weekDays,
} from '../../src/features/social/social-logic.ts';

test('Status aus Schritten: Idee -> In Arbeit -> Bereit -> Veröffentlicht', () => {
  const video = { format: 'video' };
  assert.equal(computePostStatus(video), 'idea');
  assert.equal(computePostStatus({ ...video, step_concept: true }), 'in_progress');
  assert.equal(computePostStatus({ ...video, step_concept: true, step_produced: true, step_edited: true, step_caption: true }), 'ready');
  assert.equal(computePostStatus({ ...video, published_at: '2026-11-01T10:00:00Z' }), 'published');
  assert.deepEqual(stepProgress({ ...video, step_concept: true, step_edited: true }), { done: 2, total: 4 });
});

test('Schritte hängen vom Format ab (Story: Aufnehmen + Bearbeiten reicht)', () => {
  assert.equal(computePostStatus({ format: 'story', step_produced: true, step_edited: true }), 'ready');
  assert.equal(computePostStatus({ format: 'carousel', step_concept: true, step_produced: true, step_caption: true }), 'ready');
  // "Geschnitten" gibt es beim Karussell nicht – zählt nicht
  assert.deepEqual(stepProgress({ format: 'carousel', step_edited: true }), { done: 0, total: 3 });
});

test('Hashtags: # ergänzen, Doppelte und Satzzeichen entfernen, Umlaute behalten', () => {
  assert.deepEqual(parseHashtags('gründen, #Startup  #startup ##Business! '), ['#gründen', '#Startup', '#Business']);
  assert.deepEqual(parseHashtags(''), []);
  assert.equal(mergeHashtags('#gründen #startup', '#Startup #motivation'), '#gründen #startup #motivation');
  assert.equal(postText('Hallo zusammen!', 'tipps gründen'), 'Hallo zusammen!\n\n#tipps #gründen');
  assert.equal(postText('', '#a'), '#a');
});

test('Zeichen- und Hashtag-Grenzen: strengste Plattform gilt', () => {
  const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
  const c = checkLimits(['tiktok', 'instagram'], 'Kurz', tags);
  assert.equal(c.maxChars, 2200);
  assert.equal(c.charsPlatform, 'Instagram');
  assert.equal(c.maxHashtags, 30);
  assert.equal(c.tooManyTags, true);
  const x = checkLimits(['x'], 'a'.repeat(281), '');
  assert.equal(x.tooLong, true);
  assert.equal(checkLimits(['facebook'], 'egal', '').maxChars, null);
});

test('Woche: Montag, sieben Tage, Kalenderwoche', () => {
  const monday = startOfWeek(new Date(2026, 10, 5)); // Do, 5.11.2026
  assert.equal(dayKey(monday), '2026-11-02');
  assert.equal(dayKey(startOfWeek(new Date(2026, 10, 8))), '2026-11-02'); // Sonntag gehört zur selben Woche
  const days = weekDays(monday);
  assert.equal(days.length, 7);
  assert.equal(dayKey(days[6]), '2026-11-08');
  assert.equal(isoWeek(new Date(2026, 10, 5)), 45);
  assert.equal(isoWeek(new Date(2027, 0, 1)), 53);
});

test('Zahlen: Interaktionsrate, Summen, kompakte Zahlen', () => {
  assert.equal(engagementRate({ views: 1000, likes: 80, comments: 10, shares: 5, saves: 5 }), 10);
  assert.equal(engagementRate({ views: 0, likes: 3 }), null);
  const s = summarizeMetrics([
    { views: 12000, likes: 800, comments: 40, shares: 25, saves: 60, followers: 30 },
    { views: 3000, likes: 100, followers: 5 },
    {},
  ]);
  assert.deepEqual(s, { posts: 3, withNumbers: 2, views: 15000, interactions: 1025, followers: 35, avgViews: 7500, rate: 6.8 });
  assert.equal(compactNumber(12345), '12.345');
  assert.equal(compactNumber(250000), '250 Tsd.');
  assert.equal(compactNumber(1234567), '1,2 Mio.');
});
