/**
 * Dateien speichern – Handy (iPhone/Android): Die Datei wird kurz im
 * App-Zwischenspeicher abgelegt und das Teilen-Menü geht auf („In Dateien
 * sichern“, Mail, WhatsApp, AirDrop …). Mac/Browser: files.ts.
 */
import { fetch } from 'expo/fetch';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const savesViaShareSheet = true;

/** iOS-Dateityp, damit Empfänger-Apps die Datei richtig erkennen */
const UTI: Record<string, string> = {
  'application/pdf': 'com.adobe.pdf',
  'application/zip': 'public.zip-archive',
  'text/csv': 'public.comma-separated-values-text',
  'text/calendar': 'public.calendar-event',
};

/** Datei im Zwischenspeicher ablegen -> Adresse (file://…) */
export async function writeTempFile(data: Uint8Array | string, fileName: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'nexora-dateien');
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, fileName.replace(/[/\\:]/g, '_'));
  if (file.exists) file.delete();
  file.create();
  await file.write(data);
  return file.uri;
}

/** Datei speichern bzw. weitergeben über das Teilen-Menü des Handys */
export async function saveFile(data: Uint8Array | string, fileName: string, mime: string): Promise<void> {
  const uri = await writeTempFile(data, fileName);
  const base = mime.split(';')[0].trim();
  await Sharing.shareAsync(uri, { mimeType: base, UTI: UTI[base], dialogTitle: fileName });
}

/** Inhalt einer Adresse als Bytes (z. B. Beleg aus dem Speicher) */
export async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}
