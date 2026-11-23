/**
 * Welche Links die Mac-App nach außen geben darf (shell.openExternal).
 * Nur Webseiten, E-Mail, Telefon und Kalender-Abos – nie file:, smb:,
 * javascript: oder eigene Schemata anderer Programme (die könnten Dateien
 * öffnen oder Programme starten).
 *
 * Ohne Electron, damit es sich testen lässt (tests/unit/desktop-external-url.test.mjs).
 */
const ALLOWED_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  // „In Apple Kalender öffnen“ (Termine › Kalender verbinden): öffnet nur das Abo-Fenster im Kalender
  'webcal:',
]);

/** Darf dieser Link im Standard-Programm des Mac geöffnet werden? */
function isSafeExternalUrl(url) {
  if (typeof url !== 'string' || !url || url.length > 65536) return false;
  // keine Leer- und Steuerzeichen am Rand/im Link (new URL würde sie still entfernen)
  if (url.trim() !== url) return false;
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
  // Webseiten und Kalender-Abos brauchen eine Adresse (keine „https:///…“-Tricks)
  if ((parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'webcal:') && !parsed.hostname) {
    return false;
  }
  return true;
}

module.exports = { ALLOWED_PROTOCOLS, isSafeExternalUrl };
