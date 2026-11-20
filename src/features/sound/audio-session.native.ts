import { setAudioModeAsync, type AudioMode } from 'expo-audio';

/**
 * iPhone/Android: wie Lunaxora mit dem Ton anderer Apps (Musik, Podcasts) umgeht.
 *   ui     – Klick-Töne laufen einfach mit, andere Apps bleiben gleich laut
 *            (und folgen dem Stumm-Schalter wie bei anderen Apps)
 *   voice  – während Luna spricht, wird andere Musik leiser (auch bei Stummschaltung hörbar)
 *   record – Sprachmodus: Aufnahme und Wiedergabe gleichzeitig, andere Musik leiser
 * Stimme und Mikrofon „halten“ ihre Einstellung nur, solange sie laufen – danach gilt wieder ui.
 * Web/Mac: audio-session.ts (dort gibt es das nicht).
 */
type Hold = 'voice' | 'record';
type Mode = 'ui' | Hold;

const MODES: Record<Mode, Partial<AudioMode>> = {
  ui: { playsInSilentMode: false, interruptionMode: 'mixWithOthers', allowsRecording: false },
  voice: { playsInSilentMode: true, interruptionMode: 'duckOthers', allowsRecording: false },
  record: { playsInSilentMode: true, interruptionMode: 'duckOthers', allowsRecording: true },
};

const holds: Record<Hold, number> = { voice: 0, record: 0 };
let applied: Mode | null = null;
let queue: Promise<void> = Promise.resolve();

const wanted = (): Mode => (holds.record ? 'record' : holds.voice ? 'voice' : 'ui');

/** Passende Einstellung setzen (nur wenn sie sich ändert) – vor dem Abspielen abwarten */
export function audioReady(): Promise<void> {
  queue = queue.then(async () => {
    const next = wanted();
    if (next === applied) return;
    try {
      await setAudioModeAsync(MODES[next]);
      applied = next;
    } catch {
      applied = null;
    }
  });
  return queue;
}

/** Stimme bzw. Mikrofon läuft – gibt die Funktion zum Freigeben zurück */
export function holdAudio(kind: Hold): () => void {
  holds[kind] += 1;
  void audioReady();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds[kind] -= 1;
    void audioReady();
  };
}
