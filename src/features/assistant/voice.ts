import { Platform } from 'react-native';

import { desktop } from '@/lib/desktop';

import { speechAudio, type SpeechAudioResult } from './assistant-api';
import { createSpeechDetector, speechChunks, speechText, type DetectorOptions } from './voice-logic';

/**
 * Sprachmodus von Luna – Mikrofon, Aufnahme mit Pausen-Erkennung, Vorlesen.
 *
 * Läuft im Mac-Fenster und im Browser (Web-APIs). Die Aufnahme bleibt im
 * Speicher und geht nur zur Umwandlung in Text an die Server-Funktion.
 */

type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext ?? null
  );
}

/** Kann die App hier zuhören? */
export function voiceSupported(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && !!audioContextClass();
}

/** Kann die App hier vorlesen? (Mac-Fenster und Browser – Lunas Stimme kommt von ElevenLabs) */
export function speechSupported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

// Mikrofon offen (Sprachmodus): dann keine Ausrufe beim Anstupsen – sonst hört Luna sich selbst
let micOpen = false;

// ---------------------------------------------------------------------------
// Mikrofon + Aufnahme
// ---------------------------------------------------------------------------

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

const MAC_DENIED =
  'Lunaxora darf das Mikrofon nicht benutzen. Erlaube es unter Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon und starte die App danach neu.';
const BROWSER_DENIED =
  'Der Browser hat das Mikrofon blockiert. Erlaube es über das Symbol links in der Adressleiste und versuch es noch einmal.';

export type RecordReason = 'done' | 'max' | 'no_speech' | 'cancelled';
export type RecordResult = { reason: RecordReason; blob: Blob | null; mime: string; speechMs: number };
export type Recording = {
  result: Promise<RecordResult>;
  /** jetzt aufhören und das Gesagte verwenden */
  finish: () => void;
  /** abbrechen, nichts verwenden */
  cancel: () => void;
};
export type Mic = {
  record: (options?: { onLevel?: (level: number) => void; detector?: DetectorOptions }) => Recording;
  /** kurzer Ton: "ich höre zu" bzw. "hab dich gehört" */
  chime: (kind: 'listen' | 'heard') => Promise<void>;
  close: () => void;
};

/** Mikrofon öffnen (fragt beim ersten Mal nach der Erlaubnis). */
export async function openMic(): Promise<{ mic?: Mic; error?: string }> {
  const Ctx = audioContextClass();
  if (!voiceSupported() || !Ctx) return { error: 'Sprache wird hier leider nicht unterstützt.' };

  const bridge = desktop();
  if (bridge?.askMicrophone) {
    const allowed = await bridge.askMicrophone().catch(() => false);
    if (!allowed) return { error: MAC_DENIED };
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { error: bridge ? MAC_DENIED : BROWSER_DENIED };
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      return { error: 'Kein Mikrofon gefunden. Schließ eins an oder prüf die Toneinstellungen.' };
    if (name === 'NotReadableError') return { error: 'Das Mikrofon wird gerade von einem anderen Programm benutzt.' };
    return { error: `Das Mikrofon ließ sich nicht starten.\n\nTechnische Details: ${String(e)}` };
  }

  const audio = new Ctx();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const mime = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
  let current: Recording | null = null;
  let closed = false;

  const record: Mic['record'] = ({ onLevel, detector: detectorOptions } = {}) => {
    current?.cancel();
    const detector = createSpeechDetector(detectorOptions);
    const chunks: Blob[] = [];
    let reason: RecordReason | null = null;
    let settle: (r: RecordResult) => void = () => {};
    const result = new Promise<RecordResult>((resolve) => (settle = resolve));

    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const settled = () => {
      clearInterval(timer);
      onLevel?.(0);
      const type = recorder.mimeType || mime || 'audio/webm';
      const keep = (reason === 'done' || reason === 'max') && chunks.length > 0;
      settle({
        reason: reason ?? 'cancelled',
        blob: keep ? new Blob(chunks, { type }) : null,
        mime: type,
        speechMs: detector.speechMs,
      });
    };
    recorder.onstop = settled;
    const end = (why: RecordReason) => {
      if (reason) return;
      reason = why;
      if (recorder.state !== 'inactive') recorder.stop();
      else settled();
    };

    void audio.resume();
    recorder.start(250);
    const t0 = performance.now();
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
      const rms = Math.sqrt(sum / samples.length);
      const state = detector.push(rms, performance.now() - t0);
      onLevel?.(detector.level(rms));
      if (state === 'done' || state === 'max' || state === 'no_speech') end(state);
    }, 50);

    const recording: Recording = { result, finish: () => end('done'), cancel: () => end('cancelled') };
    current = recording;
    void result.then(() => {
      if (current === recording) current = null;
    });
    return recording;
  };

  const chime: Mic['chime'] = (kind) => {
    if (closed) return Promise.resolve();
    void audio.resume();
    const notes = kind === 'listen' ? [660, 990] : [880, 590];
    const start = audio.currentTime + 0.01;
    notes.forEach((frequency, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    });
    return new Promise((resolve) => setTimeout(resolve, 300));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    micOpen = false;
    current?.cancel();
    stream.getTracks().forEach((t) => t.stop());
    void audio.close().catch(() => {});
  };

  micOpen = true;
  return { mic: { record, chime, close } };
}

/** Aufnahme als Base64 (zum Verschicken an die Server-Funktion) */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// Vorlesen – Lunas Stimme von ElevenLabs (über die Server-Funktion). Eine
// andere Stimme gibt es nicht: Geht ElevenLabs nicht, bleibt Luna stumm und
// meldet den Grund.
// ---------------------------------------------------------------------------

export type Speech = { done: Promise<void>; cancel: () => void };

// Größere Stücke klingen zusammenhängender; das nächste lädt, während eins läuft
const CHUNK = 400;

let active: Speech | null = null;
let reacting: Speech | null = null;
// Kurze, immer gleiche Sätze (Ausrufe) nur einmal bei ElevenLabs holen
const cache = new Map<string, Blob>();

type SpeakOptions = {
  onStart?: () => void;
  /** Vorlesen ging nicht – Grund und ob es an der Einrichtung liegt */
  onError?: (error: string, notSetUp: boolean) => void;
  /** Aufnahme merken (für kurze, wiederkehrende Sätze) */
  cache?: boolean;
};

/** Laufender Vorgang: abbrechbar, merkt sich, ob schon Ton kam */
type Run = {
  signal: AbortSignal;
  started: () => void;
  /** aktuell laufende Aufnahme (zum Anhalten) */
  stopAudio: (() => void) | null;
};

/** Eine fertige Aufnahme abspielen. false = ließ sich nicht abspielen */
function playAudio(blob: Blob, run: Run): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
    const el = new Audio(url);
    let over = false;
    const end = (ok: boolean) => {
      if (over) return;
      over = true;
      el.onended = null;
      el.onerror = null;
      run.stopAudio = null;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    run.stopAudio = () => {
      el.pause();
      end(true);
    };
    el.onplaying = () => run.started();
    el.onended = () => end(true);
    el.onerror = () => end(false);
    el.play().catch(() => end(false));
  });
}

async function fetchChunk(text: string, run: Run, keep: boolean): Promise<SpeechAudioResult> {
  const hit = keep ? cache.get(text) : undefined;
  if (hit) return { audio: hit };
  const result = await speechAudio(text, run.signal);
  if (keep && result.audio) cache.set(text, result.audio);
  return result;
}

/** Text vorlesen. `done` ist erfüllt, wenn fertig (oder abgebrochen bzw. fehlgeschlagen). */
export function speak(text: string, options: SpeakOptions = {}): Speech {
  active?.cancel();
  const chunks = speechChunks(speechText(text), CHUNK);
  if (!speechSupported() || !chunks.length) return { done: Promise.resolve(), cancel: () => {} };

  const controller = new AbortController();
  let cancelled = false;
  let started = false;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  const run: Run = {
    signal: controller.signal,
    started: () => {
      if (started) return;
      started = true;
      options.onStart?.();
    },
    stopAudio: null,
  };
  const speech: Speech = {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
      run.stopAudio?.();
      finish();
    },
  };
  active = speech;

  void (async () => {
    const keep = !!options.cache;
    let next = fetchChunk(chunks[0], run, keep);
    for (let i = 0; i < chunks.length; i++) {
      const result = await next;
      if (cancelled) break;
      if (!result.audio) {
        options.onError?.(result.error ?? 'Lunas Stimme hat nicht geantwortet.', !!result.notSetUp);
        break;
      }
      // das nächste Stück schon holen, während dieses läuft
      if (i + 1 < chunks.length) next = fetchChunk(chunks[i + 1], run, keep);
      if (!(await playAudio(result.audio, run))) break;
    }
    if (active === speech) active = null;
    finish();
  })();

  return speech;
}

/**
 * Kurzer Ausruf beim Anstupsen von Luna. Unterbricht nichts: nicht, während
 * Luna eine Antwort vorliest oder das Mikrofon offen ist. Fehler bleiben still.
 */
export function speakReaction(text: string) {
  if (!speechSupported() || micOpen) return;
  if (active && active !== reacting) return;
  reacting = speak(text, { cache: true });
}

/** Vorlesen sofort beenden */
export function stopSpeaking() {
  active?.cancel();
  active = null;
}
