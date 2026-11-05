/**
 * Sprachmodus von Nexy – reine Logik (ohne Browser), damit sie sich testen lässt:
 * Pausen-Erkennung, Sprachbefehle, Aufräumen von erkanntem und vorzulesendem Text.
 */

// ---------------------------------------------------------------------------
// Pausen-Erkennung: Wann hat der Nutzer angefangen und wann aufgehört zu reden?
// ---------------------------------------------------------------------------

export type DetectorOptions = {
  /** so lange Ruhe nach dem Sprechen = fertig */
  silenceMs?: number;
  /** so lange gar nichts gesagt = niemand spricht */
  noSpeechMs?: number;
  /** längste Aufnahme */
  maxMs?: number;
  /** so viel Sprache, bis es als Sprechen zählt (filtert Klicks/Huster) */
  minSpeechMs?: number;
  /** so lange wird am Anfang das Grundrauschen gemessen */
  calibrateMs?: number;
};

export type DetectorState = 'calibrating' | 'waiting' | 'speaking' | 'done' | 'no_speech' | 'max';

export type SpeechDetector = {
  /** neuer Messwert (Lautstärke als RMS 0..1) zum Zeitpunkt t (ms) */
  push: (rms: number, t: number) => DetectorState;
  /** Lautstärke für die Anzeige (0..1, über dem Grundrauschen) */
  level: (rms: number) => number;
  readonly state: DetectorState;
  readonly speechMs: number;
};

const MIN_THRESHOLD = 0.012;
const MAX_THRESHOLD = 0.08;

export function createSpeechDetector(options: DetectorOptions = {}): SpeechDetector {
  const silenceMs = options.silenceMs ?? 1300;
  const noSpeechMs = options.noSpeechMs ?? 9000;
  const maxMs = options.maxMs ?? 45000;
  const minSpeechMs = options.minSpeechMs ?? 250;
  const calibrateMs = options.calibrateMs ?? 300;

  let start: number | null = null;
  let last: number | null = null;
  let floorSum = 0;
  let floorCount = 0;
  let floor = 0;
  let threshold = MIN_THRESHOLD;
  let state: DetectorState = 'calibrating';
  let speechMs = 0;
  let quietSince: number | null = null;

  const push = (rms: number, t: number): DetectorState => {
    if (state === 'done' || state === 'no_speech' || state === 'max') return state;
    if (start === null) start = t;
    const dt = last === null ? 0 : Math.max(0, Math.min(t - last, 250));
    last = t;
    const elapsed = t - start;

    if (state === 'calibrating') {
      floorSum += rms;
      floorCount++;
      if (elapsed >= calibrateMs) {
        floor = floorSum / floorCount;
        threshold = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, floor * 2.5 + 0.006));
        state = 'waiting';
      }
      return state;
    }

    const loud = rms > threshold;
    // etwas leiser als die Schwelle zählt noch als Sprechen (Hysterese)
    const quiet = rms < threshold * 0.8;

    if (loud) speechMs += dt;
    if (state === 'waiting' && speechMs >= minSpeechMs) state = 'speaking';

    if (state === 'speaking') {
      if (quiet) {
        if (quietSince === null) quietSince = t;
        if (t - quietSince >= silenceMs) state = 'done';
      } else {
        quietSince = null;
      }
    } else if (elapsed >= noSpeechMs) {
      state = 'no_speech';
    }
    if (state !== 'done' && elapsed >= maxMs) state = speechMs >= minSpeechMs ? 'max' : 'no_speech';
    return state;
  };

  return {
    push,
    level: (rms) => Math.min(1, Math.pow(Math.max(0, rms - floor) / 0.18, 0.6)),
    get state() {
      return state;
    },
    get speechMs() {
      return speechMs;
    },
  };
}

// ---------------------------------------------------------------------------
// Sprachbefehle
// ---------------------------------------------------------------------------

export type VoiceIntent = 'confirm' | 'cancel' | 'stop' | 'message';

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^a-zäöüß0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Füllwörter, die an einem Befehl nichts ändern ("Ja, bitte Nexy")
const FILLER = /\b(bitte|nexy|danke|gerne|gern|doch|mal|einfach|so|jetzt|nun|also|ok|okay|ja|klar|genau)\b/g;

const CONFIRM = new Set([
  'ja',
  'jo',
  'jap',
  'jup',
  'yes',
  'jawohl',
  'ok',
  'okay',
  'klar',
  'genau',
  'gerne',
  'gern',
  'passt',
  'perfekt',
  'super',
  'top',
  'richtig',
  'stimmt',
  'sehr gut',
  'gut',
  'los',
  'leg los',
  'mach',
  'mach das',
  'mach es',
  'mach mal',
  'machen',
  'tu das',
  'bestätigen',
  'bestätige',
  'ich bestätige',
  'ausführen',
  'führ aus',
  'führ es aus',
  'führ das aus',
  'speichern',
  'speicher',
  'anlegen',
  'leg an',
  'leg es an',
  'erstellen',
  'erstell',
  'erstell es',
  'passt so',
  'so machen',
  'ja passt',
  'ja mach',
  'einverstanden',
  'alles klar',
  'ja gerne',
  'ja bitte',
  'ja genau',
  'ja klar',
]);
const CANCEL = new Set([
  'nein',
  'ne',
  'nee',
  'nö',
  'no',
  'nicht',
  'doch nicht',
  'lieber nicht',
  'nein danke',
  'verwerfen',
  'verwirf',
  'verwirf das',
  'verwirf es',
  'abbrechen',
  'brich ab',
  'lass es',
  'lass das',
  'lass mal',
  'vergiss es',
  'vergiss das',
  'löschen',
  'weg damit',
  'falsch',
  'stimmt nicht',
  'passt nicht',
]);
const STOP = new Set([
  'stopp',
  'stop',
  'ende',
  'beenden',
  'beende',
  'aufhören',
  'hör auf',
  'tschüss',
  'tschüs',
  'ciao',
  'bye',
  'bis dann',
  'bis später',
  'auf wiedersehen',
  'das wars',
  'das war es',
  'das wäre es',
  'das wärs',
  'sprachmodus beenden',
  'sprachmodus aus',
  'mikro aus',
  'mikrofon aus',
  'gute nacht',
  'schluss',
]);

/**
 * Was will der Nutzer mit diesem Satz? Nur kurze, eindeutige Sätze gelten als
 * Befehl – "Ja, und leg noch eine Ausgabe an" geht als Nachricht an Nexy.
 * Ja/Nein zählen nur, wenn Vorschläge auf Bestätigung warten.
 */
export function voiceIntent(text: string, hasOpenProposals: boolean): VoiceIntent {
  const t = normalize(text);
  if (!t || t.split(' ').length > 6) return 'message';
  const core = t.replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (STOP.has(t) || (core && STOP.has(core))) return 'stop';
  if (!hasOpenProposals) return 'message';
  const words = t.split(' ').length;
  if (CANCEL.has(t) || (core && CANCEL.has(core)) || (words <= 3 && /^(nein|nee|ne|nö)\b/.test(t))) return 'cancel';
  if (CONFIRM.has(t) || (core && CONFIRM.has(core)) || (!core && /\b(ja|ok|okay|klar|genau|gerne?)\b/.test(t)))
    return 'confirm';
  return 'message';
}

// ---------------------------------------------------------------------------
// Erkannter Text
// ---------------------------------------------------------------------------

// Bekannte "Einbildungen" der Spracherkennung bei Stille/Rauschen (aus Untertiteln gelernt)
const NOISE = [
  /untertitel(ung)? (im auftrag )?(des|der|von) /i,
  /untertitel von /i,
  /vielen dank (fürs|für das|für's) zu(schauen|sehen|hören)/i,
  /danke (fürs|für das|für's) zu(schauen|sehen|hören)/i,
  /bis zum nächsten mal/i,
  /abonniert? (den|meinen) kanal/i,
  /amara\.org/i,
  /copyright/i,
  /^\W*(swr|wdr|zdf|ard|ndr|br)( \d{4})?\W*$/i,
];

/** Erkannten Text aufräumen; leer, wenn es nur Rauschen/Einbildung war. */
export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!/[a-zäöüß0-9]/i.test(t)) return '';
  if (NOISE.some((re) => re.test(t))) return '';
  return t;
}

// ---------------------------------------------------------------------------
// Vorlesen
// ---------------------------------------------------------------------------

/** Text so umbauen, dass er sich gut vorlesen lässt (kein Markdown, keine Links, keine Emojis). */
export function speechText(text: string): string {
  return (
    text
      // Links
      .replace(/https?:\/\/\S+/g, 'Link')
      // Markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,!?]|$)/g, '$1$2')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
      // Emojis und Pfeile
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/[→←↑↓⇒]/g, ' ')
      // Abkürzungen, die Stimmen oft falsch lesen
      .replace(/\bz\. ?B\./g, 'zum Beispiel')
      .replace(/\bd\. ?h\./g, 'das heißt')
      .replace(/\bu\. ?a\./g, 'unter anderem')
      .replace(/\bca\./g, 'circa')
      .replace(/\bggf\./g, 'gegebenenfalls')
      .replace(/\binkl\./g, 'inklusive')
      .replace(/\bzzgl\./g, 'zuzüglich')
      .replace(/\bMwSt\.?/g, 'Mehrwertsteuer')
      .replace(/\bUSt\.?/g, 'Umsatzsteuer')
      // Zeilen zu Sätzen
      .replace(/([^.!?:;,\s])\s*\n+/g, '$1. ')
      .replace(/\s*\n+\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** In vorlesbare Stücke teilen (lange Texte brechen in manchen Browsern sonst ab). */
export function speechChunks(text: string, max = 220): string[] {
  const sentences =
    text
      .match(/[^.!?]+[.!?]+["“”»]?|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const parts =
      sentence.length <= max ? [sentence] : (sentence.match(new RegExp(`.{1,${max}}(?:,|\\s|$)`, 'g')) ?? [sentence]);
    for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
      if (current && current.length + 1 + part.length > max) {
        chunks.push(current);
        current = part;
      } else {
        current = current ? `${current} ${part}` : part;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Was Nexy im Sprachmodus zu einer Antwort sagt. */
export function spokenReply(message: { text: string; error?: string; proposals?: unknown[]; status?: string }): string {
  if (message.error) {
    // nur der verständliche Teil, keine technischen Details
    return speechText(message.error.split(/\n\s*\n/)[0]);
  }
  const text = speechText(message.text);
  if (message.proposals?.length && message.status === 'open') {
    const ask = /\?\s*$/.test(text) ? '' : ' Soll ich das so machen?';
    return `${text}${ask} Sag einfach ja oder nein.`.trim();
  }
  return text;
}

/** Was Nexy nach dem Ausführen per Sprache sagt. */
export function executedText(outcome: { ok: boolean; results: { label: string }[]; error?: string }): string {
  if (!outcome.ok) return speechText(`Das hat nicht ganz geklappt. ${(outcome.error ?? '').split(/\n\s*\n/)[0]}`);
  const labels = outcome.results.map((r) => r.label);
  if (!labels.length) return 'Erledigt!';
  if (labels.length === 1) return `Erledigt: ${labels[0]}.`;
  if (labels.length <= 3) return `Erledigt: ${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}.`;
  return `Erledigt! ${labels.length} Sachen sind fertig.`;
}

// ---------------------------------------------------------------------------
// Worauf bezieht sich ein gesprochenes "Ja"/"Nein"?
// ---------------------------------------------------------------------------

type ChatMessage = { id: string; role: 'user' | 'nexy'; status?: string; proposals?: unknown[] };

/**
 * Die Vorschläge der LETZTEN Nexy-Nachricht, wenn sie noch auf Bestätigung warten.
 * Ältere offene Vorschläge zählen nicht – sonst würde ein "Ja" auf eine spätere
 * Frage aus Versehen alte Vorschläge ausführen.
 */
export function pendingConfirmation<T extends ChatMessage>(messages: T[]): T | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'nexy') continue;
    return m.status === 'open' && m.proposals?.length ? m : null;
  }
  return null;
}
