// Unit-Tests: „Mit Luna analysieren“ – was lief am besten? Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { socialAnalysis } from '../../src/features/assistant/nexy-context.ts';
import { postPerformance } from '../../src/features/social/social-logic.ts';

const post = (title, format, platforms, views, extra = {}) => ({
  title,
  format,
  platforms,
  views,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  planned_for: null,
  published_at: '2026-11-01T10:00:00Z',
  ...extra,
});

const posts = [
  post('Hecke vorher/nachher', 'video', ['tiktok', 'instagram'], 5000, { likes: 400, comments: 50 }),
  post('Werkzeug-Tipps', 'carousel', ['instagram'], 800, { likes: 120, saves: 60 }),
  post('Teamfoto', 'image', ['instagram'], 300, { likes: 20 }),
  post('Rasen-Hack', 'video', ['tiktok'], 3000, { likes: 150 }),
  post('Noch ohne Zahlen', 'video', ['tiktok'], null),
  post('Idee, nicht veröffentlicht', 'story', ['instagram'], 9999, { published_at: null }),
];

test('Formate und Plattformen nach Aufrufen pro Post – nur veröffentlichte Posts mit Zahlen', () => {
  const p = postPerformance(posts);
  assert.equal(p.posts, 4);
  assert.deepEqual(
    p.byFormat.map((g) => [g.label, g.posts, g.avgViews]),
    [
      ['Video', 2, 4000],
      ['Karussell', 1, 800],
      ['Bild', 1, 300],
    ],
  );
  assert.deepEqual(p.byPlatform.map((g) => [g.key, g.posts]), [
    ['tiktok', 2],
    ['instagram', 3],
  ]);
  // Karussell: (120 + 60) / 800 = 22,5 %
  assert.equal(p.byFormat.find((g) => g.key === 'carousel').rate, 22.5);
  assert.deepEqual(
    p.ranked.map((x) => x.title),
    ['Hecke vorher/nachher', 'Rasen-Hack', 'Werkzeug-Tipps', 'Teamfoto'],
  );
});

test('Bei gleichen Aufrufen gewinnt die höhere Interaktionsrate', () => {
  const p = postPerformance([
    post('A', 'image', ['instagram'], 1000, { likes: 10 }),
    post('B', 'carousel', ['instagram'], 1000, { likes: 90 }),
  ]);
  assert.deepEqual(p.byFormat.map((g) => g.key), ['carousel', 'image']);
  assert.deepEqual(p.ranked.map((x) => x.title), ['B', 'A']);
});

test('Auswertung für Luna: deutsche Felder, stärkste Posts, schwächste ohne Überschneidung', () => {
  const a = socialAnalysis(posts);
  assert.equal(a.posts_mit_zahlen, 4);
  assert.equal(a.formate[0].name, 'Video');
  assert.equal(a.formate[0].aufrufe_pro_post, 4000);
  assert.equal(a.staerkste_posts[0].titel, 'Hecke vorher/nachher');
  assert.deepEqual(a.staerkste_posts[0].plattformen, ['TikTok', 'Instagram']);
  assert.equal(a.staerkste_posts[0].veroeffentlicht, '2026-11-01');
  // nur 4 Posts mit Zahlen – alle stehen schon bei den stärksten
  assert.deepEqual(a.schwaechste_posts, []);

  const many = Array.from({ length: 8 }, (_, i) => post(`P${i + 1}`, 'video', ['tiktok'], 1000 - i * 100));
  const b = socialAnalysis(many);
  assert.deepEqual(b.staerkste_posts.map((x) => x.titel), ['P1', 'P2', 'P3', 'P4', 'P5']);
  assert.deepEqual(b.schwaechste_posts.map((x) => x.titel), ['P8', 'P7', 'P6']);
});

test('Ohne Zahlen: leere Auswertung statt Fehler', () => {
  const a = socialAnalysis([post('Idee', 'video', [], null, { published_at: null })]);
  assert.equal(a.posts_mit_zahlen, 0);
  assert.deepEqual(a.formate, []);
  assert.deepEqual(a.staerkste_posts, []);
});
