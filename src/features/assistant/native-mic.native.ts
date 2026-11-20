import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, type AudioRecorder } from 'expo-audio';
import { Platform } from 'react-native';

import { audioReady, holdAudio } from '@/features/sound/audio-session';
import { playSound } from '@/features/sound/ui-sound';

import type { Mic, RecordReason, RecordResult, Recording } from './voice';
import { createSpeechDetector } from './voice-logic';

/**
 * iPhone: Mikrofon für Lunas Sprachmodus (expo-audio). Gleiche Abläufe wie im Web: Pegel
 * messen, Pausen erkennen, Aufnahme (M4A) zurückgeben – zur Umwandlung in Text geht sie an
 * die Server-Funktion. Die Aufnahme bleibt sonst nur auf dem Gerät.
 */

const DENIED =
  'Lunaxora darf das Mikrofon nicht benutzen. Erlaube es in den iPhone-Einstellungen unter Lunaxora → Mikrofon.';

/** Sprache: Mono und kleine Datei reichen völlig */
const PRESET = RecordingPresets.HIGH_QUALITY;
const OPTIONS = {
  extension: PRESET.extension,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
  ...(Platform.OS === 'ios' ? PRESET.ios : PRESET.android),
};

/** Recorder-Klasse von expo-audio (so erzeugt sie auch useAudioRecorder) */
const Native = AudioModule as unknown as { AudioRecorder: new (options: typeof OPTIONS) => AudioRecorder };

/** Pegel des iPhones (dBFS, −160…0) als Lautstärke 0…1 wie im Web */
export function dbToRms(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0;
  return Math.pow(10, Math.max(-160, Math.min(0, db)) / 20);
}

export function nativeMicSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function openNativeMic(): Promise<{ mic?: Mic; error?: string }> {
  const permission = await requestRecordingPermissionsAsync().catch(() => null);
  if (!permission?.granted) return { error: DENIED };
  // Aufnahme und Wiedergabe gleichzeitig (Lautsprecher, auch bei Stummschaltung), bis close()
  const releaseAudio = holdAudio('record');
  await audioReady();

  let current: Recording | null = null;
  let closed = false;

  const record: Mic['record'] = ({ onLevel, detector: detectorOptions } = {}) => {
    current?.cancel();
    const detector = createSpeechDetector(detectorOptions);
    let reason: RecordReason | null = null;
    let started = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let recorder: AudioRecorder | null = null;
    let settle: (r: RecordResult) => void = () => {};
    const result = new Promise<RecordResult>((resolve) => (settle = resolve));

    const settleWith = async () => {
      if (timer) clearInterval(timer);
      onLevel?.(0);
      let blob: Blob | null = null;
      if (recorder) {
        try {
          if (started) await recorder.stop();
          const keep = (reason === 'done' || reason === 'max') && !!recorder.uri;
          if (keep && recorder.uri) blob = await (await fetch(recorder.uri)).blob();
        } catch {
          blob = null;
        }
        recorder.release();
      }
      settle({ reason: reason ?? 'cancelled', blob, mime: 'audio/mp4', speechMs: detector.speechMs });
    };

    const end = (why: RecordReason) => {
      if (reason) return;
      reason = why;
      // läuft die Aufnahme schon, jetzt beenden – sonst erledigt das der Start unten
      if (started) void settleWith();
    };

    void (async () => {
      try {
        await audioReady();
        recorder = new Native.AudioRecorder(OPTIONS);
        await recorder.prepareToRecordAsync();
        if (reason) return void settleWith();
        recorder.record();
        started = true;
      } catch {
        reason ??= 'cancelled';
        return void settleWith();
      }
      const t0 = Date.now();
      timer = setInterval(() => {
        if (!recorder || reason) return;
        const rms = dbToRms(recorder.getStatus().metering);
        const state = detector.push(rms, Date.now() - t0);
        onLevel?.(detector.level(rms));
        if (state === 'done' || state === 'max' || state === 'no_speech') end(state);
      }, 50);
    })();

    const recording: Recording = { result, finish: () => end('done'), cancel: () => end('cancelled') };
    current = recording;
    void result.then(() => {
      if (current === recording) current = null;
    });
    return recording;
  };

  // kurzer Ton: „ich höre zu“ bzw. „hab dich gehört“
  const chime: Mic['chime'] = (kind) => {
    if (closed) return Promise.resolve();
    playSound(kind === 'listen' ? 'check' : 'tick');
    return new Promise((resolve) => setTimeout(resolve, 300));
  };

  const close = () => {
    if (closed) return;
    closed = true;
    current?.cancel();
    releaseAudio();
  };

  return { mic: { record, chime, close } };
}
