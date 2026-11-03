# NEXORA

Die App für junge Unternehmer – von der Motivation bis zur kompletten Verwaltung des eigenen Unternehmens.

Eine Codebasis für **Mac, iPhone und Android** (Expo / React Native). Die Mac-Version ist die Web-Version der App in einem eigenen Fenster (Electron).

▶️ Videos: [Start-Animation](docs/media/intro-preview.mp4) · [Registrierung & Onboarding](docs/media/onboarding-preview.mp4) · [Fahrplan](docs/media/fahrplan-preview.mp4) · [Kunden & Aufträge](docs/media/kunden-auftraege-preview.mp4)

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

## Supabase

Einmalige Einrichtung (E-Mail-Vorlagen mit Code usw.): siehe [`supabase/README.md`](supabase/README.md).

## Projektstruktur

| Ordner / Datei | Inhalt |
|---|---|
| `src/app/` | Bildschirme (jede Datei = ein Screen, Expo Router) |
| `src/app/index.tsx` | Start: Intro-Animation → Anmelde-Screen |
| `src/app/register.tsx`, `verify.tsx`, `forgot-password.tsx`, `reset-password.tsx` | Registrierung, Code-Bestätigung, Passwort zurücksetzen |
| `src/app/(app)/` | Bereich nur für angemeldete Nutzer (`onboarding.tsx` + App-Rahmen in `(tabs)/`) |
| `src/app/(app)/(tabs)/` | Alle Bereiche mit Navigation: `home` (Dashboard), `fahrplan`, `kunden`, `auftraege`, `firma`, `finanzen`, `social`, … |
| `src/features/navigation/` | Seitenleiste (Mac) / Tab-Leiste (Handy), Liste aller Bereiche |
| `src/features/roadmap/` | Gründer-Fahrplan: **Inhalte in `content.ts`**, Seite, Abhaken |
| `src/features/dashboard/` | Texte fürs Dashboard (Fokus je Phase, Impuls des Tages) |
| `src/features/crm/` | Kunden & Aufträge – **Status- und Umsatzlogik in `order-logic.ts`** |
| `src/features/assistant/` | Assistent – **Vorschläge prüfen und Kunden zuordnen in `assistant-logic.ts`** |
| `supabase/functions/assistant/` | Server-Funktion des Assistenten (Claude), läuft bei Supabase |
| `src/features/social/` | Social Media – **Status, Schritte, Hashtags, Zeichenlimits in `social-logic.ts`** |
| `src/features/finance/` | Finanzen – **Monatszuordnung von Einnahmen/Ausgaben in `finance-logic.ts`**, Diagramm, Einkommensnachweis |
| `src/features/documents/` | Bereich „Firma“, Angebote & Rechnungen – **Beträge und Versand-Texte in `document-logic.ts`, PDF-Layout in `pdf.ts`, Logo in `logo-image.ts`** |
| `tests/unit/` | Automatische Tests der Rechenlogik (`npm run test:unit`) |
| `src/features/onboarding/` | Onboarding: Fragen, Antwortmöglichkeiten, Abschluss-Animation |
| `src/components/motion/` | Animations-Bausteine (Wort-für-Wort-Titel, weiches Einblenden) |
| `src/providers/profile-provider.tsx` | Profil des Nutzers laden & speichern |
| `supabase/migrations/` | Datenbank-Skripte (im Supabase SQL Editor ausführen) |
| `src/lib/supabase.ts` | Verbindung zu Supabase (Daten aus `.env`) |
| `src/providers/auth-provider.tsx` | Wer ist angemeldet? (für die ganze App) |
| `supabase/` | Einrichtung von Supabase, E-Mail-Vorlagen |
| `src/components/intro/` | Die Start-Animation |
| `src/components/intro/timeline.ts` | **Ablauf & Zeiten der Animation** – hier wird feinjustiert |
| `src/components/auth/` | Anmeldeformular und Eingabefelder |
| `src/components/brand/` | Schriftzug aus Einzelbuchstaben |
| `src/constants/theme.ts` | Farben, Abstände, Rundungen |
| `assets/brand/` | Original-Logodateien |
| `assets/images/logo/` | Einzelbuchstaben (erzeugt von `tools/build-logo-letters.py`) |
| `assets/images/icon.png` | App-Icon (flach, quadratisch – die Rundung macht das System) |
| `desktop/main.js` | Mac-Fenster (Electron) |
| `desktop/preload.js` | Brücke App ↔ Mac (PDF in Downloads/NEXORA ablegen, Mail/WhatsApp öffnen, Teilen-Menü) |

## Stand

- ✅ Start-Animation (N erscheint, gleitet nach links, Buchstaben fallen von oben, Schriftzug fliegt in den Anmelde-Screen)
- ✅ Anmeldung mit Supabase: Registrierung, E-Mail-Bestätigung per Code, Login, angemeldet bleiben, Abmelden, Passwort vergessen
- ✅ Onboarding: Name, Phase, Business, Branche, Ziele – gespeichert in Supabase
- ✅ Moderne Effekte: Titel blenden Wort für Wort ein, leuchtende Felder, federnde Buttons & Karten
- ✅ App-Rahmen: Seitenleiste (Mac) / Tab-Leiste (Handy), Profil-Seite
- ✅ Dashboard: Begrüßung, Fokus nach Phase, nächste Schritte, Impuls des Tages
- ✅ Gründer-Fahrplan: 6 Phasen, 26 Schritte, Reihenfolge je nach Phase, Fortschritt gespeichert
- ✅ Kunden: Liste mit Suche, Kundenakte, Anrufen/E-Mail, Umsatz pro Kunde
- ✅ Aufträge: Status aktualisiert sich automatisch, einmalig oder monatlich, Rabatt, realisierter/anstehender Umsatz
- ✅ Bereich „Firma“: Logo (wird automatisch zugeschnitten), Briefkopf-Vorschau, Absender, Kleinunternehmer/USt, Steuernummer, Bankverbindung, Fristen, Muster-Rechnung als PDF
- ✅ Angebote & Rechnungen als PDF aus jedem Auftrag – mit eigenem Logo: fortlaufende Nummern, Pflichtangaben, als bezahlt markieren
- ✅ Angebote & Rechnungen verschicken (von Hand): E-Mail oder WhatsApp mit fertigem Text, auf dem Mac auch über „Teilen …“ mit PDF im Anhang; Angebot als verschickt markieren
- ✅ Finanzen: Einnahmen, Ausgaben und Gewinn pro Monat/Jahr, Verlauf der letzten 12 Monate, offene Rechnungen, Ausgaben (auch wiederkehrend), Fixkosten, Einkommensnachweis als PDF
- ✅ Social Media: Content-Board (Status aus erledigten Schritten je Format), Wochenplan, Zahlen pro Post mit Interaktionsrate, Hashtag-Sets, Caption-Zähler, Text kopieren
- ⏳ TikTok & Instagram verbinden (Knopf zeigt „kommt bald“)
- ✅ Assistent (KI): frei schreiben → Claude erkennt Kunden, Aufträge, Ausgaben, Post-Ideen → du bestätigst → gespeichert. Server-Funktion `supabase/functions/assistant` (Einrichtung: `supabase/README.md`)
- ⏳ Automatischer Versand aus der App, Angebot online annehmen
- ⏳ Bankkonto verbinden (Knopf in Finanzen zeigt „kommt bald“): Zahlungseingänge und Ausgaben automatisch übernehmen
- ✅ Akzentfarbe: Wachstums-Grün (#2FE39A) für Buttons, Fortschritt, Haken und Erfolge
- ⏳ Logo als SVG

> Die Bundle-ID `de.nexora.app` in `app.json` ist ein Platzhalter und muss vor der ersten Veröffentlichung im App Store auf eine eigene Domain angepasst werden.

## Für Entwickler

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm run test:unit
```
