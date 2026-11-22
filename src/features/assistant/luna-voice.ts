/**
 * Lunas Stimme (Profil → Design): drei Stimmen von ElevenLabs zur Auswahl, für alle Abos.
 * Gespeichert unter design.voice; welche ElevenLabs-Stimme dahintersteht, legt die
 * Server-Funktion fest (assistant, Modus "speak", Feld `voice`). Reine Logik mit Unit-Tests.
 */

export type LunaVoice = 'luna' | 'male' | 'calm';

export const LUNA_VOICES: { key: LunaVoice; title: string; text: string }[] = [
  { key: 'luna', title: 'Luna', text: 'Ihre normale Stimme' },
  { key: 'male', title: 'Männlich', text: 'Freundliche Männerstimme' },
  { key: 'calm', title: 'Ruhig', text: 'Sanft und gelassen' },
];

export const DEFAULT_VOICE: LunaVoice = 'luna';

/** Gespeicherte Wahl lesen – Unbekanntes (oder noch nichts gewählt) ist Lunas normale Stimme */
export function readLunaVoice(raw: unknown): LunaVoice {
  return LUNA_VOICES.some((v) => v.key === raw) ? (raw as LunaVoice) : DEFAULT_VOICE;
}

/** Satz zum Probehören in Profil → Design */
export const VOICE_SAMPLE = 'Hallo, ich bin Luna. So klinge ich mit dieser Stimme.';

// Die Stimme, mit der Luna gerade vorliest (setzt das Konto-Layout aus dem Profil)
let current: LunaVoice = DEFAULT_VOICE;

export function setSpeechVoice(voice: LunaVoice) {
  current = readLunaVoice(voice);
}

export function speechVoice(): LunaVoice {
  return current;
}
