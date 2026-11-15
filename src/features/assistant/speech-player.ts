/**
 * Lunas Stimme abspielen – Mac-Fenster und Browser (HTML-Audio).
 * iPhone/Android: speech-player.native.ts.
 */

export type PlayEvents = {
  /** Ton ist zu hören */
  onPlaying: () => void;
  /** vorbei – false = ließ sich nicht abspielen */
  onEnd: (ok: boolean) => void;
};

export type Playback = { stop: () => void };

/** Kann hier abgespielt werden? */
export function canPlaySpeech(): boolean {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

/** Eine fertige Aufnahme (MP3) im gewünschten Tempo abspielen – die Tonhöhe bleibt gleich */
export function playSpeechAudio(blob: Blob, rate: number, events: PlayEvents): Playback {
  const url = URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
  const el = new Audio(url);
  el.preservesPitch = true;
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
  let over = false;
  const end = (ok: boolean) => {
    if (over) return;
    over = true;
    el.onended = null;
    el.onerror = null;
    el.onplaying = null;
    URL.revokeObjectURL(url);
    events.onEnd(ok);
  };
  el.onplaying = () => events.onPlaying();
  el.onended = () => end(true);
  el.onerror = () => end(false);
  el.play().catch(() => end(false));
  return {
    stop: () => {
      el.pause();
      end(true);
    },
  };
}
