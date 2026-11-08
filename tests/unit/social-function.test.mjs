// Unit-Tests für die Server-Funktion "social" (ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleRequest } from '../../supabase/functions/social/index.ts';

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
