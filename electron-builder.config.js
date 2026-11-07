/**
 * Mac-App als .dmg (npm run mac:dmg) – Ergebnis im Ordner release/.
 *
 * Verpackt wird nur .mac-app/ (desktop/ + dist/, siehe scripts/mac-app.mjs).
 *
 * Signatur: ohne Apple-Entwickler-Zertifikat wird die App nur „ad hoc“
 * signiert. Auf dem eigenen Mac startet sie ganz normal. Auf anderen Macs
 * meldet macOS beim ersten Öffnen „nicht verifizierter Entwickler“ – dann
 * Rechtsklick auf NEXORA › Öffnen (bzw. Systemeinstellungen › Datenschutz &
 * Sicherheit › „Trotzdem öffnen“). Für eine Weitergabe ohne diese Meldung
 * braucht es eine Apple Developer ID und Notarisierung.
 */
module.exports = {
  appId: 'de.nexoranexy.app',
  productName: 'NEXORA',
  copyright: 'NEXORA',
  directories: { app: '.mac-app', output: 'release' },
  files: ['**/*'],
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
      NSMicrophoneUsageDescription: 'NEXORA braucht das Mikrofon, damit du mit Nexy sprechen kannst.',
      NSAppleEventsUsageDescription:
        'NEXORA bereitet E-Mails mit Angeboten und Rechnungen in Apple Mail vor – mit dem PDF im Anhang.',
    },
  },
  dmg: {
    title: 'NEXORA',
    artifactName: 'NEXORA-${version}-${arch}.dmg',
  },
};
