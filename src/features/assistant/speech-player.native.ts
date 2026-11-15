/**
 * Lunas Stimme abspielen – iPhone/Android. Die MP3 von ElevenLabs wird kurz im
 * App-Zwischenspeicher abgelegt, abgespielt und danach gleich wieder gelöscht.
 * Mac/Browser: speech-player.ts.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import type { Playback, PlayEvents } from './speech-player';

export type { Playback, PlayEvents } from './speech-player';

export function canPlaySpeech(): boolean {
  return true;
}

// Auch bei stummgeschaltetem iPhone hörbar; andere Musik wird kurz leiser statt gestoppt
let mode: Promise<void> | null = null;
function ensureAudioMode(): Promise<void> {
  mode ??= setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers', allowsRecording: false }).catch(
    () => {
      mode = null;
    },
  );
  return mode;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let counter = 0;

export function playSpeechAudio(blob: Blob, rate: number, events: PlayEvents): Playback {
  let over = false;
  let player: AudioPlayer | null = null;
  let file: File | null = null;
  let listener: { remove: () => void } | null = null;
  let playing = false;
  // Sicherheitsnetz: kommt kein Ton oder kein Ende, hängt Luna nicht ewig
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const watch = (ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => end(playing), ms);
  };

  const cleanup = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    listener?.remove();
    listener = null;
    try {
      player?.pause();
      player?.remove();
    } catch {
      // schon freigegeben
    }
    player = null;
    try {
      if (file?.exists) file.delete();
    } catch {
      // Zwischenspeicher räumt iOS selbst auf
    }
    file = null;
  };
  const end = (ok: boolean) => {
    if (over) return;
    over = true;
    cleanup();
    events.onEnd(ok);
  };

  void (async () => {
    try {
      await ensureAudioMode();
      const data = await blobToBase64(blob);
      if (over) return;
      const dir = new Directory(Paths.cache, 'luna-stimme');
      dir.create({ intermediates: true, idempotent: true });
      const target = new File(dir, `luna-${Date.now()}-${counter++}.mp3`);
      file = target;
      target.create({ overwrite: true });
      await target.write(data, { encoding: 'base64' });
      if (over) return cleanup();

      const p = createAudioPlayer({ uri: target.uri }, { updateInterval: 100 });
      player = p;
      p.shouldCorrectPitch = true;
      p.setPlaybackRate(rate, 'high');
      listener = p.addListener('playbackStatusUpdate', (status) => {
        if (status.playing && !playing) {
          playing = true;
          events.onPlaying();
        }
        if (playing && status.duration > 0 && !over)
          watch(((status.duration - status.currentTime) / Math.max(rate, 0.5)) * 1000 + 2500);
        if (status.didJustFinish) end(true);
      });
      watch(10000);
      p.play();
    } catch {
      end(false);
    }
  })();

  return { stop: () => end(true) };
}
