# NEXORA

Die App für junge Unternehmer – von der Motivation bis zur kompletten Verwaltung des eigenen Unternehmens.

Eine Codebasis für **Mac, iPhone und Android** (Expo / React Native). Die Mac-Version ist die Web-Version der App in einem eigenen Fenster (Electron).

▶️ [Video: Vorschau der Start-Animation](docs/media/intro-preview.mp4)

---

## Auf dem Mac testen

### Einmalig: Vorbereitung

1. **Node.js installieren:** auf [nodejs.org](https://nodejs.org) die **LTS**-Version herunterladen und installieren.
2. **GitHub Desktop installieren:** [desktop.github.com](https://desktop.github.com), mit dem GitHub-Konto anmelden (das Repository ist privat, deshalb braucht es den Login).
3. In GitHub Desktop: **File → Clone Repository** → `gpgartenservice-sudo/NEXORA` auswählen → **Clone**.
4. Oben bei **Current Branch** den Branch `claude/bold-planck-2y07zy` auswählen.
5. **Repository → Open in Terminal** (öffnet das Terminal direkt im Projektordner).
6. Abhängigkeiten installieren (dauert beim ersten Mal 1–3 Minuten):

   ```bash
   npm install
   ```

### App starten

```bash
npm run mac
```

Das baut die App und öffnet sie in einem eigenen Mac-Fenster.

- **Intro überspringen:** irgendwo hinklicken oder `Esc` / `Enter` drücken.
- **Intro nochmal sehen:** `Cmd + R` (lädt das Fenster neu).
- Ist bei „Bewegung reduzieren“ in den macOS-Bedienungshilfen ein Haken gesetzt, wird das Intro übersprungen.

### Neuen Stand holen

In GitHub Desktop auf **Fetch origin** bzw. **Pull origin** klicken, dann im Terminal:

```bash
npm install
```

```bash
npm run mac
```

### Alternativ: im Browser

```bash
npm run web
```

Öffnet die App im Browser und lädt bei jeder Code-Änderung automatisch neu. Mit diesem Server läuft auch das Mac-Fenster im Live-Modus: in einem zweiten Terminal-Fenster `npm run mac:dev`.

### Auf dem iPhone (optional)

```bash
npm start
```

Den angezeigten QR-Code mit der Kamera scannen und in der App **Expo Go** öffnen (vorher aus dem App Store laden; iPhone und Mac müssen im selben WLAN sein).

---

## Projektstruktur

| Ordner / Datei | Inhalt |
|---|---|
| `src/app/` | Bildschirme (jede Datei = ein Screen, Expo Router) |
| `src/app/index.tsx` | Start: Intro-Animation → Anmelde-Screen |
| `src/components/intro/` | Die Start-Animation |
| `src/components/intro/timeline.ts` | **Ablauf & Zeiten der Animation** – hier wird feinjustiert |
| `src/components/auth/` | Anmeldeformular und Eingabefelder |
| `src/components/brand/` | Schriftzug aus Einzelbuchstaben |
| `src/constants/theme.ts` | Farben, Abstände, Rundungen |
| `assets/brand/` | Original-Logodateien |
| `assets/images/logo/` | Einzelbuchstaben (erzeugt von `tools/build-logo-letters.py`) |
| `assets/images/icon.png` | App-Icon (flach, quadratisch – die Rundung macht das System) |
| `desktop/main.js` | Mac-Fenster (Electron) |

## Stand

- ✅ Start-Animation (N erscheint, gleitet nach links, Buchstaben fallen von oben, Schriftzug fliegt in den Anmelde-Screen)
- ✅ Anmelde-Screen (Oberfläche mit Eingabeprüfung)
- ⏳ Echte Anmeldung & Registrierung (Supabase)
- ⏳ Akzentfarbe festlegen
- ⏳ Logo als SVG

> Die Bundle-ID `de.nexora.app` in `app.json` ist ein Platzhalter und muss vor der ersten Veröffentlichung im App Store auf eine eigene Domain angepasst werden.

## Für Entwickler

```bash
npm run typecheck
```

```bash
npm run lint
```
