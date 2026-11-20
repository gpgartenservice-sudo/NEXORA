/**
 * Lunas Stimme abspielen – iPhone/Android. Die MP3 von ElevenLabs wird kurz im
 * App-Zwischenspeicher abgelegt, abgespielt und danach gleich wieder gelöscht.
 * Mac/Browser: speech-player.ts.
 */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { audioReady, holdAudio } from '@/features/sound/audio-session';

import type { Playback, PlayEvents } from './speech-player';

export type { Playback, PlayEvents } from './speech-player';

export function canPlaySpeech(): boolean {
  return true;
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
  // Solange Luna spricht: auch bei stummgeschaltetem iPhone hörbar, andere Musik wird leiser
  // statt gestoppt. Danach gilt wieder die Einstellung für Klick-Töne (audio-session).
  const releaseAudio = holdAudio('voice');
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
    releaseAudio();
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
      await audioReady();
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
