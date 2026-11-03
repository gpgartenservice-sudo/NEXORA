// Unit-Tests: TikTok & Instagram verbinden (Zuordnung, Zahlen, Übernahme, Verlauf). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  captionTitle,
  extractHashtags,
  followerGrowth,
  followerSeries,
  keywords,
  matchVideos,
  needsSync,
  normalizeUrl,
  postFromVideo,
  postPatchFromVideos,
  suggestPost,
  syncAge,
} from '../../src/features/social/connect-logic.ts';
import { computePostStatus } from '../../src/features/social/social-logic.ts';

const post = (o) => ({
  id: 'p1',
  title: 'Idee',
  caption: null,
  hashtags: null,
  url: null,
  format: 'video',
  platforms: [],
  planned_for: null,
  published_at: null,
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  ...o,
});
const video = (o) => ({
  id: 'v1',
  account_id: 'a1',
  platform: 'tiktok',
  external_id: '71',
  caption: null,
  url: null,
  thumbnail_url: null,
  media_type: 'video',
  published_at: '2026-11-01T17:00:00.000Z',
  views: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  post_id: null,
  auto_link: true,
  synced_at: '2026-11-03T10:00:00.000Z',
  ...o,
});

test('Links vergleichen: ohne www, Abfrage, Schrägstrich', () => {
  assert.equal(normalizeUrl('https://www.tiktok.com/@lena/video/71?is_from_webapp=1&sender=x'), 'tiktok.com/@lena/video/71');
  assert.equal(normalizeUrl('https://instagram.com/reel/AAA/'), 'instagram.com/reel/AAA');
  assert.equal(normalizeUrl('kein link'), null);
  assert.equal(normalizeUrl(null), null);
});

test('Wichtige Wörter: ohne Füllwörter, Hashtags zählen mit', () => {
  assert.deepEqual([...keywords('3 Fehler beim Gründen – und wie du sie vermeidest #Startup')], ['fehler', 'beim', 'gründen', 'vermeidest', 'startup']);
  assert.equal(keywords('').size, 0);
});

test('Zuordnung über den Link', () => {
  const posts = [post({ id: 'p1', title: 'Ganz anders', url: 'https://www.tiktok.com/@lena/video/71' })];
  assert.deepEqual(matchVideos([video({ url: 'https://www.tiktok.com/@lena/video/71?lang=de' })], posts), [{ videoId: 'v1', postId: 'p1', reason: 'url' }]);
});

test('Zuordnung über den Text: deutlich, eindeutig, zeitlich passend', () => {
  const posts = [
    post({ id: 'p1', title: '3 Fehler beim Gründen', planned_for: '2026-10-31T18:00:00Z' }),
    post({ id: 'p2', title: 'Vorher/Nachher Garten', planned_for: '2026-11-01T18:00:00Z' }),
  ];
  const v = video({ caption: '3 Fehler beim Gründen, die dich Geld kosten #startup #gründen' });
  assert.deepEqual(matchVideos([v], posts), [{ videoId: 'v1', postId: 'p1', reason: 'text' }]);
  // zu weit weg geplant
  assert.deepEqual(matchVideos([v], [post({ id: 'p1', title: '3 Fehler beim Gründen', planned_for: '2026-09-01T18:00:00Z' })]), []);
  // nur ein gemeinsames Wort
  assert.deepEqual(matchVideos([video({ caption: 'Gründen ist toll' })], [post({ title: 'Gründen leicht gemacht' })]), []);
  // zwei gleich gute Ideen -> nicht eindeutig
  assert.deepEqual(matchVideos([v], [post({ id: 'a', title: 'Fehler beim Gründen' }), post({ id: 'b', title: 'Fehler beim Gründen' })]), []);
});

test('Zuordnung: je Idee ein Video pro Plattform, gelöste bleiben gelöst', () => {
  const posts = [post({ id: 'p1', title: 'Fehler beim Gründen' })];
  const a = video({ id: 'a', caption: 'Fehler beim Gründen Teil 1', published_at: '2026-11-01T10:00:00Z' });
  const b = video({ id: 'b', caption: 'Fehler beim Gründen Teil 2', published_at: '2026-11-02T10:00:00Z' });
  assert.deepEqual(matchVideos([a, b], posts).map((m) => m.videoId), ['a']);
  // Instagram-Video derselben Idee: erlaubt (Cross-Posting)
  const ig = video({ id: 'ig', platform: 'instagram', caption: 'Fehler beim Gründen' });
  assert.deepEqual(matchVideos([video({ id: 'a', caption: 'x', post_id: 'p1' }), ig], posts).map((m) => m.videoId), ['ig']);
  // von Hand gelöst
  assert.deepEqual(matchVideos([video({ caption: 'Fehler beim Gründen', auto_link: false })], posts), []);
});

test('Vorschlag für nicht zugeordnete Videos', () => {
  const posts = [post({ id: 'p1', title: 'Gründen leicht gemacht' }), post({ id: 'p2', title: 'Rezept' })];
  assert.equal(suggestPost(video({ caption: 'Gründen ist toll' }), [], posts)?.id, 'p1');
  assert.equal(suggestPost(video({ caption: 'Urlaub am Meer' }), [], posts), null);
  // schon belegt für TikTok -> kein Vorschlag
  assert.equal(suggestPost(video({ caption: 'Gründen ist toll' }), [video({ id: 'x', post_id: 'p1' })], posts), null);
});

test('Zahlen übernehmen: Summe über Plattformen, Datum, Link, Plattformen', () => {
  const p = post({ views: 10, platforms: ['youtube'] });
  const patch = postPatchFromVideos(p, [
    video({ views: 5400, likes: 300, comments: 12, shares: 9, published_at: '2026-11-01T17:00:00Z', url: 'https://www.tiktok.com/@l/video/71' }),
    video({ id: 'v2', platform: 'instagram', views: 600, likes: 40, comments: null, saves: 7, published_at: '2026-11-02T09:00:00Z', url: 'https://instagram.com/reel/A' }),
  ]);
  assert.deepEqual(patch, {
    views: 6000,
    likes: 340,
    comments: 12,
    shares: 9,
    saves: 7,
    published_at: '2026-11-01T17:00:00Z',
    url: 'https://www.tiktok.com/@l/video/71',
    platforms: ['youtube', 'tiktok', 'instagram'],
  });
  // nichts Neues -> null; eigene Werte bleiben, wenn die Plattform keine liefert
  const same = post({ views: 5400, likes: 300, published_at: '2026-11-01T17:00:00Z', url: 'x', platforms: ['tiktok'] });
  assert.equal(postPatchFromVideos(same, [video({ views: 5400, likes: 300 })]), null);
  assert.equal(postPatchFromVideos(post({ saves: 99, platforms: ['tiktok'], published_at: 'x', url: 'y' }), [video({ saves: null })]), null);
  assert.equal(postPatchFromVideos(p, []), null);
  // riesige Zahlen werden begrenzt (Datenbank: integer)
  assert.equal(postPatchFromVideos(post(), [video({ views: 3_000_000_000 })]).views, 2_147_483_647);
});

test('Video als neuen Post übernehmen: veröffentlicht, Titel, Hashtags, Zahlen', () => {
  const p = postFromVideo(video({ caption: 'Vorher/Nachher – Hecke in 2 Stunden 🌿\nKomplett neu! #garten #vorhernachher', views: 1200, likes: 90, url: 'https://t/71' }));
  assert.equal(p.title, 'Vorher/Nachher – Hecke in 2 Stunden 🌿');
  assert.equal(p.hashtags, '#garten #vorhernachher');
  assert.equal(p.caption, 'Vorher/Nachher – Hecke in 2 Stunden 🌿\nKomplett neu!');
  assert.deepEqual(p.platforms, ['tiktok']);
  assert.equal(p.format, 'video');
  assert.equal(p.views, 1200);
  assert.equal(computePostStatus(p), 'published');
  assert.equal(p.step_concept && p.step_produced && p.step_edited && p.step_caption, true);
  const carousel = postFromVideo(video({ platform: 'instagram', media_type: 'carousel', caption: null, published_at: '2026-10-28T10:00:00Z' }));
  assert.equal(carousel.format, 'carousel');
  assert.equal(carousel.title, 'Instagram-Post vom 28. Okt. 2026');
  assert.equal(carousel.step_edited, undefined);
});

test('Titel und Hashtags', () => {
  assert.equal(captionTitle('#nurhashtags\n\nEchter Titel', 'tiktok', null), 'Echter Titel');
  assert.equal(captionTitle('a'.repeat(100), 'tiktok', null).length, 79);
  assert.equal(captionTitle('', 'tiktok', null), 'TikTok-Video');
  assert.deepEqual(extractHashtags('#Gründen #gründen #a_b und #Gründen'), ['#Gründen', '#gründen', '#a_b']);
});

test('Follower-Verlauf und Zuwachs', () => {
  const stats = [
    { account_id: 'a1', day: '2026-10-20', followers: 1400 },
    { account_id: 'a1', day: '2026-10-27', followers: 1480 },
    { account_id: 'a1', day: '2026-10-30', followers: 1500 },
    { account_id: 'a1', day: '2026-11-03', followers: 1520 },
    { account_id: 'a2', day: '2026-11-03', followers: 5 },
  ];
  assert.deepEqual(followerSeries(stats, 'a1', '2026-11-03', 10).map((s) => s.day), ['2026-10-27', '2026-10-30', '2026-11-03']);
  assert.deepEqual(followerGrowth(stats, 'a1', '2026-11-03', 7), { delta: 40, since: '2026-10-27' });
  assert.deepEqual(followerGrowth(stats, 'a1', '2026-11-03', 30), { delta: 120, since: '2026-10-20' });
  assert.equal(followerGrowth(stats, 'a2', '2026-11-03'), null);
  // erst seit 2 Tagen verbunden: Zuwachs seit dem ersten Wert
  assert.deepEqual(followerGrowth(stats.slice(2), 'a1', '2026-11-03', 7), { delta: 20, since: '2026-10-30' });
});

test('Zeit seit dem letzten Abgleich + automatischer Abgleich', () => {
  const now = Date.parse('2026-11-03T12:00:00Z');
  assert.equal(syncAge(null, now), 'noch nie');
  assert.equal(syncAge('2026-11-03T11:59:40Z', now), 'gerade eben');
  assert.equal(syncAge('2026-11-03T11:55:00Z', now), 'vor 5 Min.');
  assert.equal(syncAge('2026-11-03T09:00:00Z', now), 'vor 3 Std.');
  assert.equal(syncAge('2026-11-02T10:00:00Z', now), 'vor 1 Tag');
  assert.equal(syncAge('2026-10-30T12:00:00Z', now), 'vor 4 Tagen');
  const acc = (o) => ({ status: 'ok', last_synced_at: '2026-11-03T11:00:00Z', ...o });
  assert.equal(needsSync([acc()], now), false);
  assert.equal(needsSync([acc({ last_synced_at: '2026-11-03T04:00:00Z' })], now), true);
  assert.equal(needsSync([acc({ last_synced_at: null, status: 'reconnect' })], now), false);
});
