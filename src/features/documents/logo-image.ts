import { Platform } from 'react-native';

import { contentBox, fitWithin, hasTransparency, MAX_LOGO_BASE64, type LogoImage } from './logo-logic';

/**
 * Logo auswählen und fürs Speichern vorbereiten (Mac/Browser):
 * Bild laden -> leere Ränder abschneiden -> auf höchstens 800 × 480 px
 * verkleinern -> als PNG (oder JPG bei Fotos ohne Transparenz).
 */

export const logoUploadSupported = Platform.OS === 'web' && typeof document !== 'undefined';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const WORK_SIZE = 1600; // Arbeitsgröße (SVGs werden scharf in dieser Größe gezeichnet)
const OUT_W = 800;
const OUT_H = 480;

/** Ausgewähltes Bild (Browser: File; Handy-App: logo-image.native.ts) */
export type PickedImage = File;

/** Öffnet die Dateiauswahl. null = abgebrochen. */
export function pickImageFile(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.style.display = 'none';
    const done = (file: File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.appendChild(input);
    input.click();
  });
}

class LogoError extends Error {}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new LogoError('Dieses Bild kann ich nicht lesen. Bitte nimm eine PNG- oder JPG-Datei.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new LogoError('Dein Gerät kann das Bild gerade nicht bearbeiten.');
  return { c, ctx };
}

function encode(c: HTMLCanvasElement, mime: LogoImage['mime']): string {
  return c.toDataURL(mime, 0.9).replace(/^data:[^,]+,/, '');
}

/** Bild in ein speicherfertiges Logo umwandeln. Fehler kommen als verständlicher Text. */
export async function processLogo(file: PickedImage): Promise<LogoImage> {
  if (file.size > MAX_FILE_BYTES) throw new LogoError('Das Bild ist zu groß (höchstens 15 MB).');
  const img = await loadImage(file);
  const isSvg = file.type === 'image/svg+xml';
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new LogoError('Dieses Bild hat keine Größe. Bitte speichere es als PNG oder JPG.');
  }

  // 1. In Arbeitsgröße zeichnen (SVG: hochskalieren, damit es scharf bleibt)
  const work = isSvg
    ? (() => {
        const s = WORK_SIZE / Math.max(img.naturalWidth, img.naturalHeight);
        return { width: Math.round(img.naturalWidth * s), height: Math.round(img.naturalHeight * s) };
      })()
    : fitWithin(img.naturalWidth, img.naturalHeight, WORK_SIZE, WORK_SIZE);
  const a = canvas(work.width, work.height);
  a.ctx.drawImage(img, 0, 0, work.width, work.height);
  const pixels = a.ctx.getImageData(0, 0, work.width, work.height).data;

  // 2. Leere Ränder weg
  const box = contentBox(pixels, work.width, work.height);
  if (!box) throw new LogoError('Auf dem Bild ist nichts zu sehen.');
  const transparent = hasTransparency(pixels);

  // 3. Verkleinern und speichern – notfalls kleiner, bis es passt
  for (const factor of [1, 0.75, 0.5, 0.35]) {
    const out = fitWithin(box.width, box.height, OUT_W * factor, OUT_H * factor);
    const b = canvas(out.width, out.height);
    b.ctx.imageSmoothingQuality = 'high';
    b.ctx.drawImage(a.c, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    let mime: LogoImage['mime'] = 'image/png';
    let data = encode(b.c, mime);
    if (data.length > MAX_LOGO_BASE64 && !transparent) {
      mime = 'image/jpeg';
      data = encode(b.c, mime);
    }
    if (data.length <= MAX_LOGO_BASE64) return { mime, data, width: out.width, height: out.height };
  }
  throw new LogoError('Das Bild ist zu detailreich. Bitte nimm eine einfachere Version deines Logos.');
}

/** Fehlertext für die Anzeige */
export function logoErrorText(e: unknown): string {
  if (e instanceof LogoError) return e.message;
  console.warn('[Logo]', e);
  return `Das Logo konnte nicht verarbeitet werden.\n\nTechnische Details: ${String(e)}`;
}
