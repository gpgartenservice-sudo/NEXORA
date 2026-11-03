# NEXORA

Die App für junge Unternehmer – von der Motivation bis zur kompletten Verwaltung des eigenen Unternehmens.

Eine Codebasis für **Mac, iPhone und Android** (Expo / React Native). Die Mac-Version ist die Web-Version der App in einem eigenen Fenster (Electron).

▶️ Videos: [Start-Animation](docs/media/intro-preview.mp4) · [Registrierung & Onboarding](docs/media/onboarding-preview.mp4) · [Fahrplan](docs/media/fahrplan-preview.mp4) · [Kunden & Aufträge](docs/media/kunden-auftraege-preview.mp4) · [Nexy](docs/media/nexy-preview.mp4) · [Nexy-Sprachmodus](docs/media/nexy-sprache-preview.mp4) · [Termine](docs/media/termine-preview.mp4)

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

### Auf dem Handy (iPhone/Android)

1. Auf dem Handy die App **Expo Go** laden (App Store bzw. Google Play).
2. Auf dem Mac im NEXORA-Ordner:
   ```bash
   npm start
   ```
3. Den angezeigten QR-Code scannen – iPhone: mit der Kamera-App, Android: in Expo Go. Handy und Mac müssen im selben WLAN sein.

Am Handy funktionieren auch PDFs (Angebote, Rechnungen, Mahnungen, Einkommensnachweis, Steuer-Unterlagen) – sie gehen über das **Teilen-Menü** („In Dateien sichern“, WhatsApp, AirDrop …). **E-Mail** öffnet die Mail-App mit dem PDF schon im Anhang; bei **WhatsApp** wird der Text kopiert und das PDF geteilt. **Belege** direkt mit der Kamera fotografieren oder aus Fotos/Dateien wählen, **Logo** aus den Fotos, Termine als Kalender-Datei teilen.

Noch nur auf dem Mac/im Browser: Sprachmodus von Nexy und TikTok/Instagram verbinden.

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
| `src/app/(app)/(tabs)/` | Alle Bereiche mit Navigation: `home` (Dashboard), `fahrplan`, `kunden`, `auftraege`, `termine`, `firma`, `finanzen`, `social`, … |
| `src/features/navigation/` | Seitenleiste (Mac) / Tab-Leiste (Handy), Liste aller Bereiche |
| `src/lib/files.ts` / `files.native.ts` | Dateien speichern: Mac/Browser als Download, Handy über das Teilen-Menü (Metro nimmt automatisch die `.native`-Datei fürs Handy; genauso bei `send-document`, `receipt-file`, `logo-image`, `copy-text`) |
| `src/features/roadmap/` | Gründer-Fahrplan: **Inhalte in `content.ts`**, Seite, Abhaken |
| `src/features/dashboard/` | Texte fürs Dashboard (Fokus je Phase, Impuls des Tages) |
| `src/features/crm/` | Kunden & Aufträge – **Status- und Umsatzlogik in `order-logic.ts`** |
| `src/features/assistant/` | Nexy – **Vorschläge prüfen/zuordnen in `assistant-logic.ts`**, Übersicht für die KI in `nexy-context.ts`, Figur in `nexy-avatar.tsx`, Sprachmodus in `use-voice-mode.ts` (Pausen-Erkennung, Sprachbefehle, Vorlesetext: `voice-logic.ts`; Mikrofon/Stimme: `voice.ts`) |
| `supabase/functions/assistant/` | Server-Funktion von Nexy (Claude; Spracherkennung über Groq Whisper), läuft bei Supabase |
| `supabase/functions/social/` | Server-Funktion für TikTok & Instagram (Anmeldung, verschlüsselte Zugangsdaten, Zahlen abholen) |
| `src/features/appointments/` | Termine – **Termine aus Aufträgen + eigene, Überschneidungen, offene Punkte, Route, .ics in `appointment-logic.ts`** |
| `supabase/functions/mail/` | Server-Funktion für E-Mails aus der App (Resend, PDF-Anhang, Bremse, Versandprotokoll) |
| `src/app/angebot/` | Öffentliche Angebotsseite (ohne Anmeldung, über den geheimen Link) |
| `supabase/functions/calendar/` | Server-Funktion fürs Kalender-Abo (alle Termine als .ics über einen geheimen Link) |
| `src/features/social/` | Social Media – **Status, Schritte, Hashtags, Zeichenlimits in `social-logic.ts`**; TikTok/Instagram verbinden: Zuordnung Videos ↔ Ideen, Zahlen übernehmen, Follower-Verlauf in `connect-logic.ts` |
| `src/features/dunning/` | Zahlungserinnerungen, Mahnungen, Bewertungsbitten – **Stufen, Fristen, Texte in `dunning-logic.ts`**, PDF in `dunning-pdf.ts` |
| `src/features/goals/` | To-dos & Ziele – **Fälligkeit, Gruppen und Ziel-Fortschritt aus den echten Zahlen in `goals-logic.ts`** |
| `src/features/finance/` | Finanzen – **Monatszuordnung von Einnahmen/Ausgaben in `finance-logic.ts`**, Diagramm, Einkommensnachweis; Belege: Auswerten in `receipt-logic.ts`, Datei/Speicher in `receipt-file.ts`; Steuern: Rechnen/CSV in `tax-logic.ts`, Jahresübersicht in `tax-pdf.ts` |
| `src/features/tutorial/` | Einführungen – **Texte je Bereich in `tutorial-content.ts`**, Stellen markieren mit `<TourTarget id="bereich.stelle">`, Hervorhebung/Karte in `tutorial-overlay.tsx` |
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
- ✅ TikTok & Instagram verbinden (Social Media → Konten): Anmeldung über TikTok/Instagram (Mac-App: eigenes Fenster), Follower und Follower-Verlauf, Videos/Beiträge mit Aufrufen, Likes, Kommentaren, Geteilt, Gespeichert; neue Videos werden automatisch der passenden Idee zugeordnet (sonst Vorschlag oder „Als Post übernehmen“) und ihre Zahlen landen im Post; Abgleich automatisch alle 6 Stunden beim Öffnen; Nexy kennt die Follower. Einrichtung: `supabase/README.md`, Abschnitt 5
- ✅ Nexy (KI-Assistent) mit animierter Figur (schaut der Maus nach, freut sich bei Hover, Stupser mit Funken und Sprechblase, wird schläfrig): Gespräch mit Rückfragen und Schnellantworten, kennt Kunden, Aufträge, offene Rechnungen und Zahlen; legt Kunden/Aufträge/Ausgaben/Post-Ideen an, erstellt Angebote, Rechnungen und Einkommensnachweis als PDF, markiert Rechnungen als bezahlt; Termine: eigene Termine ohne Auftrag anlegen, Erstgespräch/Ausführung in bestehende Aufträge eintragen, Termine verschieben, ändern, als erledigt markieren oder absagen (mit Hinweis bei Überschneidungen); Preise in Aufträge eintragen; To-dos und Ziele – alles erst nach Bestätigung. Server-Funktion `supabase/functions/assistant` (Einrichtung: `supabase/README.md`)
- ✅ Nexy-Sprachmodus: Mikrofon-Knopf, Nexy hört zu (Schallringe + Pegel), merkt an der Pause, wann du fertig bist, antwortet laut mit deutscher Systemstimme (Mund bewegt sich) und hört wieder zu; „Ja“/„Nein“ bestätigt bzw. verwirft Vorschläge, „Stopp“ beendet; „Fertig“, „Unterbrechen“, Schalter „Vorlesen“ auch fürs Schreiben. Spracherkennung über Groq (Geheimnis `GROQ_API_KEY`, siehe `supabase/README.md`)
- ✅ Termine: Woche (Spalten am Mac, Tagesliste am Handy) und Liste mit Erstgesprächen, Ausführungen und eigenen Terminen; Überschneidungen; offene Punkte (Erstgespräch erledigt?, Termin vereinbaren, Ausführung planen, Auftrag abschließen); Tagesroute in Google Maps ab Firmenadresse; Termin in Apple/Google Kalender übernehmen; Kalender-Abo (alle Termine automatisch im Kalender, auch am Handy); „Heute & morgen“ auf der Startseite; Nexy kennt die nächsten Termine. Einrichtung: `supabase/README.md`, Abschnitt 6
- ✅ Zahlungserinnerungen & Mahnungen: überfällige Rechnungen in Finanzen, Termine und im Auftrag; Zahlungserinnerung → 1. Mahnung → letzte Mahnung mit neuer Frist und optionaler Mahngebühr; als PDF im Briefkopf, per E-Mail oder WhatsApp; Verlauf mit Rückgängig; danach Hinweis auf den Online-Mahnantrag; Nexy kennt den Mahnstand. Bewertungsbitte bei bezahlten Rechnungen mit eigenem Bewertungs-Link (Firma → Bewertungen). Einrichtung: `supabase/README.md`, Abschnitt 7
- ✅ To-dos & Ziele: To-dos mit Fälligkeit (Überfällig, Heute, Nächste 7 Tage, Später, Ohne Datum), wichtig, optional zu Kunde/Auftrag; Ziele für Umsatz (Monat/Jahr), neue Kunden, abgeschlossene Aufträge und veröffentlichte Posts (Woche/Monat/Jahr) zählen automatisch aus den echten Zahlen mit – mit „Im Plan“/„Hinterher“; eigene Ziele zum Selbstzählen; „Heute zu tun“ und Ziele auf der Startseite. Nexy legt To-dos an („Erinner mich Freitag …“), ändert und hakt sie ab, legt Ziele an und trägt Preise in Aufträge ein. Einrichtung: SQL-Skript `20261111090000_todos_goals.sql`
- ✅ Belege: Foto oder PDF – Nexy liest Betrag, Datum, Händler, Kategorie und Umsatzsteuer aus und füllt die Ausgabe vor; Beleg sicher im privaten Speicher, an jeder Ausgabe ansehen/ersetzen/entfernen; Hinweis auf doppelt erfasste Belege; „Speichern & nächster Beleg“. Einrichtung: `supabase/README.md`, Abschnitt 8
- ✅ Angebot online annehmen: geheimer Link pro Angebot – Kunde sieht das Angebot im Browser (mit Logo), lädt das PDF, nimmt verbindlich an (Name + Bestätigung) oder lehnt mit Nachricht ab; Auftrag springt automatisch weiter, im Auftrag „Online angenommen am … von …“. Einrichtung: `supabase/README.md`, Abschnitt 9
- ✅ Direkt senden: Angebote, Rechnungen und Mahnungen per E-Mail mit PDF direkt aus NEXORA (über das eigene Postfach per SMTP, z. B. webgo, oder Resend), Text anpassbar, Antworten an die eigene Adresse, Versandprotokoll; Speichern im Auftrag überschreibt nur noch geänderte Felder. Einrichtung: `supabase/README.md`, Abschnitt 10
- ✅ Steuern: Steuer-Topf (wie viel zurücklegen, Prozent wählbar), Kleinunternehmer-Grenze mit Warnung bzw. geschätzte Umsatzsteuer mit Vorsteuer aus Ausgaben, Export für die Steuerberatung (ZIP mit Jahresübersicht-PDF, CSV-Listen und Belegen); Nexy kennt die Zahlen. Einrichtung: `supabase/README.md`, Abschnitt 11
- ✅ Einführungen: Nexy erklärt jeden Bereich beim ersten Besuch in 2–5 kurzen Schritten und hebt die wichtigen Stellen hervor; für neue Nutzer startet auf der Startseite ein Rundgang durch alle Bereiche nacheinander. Jederzeit über das „?“ neben der Überschrift wiederholbar, im Profil an-/abschaltbar und „Rundgang starten“. Ohne SQL-Skript `20261115090000_tutorials.sql` merkt sich der Browser/Mac den Stand
- ✅ Handy-App (iPhone/Android): PDFs, Mahnungen, Steuer-Export und Einkommensnachweis über das Teilen-Menü, E-Mail mit PDF-Anhang aus der Mail-App, Belege mit der Kamera, Logo aus den Fotos, Kopieren, Kalender-Datei – ausprobieren mit Expo Go (siehe oben). Noch nicht am Handy: Sprachmodus, TikTok/Instagram verbinden
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
