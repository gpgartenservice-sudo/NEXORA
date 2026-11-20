import type { Mic } from './voice';

/**
 * Mikrofon auf dem Handy (native-mic.native.ts). Im Web/Mac gibt es das nicht –
 * dort läuft die Aufnahme über die Web-APIs in voice.ts.
 */
export function nativeMicSupported(): boolean {
  return false;
}

export async function openNativeMic(): Promise<{ mic?: Mic; error?: string }> {
  return { error: 'Sprache wird hier leider nicht unterstützt.' };
}
