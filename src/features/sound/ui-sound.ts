import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect, useState } from 'react';

import { audioReady } from './audio-session';

/**
 * Kurze App-Töne (selbst gebaut: scripts/build-sounds.mjs). Abschaltbar unter
 * Profil → Töne; die Einstellung gilt pro Gerät.
 *   tick    – Klick (Buttons, Karten, Menü), Umschalter, Auswahl
 *   check   – Häkchen gesetzt (To-do, Fahrplan-Schritt)
 *   done    – Luna hat etwas erledigt
 *   money   – neue Einnahme
 *   success – Phase/Fahrplan geschafft
 */
export type UiSound = 'tick' | 'check' | 'done' | 'money' | 'success';

const FILES: Record<UiSound, number> = {
  tick: require('@/assets/sounds/tick.wav'),
  check: require('@/assets/sounds/check.wav'),
  done: require('@/assets/sounds/done.wav'),
  money: require('@/assets/sounds/money.wav'),
  success: require('@/assets/sounds/success.wav'),
};
const VOLUME: Record<UiSound, number> = { tick: 0.45, check: 0.7, done: 0.8, money: 0.9, success: 0.9 };

const KEY = 'nexora.sounds.v1';
let enabled = true;
const listeners = new Set<(on: boolean) => void>();
void AsyncStorage.getItem(KEY)
  .then((v) => {
    enabled = v !== 'off';
    listeners.forEach((l) => l(enabled));
  })
  .catch(() => {});

const players = new Map<UiSound, AudioPlayer>();
const lastPlayed = new Map<UiSound, number>();

function player(name: UiSound): AudioPlayer | null {
  let p = players.get(name);
  if (!p) {
    try {
      p = createAudioPlayer(FILES[name]);
      p.volume = VOLUME[name];
      players.set(name, p);
    } catch {
      return null;
    }
  }
  return p;
}

/** Töne vorladen, damit der erste nicht verzögert kommt */
export function preloadSounds() {
  // gleich zu Beginn: Klick-Töne mischen sich mit Musik anderer Apps, statt sie leiser zu machen
  void audioReady();
  (Object.keys(FILES) as UiSound[]).forEach((n) => player(n));
}

export function playSound(name: UiSound) {
  if (!enabled) return;
  // derselbe Ton mehrmals in kurzer Folge klingt kaputt
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < 60) return;
  lastPlayed.set(name, now);
  const p = player(name);
  if (!p) return;
  try {
    void audioReady()
      .then(() => p.seekTo(0))
      .then(() => p.play())
      .catch(() => {});
  } catch {
    // ohne Ton weiter
  }
}

export function soundsEnabled() {
  return enabled;
}

/** Schalter „Töne“ (pro Gerät gespeichert) */
export function useSoundSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  const set = (next: boolean) => {
    enabled = next;
    listeners.forEach((l) => l(next));
    AsyncStorage.setItem(KEY, next ? 'on' : 'off').catch(() => {});
    if (next) playSound('tick');
  };
  return [on, set];
}
