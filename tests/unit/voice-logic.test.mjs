// Unit-Tests: Sprachmodus von Nexy (Pausen-Erkennung, Befehle, Vorlesen). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cleanTranscript,
  createSpeechDetector,
  executedText,
  pendingConfirmation,
  speechChunks,
  speechText,
  spokenReply,
  voiceIntent,
} from '../../src/features/assistant/voice-logic.ts';

/** Messwerte alle 50 ms: [Lautstärke, Dauer in ms] */
function run(detector, parts) {
  let t = 0;
  let state = detector.state;
  for (const [rms, ms] of parts) {
    for (let i = 0; i < ms; i += 50) {
      state = detector.push(rms, t);
      t += 50;
      if (state === 'done' || state === 'no_speech' || state === 'max') return { state, t };
    }
  }
  return { state, t };
}

test('Pausen-Erkennung: Sprechen, dann Pause -> fertig nach ~1,3 s Ruhe', () => {
  const d = createSpeechDetector();
  const { state, t } = run(d, [[0.003, 400], [0.12, 1500], [0.004, 3000]]);
  assert.equal(state, 'done');
  assert.ok(t >= 1900 + 1300 && t <= 1900 + 1500, String(t));
  assert.ok(d.speechMs >= 1400);
});

test('Pausen-Erkennung: kurze Pausen beim Reden beenden die Aufnahme nicht', () => {
  const d = createSpeechDetector();
  const { state } = run(d, [[0.003, 400], [0.1, 800], [0.004, 700], [0.1, 900], [0.004, 600], [0.1, 500]]);
  assert.equal(state, 'speaking');
});

test('Pausen-Erkennung: niemand spricht -> no_speech; Klick allein zählt nicht', () => {
  const d = createSpeechDetector({ noSpeechMs: 4000 });
  const { state, t } = run(d, [[0.003, 1000], [0.3, 100], [0.003, 6000]]);
  assert.equal(state, 'no_speech');
  assert.ok(t >= 4000 && t < 4200, String(t));
});

test('Pausen-Erkennung: lautes Grundrauschen hebt die Schwelle', () => {
  const d = createSpeechDetector({ noSpeechMs: 3000 });
  // Lüfter/Straße: 0,02 ist hier kein Sprechen
  assert.equal(run(d, [[0.02, 5000]]).state, 'no_speech');
  const d2 = createSpeechDetector();
  assert.equal(run(d2, [[0.02, 400], [0.15, 1000], [0.02, 2000]]).state, 'done');
});

test('Pausen-Erkennung: Höchstdauer', () => {
  const d = createSpeechDetector({ maxMs: 3000 });
  assert.equal(run(d, [[0.003, 300], [0.1, 10000]]).state, 'max');
});

test('Pausen-Erkennung: Pegel für die Anzeige 0..1', () => {
  const d = createSpeechDetector();
  run(d, [[0.005, 400]]);
  assert.equal(d.level(0.005), 0);
  assert.ok(d.level(0.05) > 0.2 && d.level(0.05) < 1);
  assert.equal(d.level(0.9), 1);
});

test('Sprachbefehle: Ja/Nein nur bei offenen Vorschlägen', () => {
  for (const t of ['Ja', 'Ja, bitte!', 'Okay Nexy', 'Mach das.', 'Ja, mach das bitte', 'Passt so', 'Leg los', 'Genau', 'Jo', 'Alles klar'])
    assert.equal(voiceIntent(t, true), 'confirm', t);
  for (const t of ['Nein', 'Nee, lass es', 'Verwerfen', 'Abbrechen', 'Nein danke', 'Lieber nicht'])
    assert.equal(voiceIntent(t, true), 'cancel', t);
  assert.equal(voiceIntent('Ja', false), 'message');
  assert.equal(voiceIntent('Nein', false), 'message');
});

test('Sprachbefehle: Stopp beendet immer, längere Sätze sind Nachrichten', () => {
  for (const t of ['Stopp', 'Tschüss Nexy', 'Das war’s, danke', 'Sprachmodus beenden', 'Hör auf.'])
    assert.equal(voiceIntent(t, false), 'stop', t);
  assert.equal(voiceIntent('Stopp', true), 'stop');
  assert.equal(voiceIntent('Ja, und leg noch eine Ausgabe über 20 Euro an', true), 'message');
  assert.equal(voiceIntent('Nein, der Preis ist 1200 Euro', true), 'message');
  assert.equal(voiceIntent('Welche Rechnungen sind offen?', true), 'message');
  assert.equal(voiceIntent('Danke', true), 'message');
  assert.equal(voiceIntent('', true), 'message');
});

test('Erkannter Text: Rauschen und typische Einbildungen fallen weg', () => {
  assert.equal(cleanTranscript('  Leg einen   Kunden an. '), 'Leg einen Kunden an.');
  assert.equal(cleanTranscript('Untertitel im Auftrag des ZDF für funk, 2017'), '');
  assert.equal(cleanTranscript('Untertitelung des ZDF, 2020'), '');
  assert.equal(cleanTranscript('Vielen Dank fürs Zuschauen!'), '');
  assert.equal(cleanTranscript('...'), '');
  assert.equal(cleanTranscript('SWR 2021'), '');
  assert.equal(cleanTranscript('Ich hab 30 Euro für Flyer bezahlt'), 'Ich hab 30 Euro für Flyer bezahlt');
});

test('Vorlesen: Markdown, Links, Emojis und Abkürzungen', () => {
  assert.equal(
    speechText('**Klar!** 🚀 Hier sind Ideen:\n- Vorher/Nachher-Video\n- Tipps z. B. zur Pflege\nMehr: https://example.com/x'),
    'Klar! Hier sind Ideen: Vorher/Nachher-Video. Tipps zum Beispiel zur Pflege. Mehr: Link',
  );
  assert.equal(speechText('1. Erstens\n2. Zweitens'), 'Erstens. Zweitens');
  assert.equal(speechText('Preis inkl. MwSt.'), 'Preis inklusive Mehrwertsteuer');
});

test('Vorlesen: in Stücke teilen', () => {
  const text = 'Erster Satz. Zweiter Satz ist etwas länger! Dritter? ' + 'Wort '.repeat(80).trim() + '.';
  const chunks = speechChunks(text, 120);
  assert.ok(chunks.every((c) => c.length <= 120), JSON.stringify(chunks.map((c) => c.length)));
  assert.equal(chunks.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
  assert.deepEqual(speechChunks('Kurz.'), ['Kurz.']);
  assert.deepEqual(speechChunks(''), []);
});

test('Antwort vorlesen: Vorschläge -> Rückfrage, Fehler ohne technische Details', () => {
  assert.equal(
    spokenReply({ text: 'Ich habe den Auftrag vorbereitet.', proposals: [{}], status: 'open' }),
    'Ich habe den Auftrag vorbereitet. Soll ich das so machen? Sag einfach ja oder nein.',
  );
  assert.equal(
    spokenReply({ text: 'Passt das so?', proposals: [{}], status: 'open' }),
    'Passt das so? Sag einfach ja oder nein.',
  );
  assert.equal(spokenReply({ text: 'Du hast 2 offene Rechnungen.' }), 'Du hast 2 offene Rechnungen.');
  assert.equal(
    spokenReply({ text: 'x', error: 'Nexy konnte das gerade nicht auswerten.\n\nTechnische Details: 502 claude_error' }),
    'Nexy konnte das gerade nicht auswerten.',
  );
});

test('Nach dem Ausführen', () => {
  assert.equal(executedText({ ok: true, results: [{ label: 'Kunde Lisa' }] }), 'Erledigt: Kunde Lisa.');
  assert.equal(
    executedText({ ok: true, results: [{ label: 'Kunde Lisa' }, { label: 'Auftrag Website' }, { label: 'Angebot AN-1' }] }),
    'Erledigt: Kunde Lisa, Auftrag Website und Angebot AN-1.',
  );
  assert.equal(executedText({ ok: true, results: Array.from({ length: 5 }, () => ({ label: 'x' })) }), 'Erledigt! 5 Sachen sind fertig.');
  assert.match(executedText({ ok: false, results: [], error: '„Rechnung“: Dafür fehlt noch IBAN.' }), /^Das hat nicht ganz geklappt\. „Rechnung“: Dafür fehlt noch IBAN\.$/);
});

test('Ja/Nein gilt nur für die Vorschläge der letzten Nexy-Nachricht', () => {
  const open = { id: 'n1', role: 'nexy', status: 'open', proposals: [{}] };
  assert.equal(pendingConfirmation([{ id: 'u1', role: 'user' }, open]), open);
  assert.equal(pendingConfirmation([open, { id: 'u2', role: 'user' }]), open);
  assert.equal(pendingConfirmation([open, { id: 'u2', role: 'user' }, { id: 'n2', role: 'nexy' }]), null);
  assert.equal(pendingConfirmation([{ ...open, status: 'done' }]), null);
  assert.equal(pendingConfirmation([]), null);
});
