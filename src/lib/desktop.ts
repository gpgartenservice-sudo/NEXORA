import { Platform } from 'react-native';

/**
 * Brücke zum Mac-Fenster (desktop/preload.js). Gibt es nur in der Mac-App –
 * im Browser und auf dem Handy ist sie nicht da.
 */
export type DesktopBridge = {
  canShare: boolean;
  sendFile: (payload: {
    bytes: Uint8Array;
    fileName: string;
    via: 'open' | 'share';
    url?: string;
    text?: string;
  }) => Promise<{ filePath: string }>;
  /** Mikrofon-Freigabe des Mac anfragen (ältere Versionen der Mac-App haben das nicht) */
  askMicrophone?: () => Promise<boolean>;
  /**
   * Anmeldung bei TikTok/Instagram in einem eigenen Fenster. Endet, sobald die
   * Anmeldeseite zu `callbackUrl` zurückleitet (url = komplette Rückleitung).
   */
  openAuthWindow?: (options: { url: string; callbackUrl: string }) => Promise<{ url?: string; cancelled?: boolean }>;
  /** Kalender-Datei (.ics) mit dem Kalender des Mac öffnen (Termin übernehmen) */
  openCalendarFile?: (payload: { text: string; fileName: string }) => Promise<{ filePath: string }>;
};

declare global {
  interface Window {
    nexoraDesktop?: DesktopBridge;
  }
}

export function desktop(): DesktopBridge | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.nexoraDesktop ?? null;
}
