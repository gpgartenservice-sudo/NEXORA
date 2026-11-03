import * as Clipboard from 'expo-clipboard';

/** Text in die Zwischenablage (Handy-App). Mac/Browser: copy-text.ts */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
