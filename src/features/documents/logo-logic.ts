/**
 * Rechenhilfen fürs Firmenlogo: Größe einpassen, leere Ränder finden,
 * Bildtyp erkennen.
 *
 * Bewusst ohne Imports, damit die Funktionen einzeln getestet werden können
 * (tests/unit/logo-logic.test.mjs).
 */

/** Ein Logo, wie es gespeichert wird (Tabelle business_logos). */
export type LogoImage = {
  mime: 'image/png' | 'image/jpeg';
  /** Bilddaten als Base64 (ohne "data:"-Vorspann) */
  data: string;
  width: number;
  height: number;
};

export type Size = { width: number; height: number };
export type Box = { x: number; y: number; width: number; height: number };

/** Verkleinert proportional auf höchstens maxW × maxH (vergrößert nie). */
export function fitWithin(width: number, height: number, maxW: number, maxH: number): Size {
  const scale = Math.min(1, maxW / width, maxH / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Passt proportional in maxW × maxH ein (auch größer) – fürs Logo im PDF. */
export function fitInto(width: number, height: number, maxW: number, maxH: number): Size {
  const scale = Math.min(maxW / width, maxH / height);
  return { width: width * scale, height: height * scale };
}

const ALPHA_EMPTY = 16; // fast durchsichtig
const WHITE = 245; // fast weiß

/**
 * Bereich mit dem eigentlichen Logo – ohne leere Ränder.
 * Durchsichtige Ecken: durchsichtige Ränder weg. Weiße Ecken: weiße Ränder
 * weg. Sonst bleibt das Bild, wie es ist. null = Bild ist komplett leer.
 *
 * pixels: RGBA-Werte, Zeile für Zeile (wie bei canvas.getImageData).
 */
export function contentBox(pixels: ArrayLike<number>, width: number, height: number): Box | null {
  const at = (x: number, y: number) => (y * width + x) * 4;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const transparent = corners.some((i) => pixels[i + 3] < ALPHA_EMPTY);
  const white = !transparent && corners.every((i) => pixels[i] >= WHITE && pixels[i + 1] >= WHITE && pixels[i + 2] >= WHITE);

  const isEmpty = (i: number) => {
    if (pixels[i + 3] < ALPHA_EMPTY) return true;
    return white && pixels[i] >= WHITE && pixels[i + 1] >= WHITE && pixels[i + 2] >= WHITE;
  };
  if (!transparent && !white) return { x: 0, y: 0, width, height };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isEmpty(at(x, y))) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Hat das Bild durchsichtige Stellen? (Dann als PNG speichern) */
export function hasTransparency(pixels: ArrayLike<number>): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 255) return true;
  return false;
}

/** PNG oder JPG anhand der ersten Bytes erkennen. */
export function imageType(bytes: ArrayLike<number>): LogoImage['mime'] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** Base64 -> Bytes */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Größte erlaubte Länge der Base64-Daten (wie in der Datenbank) */
export const MAX_LOGO_BASE64 = 700_000;
