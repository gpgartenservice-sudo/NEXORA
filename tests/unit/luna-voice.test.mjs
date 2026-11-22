// Unit-Tests: Lunas Stimme (Profil → Design) – Auswahl, Speichern, Server kennt dieselben Stimmen. Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  DEFAULT_VOICE,
  LUNA_VOICES,
  readLunaVoice,
  setSpeechVoice,
  speechVoice,
} from '../../src/features/assistant/luna-voice.ts';
import { DEFAULT_DESIGN, designToJson, readDesign } from '../../src/features/design/design-logic.ts';

test('Stimme: drei zur Auswahl, Luna zuerst', () => {
  assert.deepEqual(
    LUNA_VOICES.map((v) => v.key),
    ['luna', 'male', 'calm'],
  );
  assert.equal(DEFAULT_VOICE, 'luna');
  assert.equal(LUNA_VOICES[0].key, DEFAULT_VOICE);
  for (const v of LUNA_VOICES) assert.ok(v.title && v.text, v.key);
});

test('Stimme lesen: Unbekanntes ist Lunas normale Stimme', () => {
  assert.equal(readLunaVoice('male'), 'male');
  assert.equal(readLunaVoice('calm'), 'calm');
  assert.equal(readLunaVoice(undefined), 'luna');
  assert.equal(readLunaVoice('roboter'), 'luna');
  assert.equal(readLunaVoice(3), 'luna');
});

test('Stimme im Design: speichern und wieder lesen, alte Designs behalten Luna', () => {
  assert.equal(DEFAULT_DESIGN.voice, 'luna');
  // gespeichert, bevor es die Auswahl gab
  assert.equal(readDesign({ accent: '#2FE39A', luna: { hat: 'crown' } }).voice, 'luna');
  assert.equal(readDesign(null).voice, 'luna');
  const chosen = { ...DEFAULT_DESIGN, voice: 'male' };
  assert.equal(designToJson(chosen).voice, 'male');
  assert.equal(readDesign(JSON.parse(JSON.stringify(designToJson(chosen)))).voice, 'male');
  assert.equal(readDesign({ voice: 'kaputt' }).voice, 'luna');
});

test('Stimme fürs Vorlesen merken', () => {
  setSpeechVoice('calm');
  assert.equal(speechVoice(), 'calm');
  setSpeechVoice('gibts-nicht');
  assert.equal(speechVoice(), 'luna');
});

test('Server-Funktion kennt genau dieselben Stimmen', () => {
  const server = readFileSync(new URL('../../supabase/functions/assistant/index.ts', import.meta.url), 'utf8');
  const block = server.match(/const TTS_VOICES[^=]*=\s*\{([\s\S]*?)\n\};/);
  assert.ok(block, 'TTS_VOICES fehlt in der Server-Funktion');
  const keys = [...block[1].matchAll(/^\s*(\w+):\s*\{/gm)].map((m) => m[1]);
  assert.deepEqual(keys, LUNA_VOICES.map((v) => v.key));
  // die App schickt die Wahl mit
  assert.match(server, /ttsVoice\(body\.voice/);
});
