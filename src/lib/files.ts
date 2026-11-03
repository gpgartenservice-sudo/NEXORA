/**
 * Dateien speichern – Mac/Browser: als Download (im Mac-Fenster mit
 * Speichern-Dialog). Die Handy-Version (Teilen-Menü: „In Dateien sichern“,
 * Mail, WhatsApp …) steht in files.native.ts – Metro nimmt automatisch die
 * passende Datei.
 */

/** true = „Speichern“ öffnet das Teilen-Menü (Handy) */
export const savesViaShareSheet = false;

/** Datei speichern (PDF, ZIP, CSV, Kalender …) */
export async function saveFile(data: Uint8Array | string, fileName: string, mime: string): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Inhalt einer Adresse als Bytes (z. B. Beleg aus dem Speicher) */
export async function fetchBytes(url: string): Promise<Uint8Array | null> {
  const res = await fetch(url).catch(() => null);
  if (!res || !res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}
