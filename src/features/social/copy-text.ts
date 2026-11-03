import { Platform } from 'react-native';

/** Text in die Zwischenablage (Mac/Browser). Handy-App: copy-text.native.ts */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
