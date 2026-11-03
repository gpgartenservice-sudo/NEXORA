import { Platform } from 'react-native';

import { desktop } from '@/lib/desktop';

import { createSpeechDetector, pickGermanVoice, speechChunks, speechText, type DetectorOptions } from './voice-logic';

/**
 * Sprachmodus von Nexy – Mikrofon, Aufnahme mit Pausen-Erkennung, Vorlesen.
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

/** Kann die App hier vorlesen? */
export function speechSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

// ---------------------------------------------------------------------------
// Mikrofon + Aufnahme
// ---------------------------------------------------------------------------

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

const MAC_DENIED =
  'NEXORA darf das Mikrofon nicht benutzen. Erlaube es unter Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon und starte die App danach neu.';
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
    current?.cancel();
    stream.getTracks().forEach((t) => t.stop());
    void audio.close().catch(() => {});
  };

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
// Vorlesen (Stimmen des Systems – auf dem Mac z. B. Anna/Petra, kostenlos)
// ---------------------------------------------------------------------------

export type Speech = { done: Promise<void>; cancel: () => void };

// Chrome meldet bei Sprachausgaben, die nicht mehr referenziert werden, manchmal kein Ende
const alive = new Set<SpeechSynthesisUtterance>();
let active: Speech | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, 1200);
    synth.addEventListener('voiceschanged', done);
  });
}

/** Text vorlesen. `done` ist erfüllt, wenn fertig (oder abgebrochen). */
export function speak(text: string, options: { onStart?: () => void } = {}): Speech {
  active?.cancel();
  const chunks = speechChunks(speechText(text));
  if (!speechSupported() || !chunks.length) return { done: Promise.resolve(), cancel: () => {} };

  const synth = window.speechSynthesis;
  let cancelled = false;
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => (finish = resolve));
  const speech: Speech = {
    done,
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      synth.cancel();
      finish();
    },
  };
  active = speech;
  synth.cancel();

  void (async () => {
    const voice = pickGermanVoice(await loadVoices());
    for (const [i, chunk] of chunks.entries()) {
      if (cancelled) break;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = voice?.lang ?? 'de-DE';
        if (voice) u.voice = voice;
        u.rate = 1.04;
        u.pitch = 1.08;
        alive.add(u);
        // Sicherheitsnetz, falls kein "Ende" gemeldet wird
        const guard = setTimeout(() => end(), 4000 + chunk.length * 110);
        const end = () => {
          clearTimeout(guard);
          alive.delete(u);
          resolve();
        };
        u.onend = end;
        u.onerror = end;
        if (i === 0 && options.onStart) u.onstart = () => options.onStart?.();
        synth.speak(u);
      });
    }
    if (active === speech) active = null;
    finish();
  })();

  return speech;
}

/** Vorlesen sofort beenden */
export function stopSpeaking() {
  active?.cancel();
  active = null;
}
