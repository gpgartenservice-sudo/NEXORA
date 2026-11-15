// Unit-Tests für die Server-Funktion "social" (ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowedReturn, handleRequest, signState } from '../../supabase/functions/social/index.ts';

const BASE = 'https://projekt.supabase.co/functions/v1/social';
const deps = { env: () => undefined, fetch: () => Promise.reject(new Error('kein Netz im Test')) };
const get = (path) => handleRequest(new Request(`${BASE}${path}`), deps);

test('TikTok-Bestätigungsdatei wird unter der Rückleitungs-Adresse ausgeliefert', async () => {
  const content = 'tiktok-developers-site-verification=8dNMQMbxTA4JNvPNsbsLdmVIDnjddSwV';
  for (const path of ['/callback/tiktok8dNMQMbxTA4JNvPNsbsLdmVIDnjddSwV.txt', '/tiktok8dNMQMbxTA4JNvPNsbsLdmVIDnjddSwV.txt']) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), content, path);
  }
});

test('Andere Dateien bleiben unbekannt', async () => {
  for (const path of ['/callback/tiktokFALSCH.txt', '/toString', '/constructor', '/']) {
    assert.equal((await get(path)).status, 404, path);
  }
});

test('Rückleitung ohne Anmeldedaten zeigt weiter den Hinweis', async () => {
  const res = await get('/callback');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Anmeldung ist abgeschlossen/);
});

test('Rückleitung: Handy-App, eigene Web-Adressen und localhost – sonst nichts', () => {
  const env = (k) => (k === 'SOCIAL_APP_ORIGINS' ? 'https://app.lunaxora.de' : undefined);
  assert.equal(allowedReturn('nexora://social', env), true);
  assert.equal(allowedReturn('nexora://anderes', env), false);
  assert.equal(allowedReturn('nexora://social?x=1', env), false);
  assert.equal(allowedReturn('fremd://social', env), false);
  assert.equal(allowedReturn('https://app.lunaxora.de/social', env), true);
  assert.equal(allowedReturn('https://boese.example/social', env), false);
  assert.equal(allowedReturn('http://localhost:8081/social', env), true);
  assert.equal(allowedReturn(undefined, env), false);
});

test('Rückleitung in die Handy-App trägt Code und Status mit', async () => {
  const secret = 'test-geheimnis';
  const env = (k) => ({ TIKTOK_CLIENT_KEY: 'key', TIKTOK_CLIENT_SECRET: secret })[k];
  const state = await signState({ u: 'nutzer-1', p: 'tiktok', n: 'abc', t: Date.now(), r: 'nexora://social' }, secret);
  const res = await handleRequest(
    new Request(`${BASE}/callback?code=CODE123&state=${encodeURIComponent(state)}`),
    { ...deps, env },
  );
  assert.equal(res.status, 302);
  const back = new URL(res.headers.get('Location'));
  assert.equal(`${back.protocol}//${back.host}`, 'nexora://social');
  assert.equal(back.searchParams.get('social_platform'), 'tiktok');
  assert.equal(back.searchParams.get('social_code'), 'CODE123');
  assert.equal(back.searchParams.get('social_state'), state);
});
