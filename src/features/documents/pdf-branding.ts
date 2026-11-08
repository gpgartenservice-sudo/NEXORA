/**
 * Hinweis „Erstellt mit Lunaxora“ unten auf PDFs (Starter-Abo). Eigene kleine
 * Datei, damit die App den Schalter setzen kann, ohne die PDF-Bibliothek zu laden.
 */
let branding = false;

export function setPdfBranding(on: boolean) {
  branding = on;
}

export function pdfBranding(): boolean {
  return branding;
}

export const BRANDING_TEXT = 'Erstellt mit Lunaxora – der App für junge Selbstständige';
