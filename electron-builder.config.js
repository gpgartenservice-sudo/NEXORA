/**
 * Mac-App als .dmg (npm run mac:dmg) – Ergebnis im Ordner release/.
 *
 * Verpackt wird nur .mac-app/ (desktop/ + dist/, siehe scripts/mac-app.mjs).
 *
 * Signatur: ohne Apple-Entwickler-Zertifikat wird die App nur „ad hoc“
 * signiert. Auf dem eigenen Mac startet sie ganz normal. Auf anderen Macs
 * meldet macOS beim ersten Öffnen „nicht verifizierter Entwickler“ – dann
 * Rechtsklick auf Lunaxora › Öffnen (bzw. Systemeinstellungen › Datenschutz &
 * Sicherheit › „Trotzdem öffnen“). Für eine Weitergabe ohne diese Meldung
 * braucht es eine Apple Developer ID und Notarisierung.
 */
module.exports = {
  appId: 'de.lunaxora.app',
  productName: 'Lunaxora',
  copyright: 'Lunaxora',
  directories: { app: '.mac-app', output: 'release' },
  // electron-builder lässt jeden Ordner „node_modules“ weg – auch dist/assets/node_modules,
  // wo Bilder von Expo Router/React Navigation liegen (Zurück-Pfeil, Schließen …). Die zweite
  // Regel holt genau diesen Ordner wieder rein.
  files: ['**/*', 'dist/assets/node_modules/**/*'],
  asar: true,
  // desktop/main.js braucht nur Electron und Node selbst – keine node_modules.
  // Ohne das würde electron-builder alle Pakete des Projekts mit einpacken (~780 MB).
  beforeBuild: async () => false,
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }],
    category: 'public.app-category.business',
    icon: 'assets/images/icon.png',
    // ad hoc signieren (ohne Zertifikat) – nötig, damit die App auf Apple-Silicon-Macs startet
    identity: '-',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
    // Texte für die Nachfragen von macOS
    extendInfo: {
      NSMicrophoneUsageDescription: 'Lunaxora braucht das Mikrofon, damit du mit Luna sprechen kannst.',
      NSAppleEventsUsageDescription:
        'Lunaxora bereitet E-Mails mit Angeboten und Rechnungen in Apple Mail vor – mit dem PDF im Anhang.',
    },
  },
  dmg: {
    title: 'Lunaxora',
    artifactName: 'Lunaxora-${version}-${arch}.dmg',
  },
};
