import { Linking } from 'react-native';

import { desktop } from '@/lib/desktop';
import { saveFile } from '@/lib/files';

import { googleCalendarUrl, icsFileName, toIcs, type CalendarEvent } from './appointment-logic';

/** Gibt es hier die Möglichkeit, eine Kalender-Datei zu öffnen/speichern? (Mac-App, Browser, Handy) */
export const calendarFileSupported = true;

/**
 * Termin in den Kalender: Mac-App -> Kalender des Mac öffnet sich mit dem Termin,
 * Browser -> .ics-Datei wird heruntergeladen (Doppelklick übernimmt sie),
 * Handy -> Teilen-Menü mit der Kalender-Datei (z. B. „In Kalender öffnen“).
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
  try {
    await saveFile(text, fileName, 'text/calendar;charset=utf-8');
    return {};
  } catch (e) {
    return { error: `Die Kalender-Datei ließ sich nicht öffnen.\n\nTechnische Details: ${String(e)}` };
  }
}

export function openGoogleCalendar(event: CalendarEvent) {
  void Linking.openURL(googleCalendarUrl(event));
}

export function openLink(url: string) {
  void Linking.openURL(url);
}
