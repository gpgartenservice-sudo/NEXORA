import { desktop } from '@/lib/desktop';

import { downloadPdf, type PreparedPdf } from './save-pdf';

/**
 * Verschicken von Angeboten und Rechnungen – "von Hand": Die App öffnet
 * E-Mail bzw. WhatsApp mit fertigem Text und legt das PDF bereit.
 *
 * Mac-Fenster: Über desktop/preload.js speichert die App das PDF in
 * Downloads/NEXORA und zeigt es im Finder (zum Reinziehen), "Teilen …"
 * öffnet das Teilen-Menü des Mac mit dem PDF als Anhang.
 * Browser: Das PDF wird heruntergeladen.
 */

/** Läuft die App im Mac-Fenster? */
export function isDesktop(): boolean {
  return !!desktop();
}

function asFile(pdf: PreparedPdf): File {
  return new File([pdf.bytes as BlobPart], pdf.fileName, { type: 'application/pdf' });
}

/** Gibt es ein Teilen-Menü, das das PDF direkt anhängt? (Mac-Fenster oder Browser mit Web Share) */
export function canShareFile(pdf: PreparedPdf): boolean {
  const d = desktop();
  if (d) return d.canShare;
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [asFile(pdf)] });
  } catch {
    return false;
  }
}

export type Delivery = { error?: string; pdf?: 'finder' | 'download'; message?: string };

const failed = (e: unknown): Delivery => {
  console.warn('[Verschicken]', e);
  return { error: `Das hat nicht geklappt.\n\nTechnische Details: ${String(e)}` };
};

/**
 * E-Mail-Programm (mailto:) bzw. WhatsApp (https://wa.me/…) öffnen und das
 * PDF zum Anhängen bereitlegen.
 *
 * Wichtig im Browser: bis zum Öffnen kein await, sonst blockiert der
 * Browser das neue Fenster.
 */
export async function openWith(pdf: PreparedPdf, url: string): Promise<Delivery> {
  const d = desktop();
  if (d) {
    try {
      await d.sendFile({ bytes: pdf.bytes, fileName: pdf.fileName, via: 'open', url });
      return { pdf: 'finder' };
    } catch (e) {
      return failed(e);
    }
  }
  try {
    downloadPdf(pdf);
    // Link "anklicken": mailto: öffnet das Mail-Programm, WhatsApp einen neuen Tab
    const a = document.createElement('a');
    a.href = url;
    if (!url.startsWith('mailto:')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { pdf: 'download' };
  } catch (e) {
    return failed(e);
  }
}

/** Teilen-Menü mit dem PDF als Anhang (Mail, Nachrichten, AirDrop, WhatsApp …). */
export async function shareFile(pdf: PreparedPdf, text: string, title: string): Promise<Delivery> {
  const d = desktop();
  try {
    if (d) {
      await d.sendFile({ bytes: pdf.bytes, fileName: pdf.fileName, via: 'share', text });
      return {};
    }
    await navigator.share({ files: [asFile(pdf)], title, text });
    return {};
  } catch (e) {
    // Teilen abgebrochen ist kein Fehler
    if (e instanceof Error && e.name === 'AbortError') return {};
    return failed(e);
  }
}
