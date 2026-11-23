import type { PreparedVaultFile } from './vault-api';
import { vaultUrl } from './vault-api';
import { kindExt, MAX_VAULT_BYTES, VAULT_MIMES, VAULT_TOO_BIG, VAULT_UNSUPPORTED, VaultError, vaultKind } from './vault-logic';

/**
 * Dokumente auswählen und vorbereiten – Mac/Browser (auch Handy-Browser mit Kamera).
 * Fotos werden verkleinert (Text bleibt gut lesbar), alles andere bleibt, wie es ist.
 * Handy-App: vault-file.native.ts.
 */

export const vaultSupported = typeof document !== 'undefined';

/** Ausgewählte Datei (Browser: File) */
export type PickedVaultFile = File;

const MAX_SIDE = 2400;
const JPEG_QUALITY = 0.85;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.pfx,.p12,.docx,.xlsx,application/pdf,image/*,application/x-pkcs12';

/** Dateiauswahl öffnen; `camera`: am Handy direkt die Kamera. null = abgebrochen. */
export function pickVaultFile(camera = false): Promise<PickedVaultFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = camera ? 'image/*' : ACCEPT;
    if (camera) input.setAttribute('capture', 'environment');
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

async function shrinkImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = new Image();
    img.src = url;
    await img.decode();
  } catch {
    throw new VaultError('Dieses Bild kann ich nicht öffnen. Bitte als JPG, PNG oder PDF speichern.');
  } finally {
    URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new VaultError('Dein Gerät kann das Bild gerade nicht bearbeiten.');
  ctx.fillStyle = '#ffffff'; // transparente PNGs: weißer Hintergrund
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new VaultError('Das Bild konnte nicht verarbeitet werden.');
  return blob;
}

/** Datei prüfen und fürs Hochladen vorbereiten */
export async function prepareVaultFile(file: PickedVaultFile): Promise<PreparedVaultFile> {
  const kind = vaultKind(file.name, file.type);
  if (!kind) throw new VaultError(VAULT_UNSUPPORTED);
  if (kind === 'image') {
    if (file.size > 40 * 1024 * 1024) throw new VaultError('Das Bild ist zu groß (höchstens 40 MB).');
    const blob = await shrinkImage(file);
    if (blob.size > MAX_VAULT_BYTES) throw new VaultError(VAULT_TOO_BIG);
    return { body: blob, ext: 'jpg', mime: 'image/jpeg', size: blob.size, name: file.name, previewUrl: URL.createObjectURL(blob) };
  }
  if (file.size > MAX_VAULT_BYTES) throw new VaultError(VAULT_TOO_BIG);
  if (file.size === 0) throw new VaultError('Die Datei ist leer.');
  const ext = kindExt(kind);
  return { body: file, ext, mime: VAULT_MIMES[ext], size: file.size, name: file.name, previewUrl: null };
}

/** PDF/Foto in neuem Tab bzw. Fenster ansehen */
export async function viewVaultFile(path: string): Promise<string | null> {
  const { url, error } = await vaultUrl(path);
  if (!url) return error ?? 'Das Dokument konnte nicht geöffnet werden.';
  window.open(url, '_blank', 'noopener');
  return null;
}
