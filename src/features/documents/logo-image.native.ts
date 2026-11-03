/**
 * Logo in der Handy-App (iPhone/Android): Bild aus den Fotos wählen und auf
 * höchstens 800 × 480 px verkleinern (PNG behält Transparenz, Fotos als JPG).
 * Mac/Browser (mit Abschneiden leerer Ränder): logo-image.ts.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { fitWithin, MAX_LOGO_BASE64, type LogoImage } from './logo-logic';

export const logoUploadSupported = true;

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const OUT_W = 800;
const OUT_H = 480;

/** Ausgewähltes Bild */
export type PickedImage = { uri: string; mime: string; size: number | null };

class LogoError extends Error {}

/** Fotos öffnen. null = abgebrochen. */
export async function pickImageFile(): Promise<PickedImage | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const a = r.canceled ? null : r.assets[0];
  return a ? { uri: a.uri, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null } : null;
}

/** Bild in ein speicherfertiges Logo umwandeln. Fehler kommen als verständlicher Text. */
export async function processLogo(file: PickedImage): Promise<LogoImage> {
  if ((file.size ?? 0) > MAX_FILE_BYTES) throw new LogoError('Das Bild ist zu groß (höchstens 15 MB).');
  let original;
  try {
    original = await ImageManipulator.manipulate(file.uri).renderAsync();
  } catch {
    throw new LogoError('Dieses Bild kann ich nicht lesen. Bitte nimm ein PNG oder JPG.');
  }
  if (!original.width || !original.height) throw new LogoError('Dieses Bild hat keine Größe.');
  // PNG (oft mit transparentem Hintergrund) bleibt PNG; Fotos werden JPG
  const png = file.mime.toLowerCase() === 'image/png';
  for (const factor of [1, 0.75, 0.5, 0.35]) {
    const out = fitWithin(original.width, original.height, OUT_W * factor, OUT_H * factor);
    const ref = await ImageManipulator.manipulate(file.uri)
      .resize({ width: out.width, height: out.height })
      .renderAsync();
    const saved = await ref.saveAsync({ format: png ? SaveFormat.PNG : SaveFormat.JPEG, compress: 0.9, base64: true });
    if (saved.base64 && saved.base64.length <= MAX_LOGO_BASE64) {
      return { mime: png ? 'image/png' : 'image/jpeg', data: saved.base64, width: saved.width, height: saved.height };
    }
  }
  throw new LogoError('Das Bild ist zu detailreich. Bitte nimm eine einfachere Version deines Logos.');
}

/** Fehlertext für die Anzeige */
export function logoErrorText(e: unknown): string {
  if (e instanceof LogoError) return e.message;
  console.warn('[Logo]', e);
  return `Das Logo konnte nicht verarbeitet werden.\n\nTechnische Details: ${String(e)}`;
}
