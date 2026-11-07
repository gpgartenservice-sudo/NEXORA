import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';

import { copyText } from '@/features/social/copy-text';

/**
 * Absturz-Rekorder fürs Handy: Ein Fehler, der sonst die App schließen
 * würde, wird mit Text gespeichert. In der fertigen App bleibt sie offen
 * und zeigt einen Hinweis; beim nächsten Start lässt sich der Fehlertext
 * kopieren und weitergeben. Im Browser/auf dem Mac nicht nötig.
 */
const KEY = 'nexora.lastCrash';

type Crash = { at: string; text: string };

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = (error.stack ?? '').split('\n').slice(0, 8).join('\n');
    return `${error.name}: ${error.message}${stack ? `\n${stack}` : ''}`;
  }
  return String(error);
}

let installed = false;

/** Einmal beim Start aufrufen */
export function installCrashLog() {
  if (installed || Platform.OS === 'web' || typeof ErrorUtils === 'undefined') return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    const crash: Crash = { at: new Date().toISOString(), text: describeError(error) };
    if (isFatal) AsyncStorage.setItem(KEY, JSON.stringify(crash)).catch(() => {});
    // Expo Go / Entwicklung: die rote Fehleranzeige mit allen Details
    if (__DEV__ || !isFatal) return previous(error, isFatal);
    // fertige App: nicht schließen, sondern Bescheid geben
    Alert.alert('Da ist etwas schiefgelaufen', crash.text.slice(0, 500), [
      { text: 'Fehlertext kopieren', onPress: () => void copyText(crash.text) },
      { text: 'OK' },
    ]);
  });
}

/** Beim Start: gab es beim letzten Mal einen Absturz? Dann einmal zeigen. */
export async function showLastCrash() {
  if (Platform.OS === 'web') return;
  let crash: Crash | null = null;
  try {
    crash = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null') as Crash | null;
    if (crash) await AsyncStorage.removeItem(KEY);
  } catch {
    return;
  }
  if (!crash?.text) return;
  const when = new Date(crash.at).toLocaleString('de-DE');
  Alert.alert(
    'Lunaxora ist zuletzt abgestürzt',
    `Am ${when}. Schick den Fehlertext bitte weiter – dann lässt sich das beheben.\n\n${crash.text.slice(0, 400)}`,
    [{ text: 'Fehlertext kopieren', onPress: () => void copyText(`${when}\n${crash.text}`) }, { text: 'OK' }],
  );
}
