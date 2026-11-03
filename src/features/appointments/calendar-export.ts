import { Linking, Platform } from 'react-native';

import { desktop } from '@/lib/desktop';

import { googleCalendarUrl, icsFileName, toIcs, type CalendarEvent } from './appointment-logic';

/** Gibt es hier die Möglichkeit, eine Kalender-Datei zu öffnen/speichern? (Mac-App, Browser) */
export const calendarFileSupported = Platform.OS === 'web';

/**
 * Termin in den Kalender: Mac-App -> Kalender des Mac öffnet sich mit dem Termin,
 * Browser -> .ics-Datei wird heruntergeladen (Doppelklick übernimmt sie).
 */
export async function addToCalendar(event: CalendarEvent): Promise<{ error?: string; opened?: boolean }> {
  const text = toIcs([event]);
  const fileName = icsFileName(event);
  const bridge = desktop();
  if (bridge?.openCalendarFile) {
    try {
      await bridge.openCalendarFile({ text, fileName });
      return { opened: true };
    } catch (e) {
      return { error: `Der Kalender ließ sich nicht öffnen.\n\nTechnische Details: ${String(e)}` };
    }
  }
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return { error: 'Das geht im Moment in der Mac-App oder im Browser.' };
  }
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return {};
}

export function openGoogleCalendar(event: CalendarEvent) {
  void Linking.openURL(googleCalendarUrl(event));
}

export function openLink(url: string) {
  void Linking.openURL(url);
}
