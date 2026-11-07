# Supabase einrichten (einmalig)

Projekt: `txifgiuxecaphmaucmdf` · Region Frankfurt · [Dashboard öffnen](https://supabase.com/dashboard/project/txifgiuxecaphmaucmdf)

Die App bestätigt E-Mail-Adressen und setzt Passwörter **per Code** zurück (statt per Link). Das funktioniert auf Mac, iPhone und Android gleich, ohne dass ein Link die richtige App öffnen muss. Dafür müssen die E-Mail-Vorlagen den Code enthalten.

## 1. E-Mail-Vorlagen (Pflicht)

Im Dashboard: **Authentication → Emails → Templates**

| Vorlage | Betreff | Inhalt (Message body) |
|---|---|---|
| **Confirm signup** | `Dein Bestätigungscode für Lunaxora` | kompletten Inhalt von [`templates/confirm-signup.html`](templates/confirm-signup.html) einfügen |
| **Reset password** | `Dein Code für ein neues Passwort` | kompletten Inhalt von [`templates/reset-password.html`](templates/reset-password.html) einfügen |

Jeweils **Save changes** klicken.

## 2. Passwort-Regeln (empfohlen)

**Authentication → Sign In / Providers → Email**

- **Confirm email:** an (Standard)
- **Minimum password length:** `8` (die App verlangt ebenfalls mindestens 8 Zeichen)

## 3. Datenbank-Tabellen (Pflicht, bei jedem neuen Skript)

Die Skripte im Ordner [`migrations/`](migrations) legen die Tabellen der App an. Jedes Skript einmal ausführen, in der Reihenfolge der Dateinamen:

1. Im Dashboard links **SQL Editor** öffnen → **New query**
2. Den kompletten Inhalt der Datei einfügen → **Run**
3. Unten erscheint „Success. No rows returned“ – fertig.

| Skript | Inhalt |
|---|---|
| `20261102120000_profiles.sql` | Profil & Onboarding-Antworten (jeder sieht nur sein eigenes) |
| `20261103090000_roadmap_progress.sql` | Fortschritt im Gründer-Fahrplan (erledigte Schritte) |
| `20261103120000_customers_orders.sql` | Kunden und Aufträge (Aufträge nur mit eigenen Kunden verknüpfbar) |
| `20261104090000_business_documents.sql` | Firmendaten, Angebote & Rechnungen mit fortlaufenden Nummern (Rechnungen sind nach dem Erstellen unveränderbar) |
| `20261105090000_business_logo.sql` | Firmenlogo für Angebote und Rechnungen (jede Version bleibt erhalten, damit alte Rechnungen ihr Logo behalten) |
| `20261106090000_finances.sql` | Finanzen: Ausgaben (einmalig, monatlich, jährlich) und automatisches Abschlussdatum bei Aufträgen |
| `20261107090000_social.sql` | Social Media: Posts (Board, Wochenplan, Zahlen) und Hashtag-Sets |
| `20261108090000_social_accounts.sql` | TikTok & Instagram verbinden: Konten (Zugangsdaten verschlüsselt), Follower-Verlauf, Videos/Beiträge mit Zahlen |
| `20261109090000_appointments.sql` | Termine: eigene Termine und geheimer Link fürs Kalender-Abo |
| `20261110090000_invoice_followups.sql` | Mahnwesen: verschickte Zahlungserinnerungen, Mahnungen und Bewertungsbitten; Link für Bewertungen in den Firmendaten |
| `20261111090000_todos_goals.sql` | To-dos (mit Fälligkeit, optional zu Kunde/Auftrag) und Ziele (Umsatz, neue Kunden, Aufträge, Posts oder eigene) |
| `20261112090000_receipts.sql` | Belege zu Ausgaben: privater Speicher „receipts“ (jeder Nutzer nur sein eigener Ordner) und Verknüpfung zur Ausgabe |
| `20261113090000_offer_links_mail.sql` | Angebote online annehmen (geheimer Link, Annehmen/Ablehnen ohne Anmeldung) und Versandprotokoll für E-Mails aus der App |
| `20261114090000_tax.sql` | Steuern: Prozentsatz für den Steuer-Topf (Firmendaten) und enthaltene Umsatzsteuer bei Ausgaben (Vorsteuer) |
| `20261115090000_tutorials.sql` | Einführungen: welche Bereiche schon erklärt wurden und ob sie automatisch erscheinen sollen (im Profil, damit es auf Mac und Handy gleich ist) |
| `20261116090000_plans.sql` | Abo: 14 Tage Pro-Test, danach Gratis mit 20 Luna-Nachrichten und 5 Belegen im Monat; Pro-Funktionen (Online-Angebote, Mahnungen, Kalender-Abo) werden in der Datenbank geprüft |

Ein Skript versehentlich zweimal auszuführen schadet nicht.

## 4. Luna (KI-Assistentin) einrichten

Luna schickt deine Nachricht – zusammen mit dem bisherigen Gespräch und einer kurzen Übersicht deiner Kunden (nur Namen), Aufträge, offenen Rechnungen und Zahlen – an **Claude** (Anthropic). Zurück kommen eine Antwort, ggf. eine Rückfrage und Vorschläge: Kunden und Aufträge (anlegen, löschen – beim Kunden erst seine Aufträge; Angebote/Rechnungen bleiben), Ausgaben, Post-Ideen, Angebote/Rechnungen als PDF, Einkommensnachweis, Rechnung als bezahlt markieren, Termine (eigene anlegen, in Aufträge eintragen, verschieben, ändern, absagen), Preise in Aufträgen, To-dos (anlegen, ändern, abhaken) und Ziele, außerdem Ändern und Löschen von allem, was die App kann (Kundendaten, Aufträge mit Status und Storno, Ausgaben, Posts, Ziele, Firmendaten, Rechnung wieder auf offen) und das Öffnen jeder Seite. Damit Luna Ausgaben, Posts und Ziele findet, bekommt sie davon die neuesten bzw. wichtigsten mit Kurzzeichen (E1, P1, Z1 …). Das passiert in einer kleinen **Server-Funktion** bei Supabase, damit der API-Schlüssel nie in der App steht. Die Funktion speichert nichts; gespeichert wird in der App – und zwar sofort, ohne Rückfrage: Luna öffnet die Formulare, tippt alles sichtbar ein und speichert (mit Esc überspringst du die Vorführung). Nur wenn noch etwas fehlt (z. B. Anschrift für eine Rechnung), wartet der Vorschlag – sobald es geklärt ist, legt Luna los. Im Sprachmodus macht Luna es genauso vor und hört danach weiter zu.

**1. API-Schlüssel holen**

1. Auf [console.anthropic.com](https://console.anthropic.com) anmelden bzw. registrieren.
2. Unter **Billing** etwas Guthaben aufladen (z. B. 5 €).
3. Unter **API Keys** → **Create Key** einen Schlüssel erstellen (Name z. B. `Lunaxora`) und kopieren – er beginnt mit `sk-ant-`.

> Den Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis (Schritt 3).

**2. Server-Funktion anlegen**

1. Im Supabase-Dashboard links **Edge Functions** öffnen → **Deploy a new function** → **Via Editor**.
2. Als Namen genau `assistant` eintragen.
3. Den Beispiel-Code im Editor komplett löschen und den kompletten Inhalt von [`functions/assistant/index.ts`](functions/assistant/index.ts) einfügen.
4. **Deploy** klicken und warten, bis die Funktion als aktiv angezeigt wird.

**3. Schlüssel als Geheimnis speichern**

1. In **Edge Functions** den Bereich **Secrets** öffnen.
2. Neues Geheimnis: Name `ANTHROPIC_API_KEY`, Wert = dein Schlüssel → **Save**.

Fertig – in der App links **Luna** öffnen und losschreiben.

**Neue Version der Funktion einspielen** (wenn sich `functions/assistant/index.ts` geändert hat): **Edge Functions → assistant → Code** öffnen, den Inhalt komplett durch die neue Datei ersetzen → **Deploy**. Die Geheimnisse bleiben erhalten.

> Gut zu wissen (für Entwickler): Claude übersetzt Lunas Antwortformat in eine Grammatik mit Größengrenze („The compiled grammar is too large“). Deshalb hat das Format nur `reply`, `quick_replies` und `actions` (je `type` + `data` als JSON-Text); neue Vorschlagsarten kommen in `ACTION_FIELDS` und den Systemtext, nicht ins Format. Die Übersicht, die mitgeschickt wird, ist gedeckelt (App: 26.000 Zeichen, Funktion: 30.000).

**Falls es nicht klappt**

- Meldung „Server-Funktion „assistant“ fehlt“: Name in Schritt 2 genau `assistant` (klein geschrieben)?
- Meldung „Anmeldung abgelaufen“ bzw. in den Logs `Invalid JWT`: In den Einstellungen der Funktion **Verify JWT** (bzw. „Enforce JWT Verification“) ausschalten. Die Funktion prüft selbst, ob ein angemeldeter Lunaxora-Nutzer anfragt.
- Fehler ansehen: **Edge Functions → assistant → Logs**.

**Kosten:** Standardmäßig nutzt Luna **Claude Opus 5.5** – grob 2–4 Cent pro Nachricht (Gespräch und Übersicht werden jedes Mal mitgeschickt). Günstiger geht es mit einem zweiten Geheimnis `ASSISTANT_MODEL` = `claude-haiku-5-5` (ein Bruchteil eines Cents, bei kniffligen Fragen weniger genau). Gründlicher (langsamer, teurer) antwortet Luna mit `ASSISTANT_EFFORT` = `medium`.

**Datenschutz:** Nachricht, Gesprächsverlauf und die Übersicht (Kundennamen ohne Telefon/E-Mail/Anschrift, Aufträge, Rechnungsnummern und Beträge, Finanzzahlen, Termine der nächsten Wochen mit Ort, offene To-dos, Ziele mit Stand) werden zur Auswertung an Anthropic übertragen. Das gehört später in die Datenschutzerklärung.

### Sprachmodus (mit Luna sprechen)

Im Eingabefeld von Luna gibt es einen **Mikrofon-Knopf**. Dann hört Luna zu, merkt an der Pause, wann du fertig bist, antwortet **laut** und hört danach wieder zu. Vorschläge führt Luna sofort aus und sagt danach, was erledigt ist. Fehlte noch etwas, bestätigst du später mit „Ja“ (oder verwirfst mit „Nein“). „Stopp“ bzw. „Tschüss“ beendet den Sprachmodus.

Claude versteht keine Sprachaufnahmen. Die Umwandlung von Sprache in Text übernimmt deshalb **Groq** (Spracherkennung „Whisper“) – in derselben Server-Funktion `assistant`. Gesprochen wird mit Lunas Stimme von **ElevenLabs** (Abschnitt „Lunas Stimme“ unten).

**1. Groq-Schlüssel holen**

1. Auf [console.groq.com](https://console.groq.com) registrieren bzw. anmelden.
2. Links **API Keys** → **Create API Key** (Name z. B. `Lunaxora`) und den Schlüssel kopieren – er beginnt mit `gsk_`.

> Auch diesen Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis.

**2. Als Geheimnis speichern:** **Edge Functions → Secrets** → Name `GROQ_API_KEY`, Wert = dein Schlüssel → **Save**.

**3. Neue Version der Funktion einspielen:** **Edge Functions → assistant → Code** → Inhalt komplett durch [`functions/assistant/index.ts`](functions/assistant/index.ts) ersetzen → **Deploy** (der Sprachmodus ist erst in der neuen Version drin).

**Mac-App:** Beim ersten Start des Sprachmodus fragt macOS, ob Lunaxora das Mikrofon benutzen darf → **Erlauben**. Falls versehentlich abgelehnt: **Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon** → Lunaxora einschalten (beim Start über `npm run mac` heißt der Eintrag „Terminal“ bzw. „Electron“) und die App neu starten.

**Falls es nicht klappt:** Die App zeigt einen Hinweis, was fehlt („GROQ_API_KEY fehlt“, „alte Version der Server-Funktion“, „Mikrofon blockiert“). Details stehen unter **Edge Functions → assistant → Logs**. Optional: Geheimnis `TRANSCRIBE_MODEL` = `whisper-large-v3` (etwas genauer, etwas langsamer als der Standard `whisper-large-v3-turbo`).

**Kosten:** Groq hat einen kostenlosen Einstieg mit Tageslimits; danach kostet die Spracherkennung nach Audio-Dauer nur einen Bruchteil eines Cents pro Nachricht (aktuelle Preise: groq.com/pricing). Dazu kommt wie beim Schreiben die Antwort von Claude.

**Datenschutz:** Die Sprachaufnahme wird nur zur Umwandlung in Text an Groq (USA) übertragen; Lunaxora speichert sie nicht. Auch das gehört in die Datenschutzerklärung.

### Lunas Stimme (ElevenLabs)

Luna spricht mit einer Stimme von **ElevenLabs** – beim Vorlesen, im Sprachmodus und wenn man Luna anstupst – über dieselbe Server-Funktion `assistant` (Modus „speak“). Eine andere Stimme gibt es nicht: Ist ElevenLabs nicht eingerichtet oder gerade nicht erreichbar, bleibt Luna stumm und zeigt im Luna-Bereich den Grund. Gesprochen wird nur im Mac-Fenster und im Browser.

**1. Konto und Stimme:** Auf [elevenlabs.io](https://elevenlabs.io) registrieren – für deutsche Stimmen aus der Bibliothek und die Nutzung in der App mindestens **Starter** (der Gratis-Tarif darf Bibliotheks-Stimmen nicht über die Schnittstelle nutzen und hat keine kommerzielle Lizenz). **Voices → Explore** → Filter **Language: German** → Stimme mit **+** speichern → unter **My Voices** bei der Stimme **⋯ → Copy voice ID**.

**2. API-Schlüssel:** Bei ElevenLabs unter **API Keys** einen Schlüssel anlegen, nur **Text to Speech** erlauben und ein **Credit-Limit** setzen (zum Testen z. B. 20.000).

> Den Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis.

**3. Als Geheimnisse speichern:** **Edge Functions → Secrets** → `ELEVENLABS_API_KEY` = Schlüssel, `ELEVENLABS_VOICE_ID` = kopierte Stimmen-ID → **Save**. Optional `ELEVENLABS_MODEL` (Standard `eleven_v4_turbo`; z. B. `eleven_flash_v2_5` = günstiger, `eleven_v4` = noch ausdrucksstärker, aber langsamer).

**4. Neue Version der Funktion einspielen:** **Edge Functions → assistant → Code** → Inhalt komplett durch [`functions/assistant/index.ts`](functions/assistant/index.ts) ersetzen → **Deploy**.

**Prüfen:** In der App bei Luna **Vorlesen** einschalten und etwas fragen. Klappt etwas nicht, zeigt Luna über dem Eingabefeld den Grund („ELEVENLABS_API_KEY fehlt“, „alte Version der Server-Funktion“, „Credits aufgebraucht“ …). Details: **Edge Functions → assistant → Logs**.

**Kosten:** ElevenLabs rechnet nach Zeichen ab; eine vorgelesene Antwort (meist 300–500 Zeichen) kostet grob 1–3 Cent. Vorlesen zählt nicht als Luna-Nachricht – Grenze sind die Credits des Schlüssels bzw. Tarifs (aktuelle Preise: elevenlabs.io/pricing). Die kurzen Ausrufe beim Anstupsen holt die App nur einmal pro Start.

**Datenschutz:** Die vorzulesenden Antworten von Luna (können Kundennamen und Beträge enthalten) gehen zur Umwandlung an ElevenLabs (USA). Auch das gehört in die Datenschutzerklärung.

## 5. TikTok & Instagram verbinden

Im Bereich **Social Media → Konten** verbindest du deine Konten. Danach holt Lunaxora Follower, Likes und die Zahlen jedes Videos bzw. Beitrags (beim Öffnen automatisch, wenn der Stand älter als 6 Stunden ist), ordnet neue Videos der passenden Idee im Content-Board zu und überträgt Aufrufe, Likes, Kommentare, Geteilt und Gespeichert in den Post. Lunaxora bekommt **nur Lese-Rechte** und postet nichts.

Dafür brauchst du je Plattform eine (kostenlose) **Entwickler-App** – das ist der offizielle Weg, über den sich Nutzer bei TikTok bzw. Instagram anmelden. Die Zugangsdaten (Tokens) speichert die Server-Funktion **verschlüsselt** in der Datenbank.

**1. Datenbank-Skript** `20261108090000_social_accounts.sql` ausführen (siehe Abschnitt 3).

**2. Server-Funktion anlegen**

1. **Edge Functions → Deploy a new function → Via Editor**, Name genau `social`.
2. Den Beispiel-Code komplett durch den Inhalt von [`functions/social/index.ts`](functions/social/index.ts) ersetzen → **Deploy**.
3. In den Einstellungen der Funktion **Verify JWT** (bzw. „Enforce JWT Verification“) **ausschalten**. Das ist hier Pflicht: Nach der Anmeldung leitet TikTok/Instagram den Browser zur Funktion zurück – ohne Lunaxora-Anmeldung. Die Funktion prüft bei allen anderen Anfragen selbst, ob ein angemeldeter Nutzer fragt.

Deine **Rückleitungs-Adresse** (brauchst du gleich bei TikTok und Instagram):

```
https://DEIN-PROJEKT.supabase.co/functions/v1/social/callback
```

`DEIN-PROJEKT` ist der Teil aus deiner Supabase-Adresse (`EXPO_PUBLIC_SUPABASE_URL` in `.env`).

**3. TikTok**

1. Auf [developers.tiktok.com](https://developers.tiktok.com) anmelden → **Manage apps** → vorhandene App öffnen oder **Connect an app** (neue App, z. B. „Lunaxora“).
2. Produkt **Login Kit** hinzufügen, dazu die Berechtigungen (Scopes) `user.info.basic`, `user.info.profile`, `user.info.stats` und `video.list` (die letzten drei gehören zur **Display API**).
3. Bei Login Kit als Plattform **Web** wählen und als **Redirect URI** die Rückleitungs-Adresse von oben eintragen.
4. Solange die App nicht von TikTok geprüft ist, läuft sie im **Sandbox**-Modus: Dort unter **Target users** dein eigenes TikTok-Konto hinzufügen – dann kannst du dich schon verbinden. Für andere Nutzer muss die App später zur Prüfung (**Submit for review**).
5. **Client key** und **Client secret** kopieren und in Supabase unter **Edge Functions → Secrets** speichern: `TIKTOK_CLIENT_KEY` und `TIKTOK_CLIENT_SECRET`.

Falls TikTok einzelne Berechtigungen (noch) nicht freigibt: Geheimnis `TIKTOK_SCOPES` = `user.info.basic,video.list` – dann fehlen nur die Follower-Zahlen.

**4. Instagram** (geht nur mit **Business- oder Creator-Konto** – umstellen in der Instagram-App unter *Einstellungen → Kontotyp und Tools → Zu professionellem Konto wechseln*, kostenlos)

1. Auf [developers.facebook.com](https://developers.facebook.com) → **Meine Apps → App erstellen**. Als Anwendungsfall den für **Instagram** wählen (Nachrichten und Inhalte auf Instagram verwalten).
2. Im Anwendungsfall die **API-Einrichtung mit Instagram-Login** öffnen (Instagram API with Instagram Login).
3. Bei **Business-Login einrichten** die Rückleitungs-Adresse von oben als **Weiterleitungs-URL** (OAuth redirect URI) eintragen.
4. Unter **App-Rollen → Rollen → Instagram-Tester** dein Instagram-Konto hinzufügen und die Einladung in der Instagram-App annehmen (*Einstellungen → Apps und Websites → Tester-Einladungen*). Bis Meta die App geprüft hat, können sich nur Tester verbinden.
5. **Instagram-App-ID** und **Instagram-App-Geheimcode** kopieren (Achtung: die von *Instagram*, nicht die Facebook-App-ID) und in Supabase speichern: `INSTAGRAM_APP_ID` und `INSTAGRAM_APP_SECRET`.

Die Bezeichnungen in den Entwicklerportalen ändern sich ab und zu – sinngemäß sind es immer: App anlegen, Rückleitungs-Adresse eintragen, dich selbst als Test-Nutzer freischalten, Schlüssel kopieren.

> Client secret und App-Geheimcode **niemals** in die App, ins Repository oder in einen Chat schreiben – nur als Supabase-Geheimnis.

**Verbinden:** In der App **Social Media → Konten → Mit TikTok verbinden**. In der Mac-App öffnet sich ein eigenes Anmeldefenster, im Browser wechselt die Seite zur Anmeldung und kommt danach zurück. Für die **Web-Version** auf einer eigenen Adresse diese als Geheimnis `SOCIAL_APP_ORIGINS` eintragen (z. B. `https://app.deine-domain.de`; `localhost` ist immer erlaubt).

**Falls es nicht klappt:** Die App zeigt, was fehlt („Server-Funktion fehlt“, „In Supabase fehlen die Geheimnisse …“, „Datenbank-Skript fehlt“) oder was TikTok/Instagram gemeldet hat. Häufig: Rückleitungs-Adresse nicht exakt gleich eingetragen, eigenes Konto nicht als Test-Nutzer freigeschaltet, Instagram-Konto ist privat statt Business/Creator. Details: **Edge Functions → social → Logs**.

**Datenschutz:** Gespeichert werden Profilname, Profilbild, Follower-Zahlen, Beschreibungen, Links und Zahlen deiner Videos/Beiträge. Beim **Trennen** werden Zugang, Verlauf und Videoliste gelöscht (bei TikTok wird der Zugang auch dort zurückgezogen); deine Posts im Content-Board und ihre Zahlen bleiben.

## 6. Termine & Kalender-Abo

Der Bereich **Termine** zeigt Erstgespräche und Ausführungen aus deinen Aufträgen und eigene Termine (z. B. Steuerberatung) – als Woche oder Liste, mit offenen Punkten, Tagesroute (Google Maps ab deiner Firmenadresse) und „In Kalender übernehmen“. Dafür reicht das Datenbank-Skript `20261109090000_appointments.sql` (Abschnitt 3).

**Kalender-Abo (optional):** Damit erscheinen alle Termine automatisch in Apple Kalender, Google Kalender oder Outlook – auch auf dem Handy – und bleiben aktuell.

1. **Edge Functions → Deploy a new function → Via Editor**, Name genau `calendar`.
2. Den Beispiel-Code komplett durch den Inhalt von [`functions/calendar/index.ts`](functions/calendar/index.ts) ersetzen → **Deploy**.
3. In den Einstellungen der Funktion **Verify JWT** ausschalten – Kalender-Apps melden sich nicht an. Geschützt sind die Termine durch den langen, geheimen Link.
4. In der App: **Termine → Kalender-Abo → Abo-Link erstellen → Abo testen**. Dann **In Apple Kalender öffnen** (Mac/iPhone) bzw. **Zu Google Kalender**.

Gut zu wissen:

- Apple Kalender fragt je nach Einstellung alle 5 Minuten bis 1× pro Woche nach neuen Terminen (*Kalender → Einstellungen → Accounts → Abonnements*), Google Kalender meist alle paar Stunden – das lässt sich bei Google nicht beschleunigen.
- Das Abo ist zum Lesen: Termine änderst du in Lunaxora.
- Wer den Link kennt, sieht deine Termine (mit Kunden und Adressen). Bei Bedarf in der App **Neuen Link erzeugen** – der alte funktioniert dann sofort nicht mehr.
- Falls **Abo testen** „Schlüssel ungültig“ meldet: Geheimnis `NEXORA_PUBLISHABLE_KEY` = der Publishable Key aus der `.env` der App (der ist öffentlich und darf dort hin).

## 7. Zahlungserinnerungen, Mahnungen & Bewertungen

Dafür reicht das Datenbank-Skript `20261110090000_invoice_followups.sql` (Abschnitt 3) – keine Server-Funktion nötig.

- **Mahnen:** Ist eine Rechnung überfällig, erscheint **Mahnen** in Finanzen (offene Rechnungen), unter Termine → *Zu erledigen* und an der Rechnung im Auftrag. Die Stufen: **Zahlungserinnerung** (freundlich, ohne Gebühr) → **1. Mahnung** → **Letzte Mahnung**, jeweils mit neuer Frist (Vorschlag: 7 Tage) und bei den Mahnungen optional einer Mahngebühr. Das Schreiben gibt es als PDF im Briefkopf der Rechnung, per E-Mail oder WhatsApp mit fertigem Text. Lunaxora merkt sich Stufe, Datum und Frist; die nächste Stufe ist erst nach Ablauf der Frist dran. Ein versehentlicher Vermerk lässt sich mit **Rückgängig** zurücknehmen.
- **Nach der letzten Mahnung** zeigt Lunaxora den Weg zum gerichtlichen Mahnverfahren ([online-mahnantrag.de](https://www.online-mahnantrag.de)).
- **Bewertung:** Bei bezahlten Rechnungen gibt es **Bewertung** – eine kurze Bitte per E-Mail oder WhatsApp mit deinem Link. Den Link trägst du unter **Firma → Bewertungen** ein (z. B. bei Google: im Google-Unternehmensprofil die Funktion zum Anfordern von Rezensionen öffnen und den Link kopieren).
- Gebühren: Für eine Zahlungserinnerung keine, für Mahnungen nur die tatsächlichen Kosten (z. B. Porto – meist wenige Euro). Das ist kein Rechtsrat – bei größeren Beträgen lohnt eine kurze Beratung.

## 8. Belege

**Finanzen → Beleg erfassen**: Foto oder PDF wählen (am Handy-Browser auch direkt die Kamera) – Luna liest Betrag, Datum, Händler, Kategorie und ausgewiesene Umsatzsteuer aus und füllt die Ausgabe vor. Du prüfst und speicherst; der Beleg liegt dann im privaten Speicher. An jeder Ausgabe kann man einen Beleg ansehen, ersetzen, entfernen oder nachträglich anhängen.

Einrichtung:

1. Datenbank-Skript `20261112090000_receipts.sql` ausführen (Abschnitt 3) – es legt auch den Speicher „receipts“ an.
2. Die Server-Funktion `assistant` neu einspielen (Abschnitt 4, „Neue Version der Funktion einspielen“) – sie liest die Belege. Es gilt derselbe Schlüssel `ANTHROPIC_API_KEY`; ein Beleg kostet etwa 1–2 Cent.

Gut zu wissen: Fotos werden vor dem Hochladen verkleinert (längste Seite 2000 px), PDFs bis 6 MB. iPhone-Fotos im HEIC-Format bitte als JPG speichern (*Einstellungen → Kamera → Formate → Maximale Kompatibilität*). Löschst du einen Nutzer im Dashboard, bleiben seine Belege unter **Storage → receipts → <Nutzer-ID>** liegen – dort bei Bedarf mit löschen.

## 9. Angebote online annehmen

Dein Kunde bekommt einen Link, sieht das Angebot im Browser (mit deinem Logo; das PDF hat er im Anhang der E-Mail) und klickt **Angebot annehmen** (mit Name und Bestätigung) – oder lehnt mit einer Nachricht ab. Der Auftrag springt bei Annahme automatisch auf „Angebot angenommen“; im Auftrag steht „Online angenommen am … von …“.

Einrichtung:

1. Datenbank-Skript `20261113090000_offer_links_mail.sql` ausführen (Abschnitt 3).
2. **Angebotsseite ins Internet stellen** – nur eine einzige Datei, nicht die App, in einem **Unterordner** deiner Domain (im Hauptordner liegt die Lunaxora-Homepage). Wer die Adresse ohne Link aufruft, sieht nur „Bitte öffnen Sie den Link aus Ihrer E-Mail“:
   1. Beim Hoster die Domain (z. B. `nexoranexy.de`) mit einem eigenen Ordner verbinden, z. B. `/home/www/nexoranexy.de`, und **SSL/HTTPS einschalten** („Let’s Encrypt“).
   2. Im Projektordner `bash scripts/web-hochladen.sh` ausführen. Das Skript baut `dist-angebot/index.html` aus [`web-angebot/index.html`](../web-angebot/index.html) (setzt Supabase-Adresse und Publishable Key aus der `.env` ein) und lädt sie per SFTP in den Unterordner `Angebot` (aus `EXPO_PUBLIC_WEB_URL`, legt ihn bei Bedarf an). Beim ersten Mal fragt es Server, Benutzer und den Ordner der Domain ab, das Passwort jedes Mal. In den Hauptordner lädt es nie.
      Ohne Skript: im Ordner der Domain einen Ordner `Angebot` anlegen (Groß-/Kleinschreibung wie in `EXPO_PUBLIC_WEB_URL`) und `dist-angebot/index.html` per Dateimanager des Hosters dort hinein hochladen.
   3. Test: `https://nexoranexy.de/Angebot/` öffnen – „Angebot ansehen“ erscheint.
3. Die Adresse in die `.env` der App eintragen (steht schon drin):
   ```
   EXPO_PUBLIC_WEB_URL=https://nexoranexy.de/Angebot
   ```
   Danach die Mac-App neu starten (`npm run mac`). Ändert sich etwas an der Angebotsseite (`web-angebot/index.html`, Texte wie in `src/features/documents/offer-public-screen.tsx`), Schritt 2 wiederholen.

Danach: im Auftrag beim Angebot **Senden → E-Mail** (bzw. WhatsApp oder Teilen …) – der Link zum Annehmen steht automatisch im Text, das PDF hängt an.

Gut zu wissen: Wer den Link kennt, sieht nur dieses eine Angebot – nicht deine anderen Daten. Abgelaufene Angebote lassen sich nicht mehr annehmen. Die Online-Annahme ist eine verbindliche Zusage deines Kunden, ersetzt aber bei großen Aufträgen nicht unbedingt einen schriftlichen Vertrag.

## 10. E-Mails direkt verschicken

Mahnungen gehen mit **Direkt senden** ohne Mail-Programm an den Kunden – mit PDF im Anhang. Absender ist dein Firmenname, Antworten landen bei der E-Mail-Adresse aus deinen Firmendaten. Ohne diese Einrichtung funktioniert alles andere trotzdem (PDF, eigenes Mail-Programm, WhatsApp, Link zum Annehmen).

Es gibt zwei Wege – **Weg A ist der einfachste, wenn du schon ein Postfach bei deinem Webhoster hast** (z. B. webgo, IONOS, Strato, All-Inkl).

### Weg A: über dein eigenes Postfach (SMTP)

1. Beim Webhoster ein Postfach nehmen oder neu anlegen, z. B. `angebote@deine-domain.de` (eigenes Postfach mit eigenem Passwort ist sicherer als dein Hauptpostfach).
2. In den E-Mail-Einstellungen des Hosters nachsehen: **Postausgangsserver (SMTP)**, **Benutzername** und ob **Port 465 (SSL/TLS)** geht. Bei webgo: im Kundenbereich (WebCP) beim Postfach unter den Einstellungen für Mailprogramme.
3. Supabase: **Edge Functions → Deploy a new function → Via Editor**, Name genau `mail`, Inhalt von [`functions/mail/index.ts`](functions/mail/index.ts) → **Deploy**. Falls „Invalid JWT“ kommt: **Verify JWT** ausschalten (die Funktion prüft die Anmeldung selbst).
4. **Edge Functions → Secrets**:
   - `SMTP_HOST` = Postausgangsserver, **genau so geschrieben wie beim Hoster** (sonst passt das Sicherheitszertifikat nicht)
   - `SMTP_PORT` = `465`
   - `SMTP_USER` = Benutzername des Postfachs
   - `SMTP_PASS` = Passwort des Postfachs
   - `MAIL_FROM` = die E-Mail-Adresse des Postfachs (nur nötig, wenn der Benutzername keine E-Mail-Adresse ist)
   > Das Passwort **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis.
5. In der App unter **Firma** deine E-Mail-Adresse eintragen – dorthin gehen die Antworten deiner Kunden.

Gut zu wissen: Supabase erlaubt keine Verbindungen über die Ports 25 und 587 – deshalb Port 465. Die verschickten E-Mails stehen nicht im „Gesendet“-Ordner deines Webmailers, sondern im Versandprotokoll in Lunaxora (am Dokument: „Direkt verschickt am … an …“).

### Weg B: über Resend

1. Auf [resend.com](https://resend.com) ein Konto anlegen.
2. **Domains → Add Domain**: deine Domain eintragen (Region am besten Ireland/eu-west-1) und die angezeigten DNS-Einträge bei deinem Domain-Anbieter setzen → **Verify**.
3. **API Keys → Create API Key** (Zugriff „Sending“) und kopieren – er beginnt mit `re_`.
   > Den Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis.
4. Funktion `mail` einspielen wie in Weg A, Schritt 3.
5. **Edge Functions → Secrets**: `RESEND_API_KEY` = dein Schlüssel, `MAIL_FROM` = Absender-Adresse auf deiner Domain (z. B. `angebote@deine-domain.de`).
6. In der App unter **Firma** deine E-Mail-Adresse eintragen.

Ist `SMTP_HOST` gesetzt, nimmt Lunaxora Weg A.

Zum Schutz: höchstens 3 Empfänger pro E-Mail, nur PDFs als Anhang, höchstens 20 E-Mails pro Stunde und 100 pro Tag. Jede verschickte E-Mail steht im Versandprotokoll.

## 11. Steuern

**Finanzen → Steuer-Topf** (bzw. `/finanzen/steuern`): wie viel du ungefähr zurücklegen solltest (Prozent vom Gewinn, wählbar 15–35 %), wo du bei der Kleinunternehmer-Grenze stehst (25.000 € Vorjahr / 100.000 € laufendes Jahr) bzw. – ohne Kleinunternehmerregelung – die geschätzte Umsatzsteuer. Für die Steuerberatung gibt es alles als ZIP: Jahresübersicht (PDF), Rechnungen und Ausgaben als Excel-taugliche CSV-Listen und alle Belege.

Einrichtung: Datenbank-Skript `20261114090000_tax.sql` ausführen (Abschnitt 3). Ohne das Skript funktioniert die Seite trotzdem – nur der gewählte Prozentsatz und die Umsatzsteuer bei Ausgaben werden nicht gespeichert.

Gut zu wissen: Alle Zahlen sind eine grobe Orientierung aus deinen Aufträgen und Ausgaben, keine Steuerberatung. Einnahmen zählen ab „Abgeschlossen“ (wie in Finanzen), nicht ab Zahlungseingang.

## 12. Abo (Gratis / Pro)

Nach dem Skript `20261116090000_plans.sql` bekommt jeder Nutzer beim nächsten Öffnen **14 Tage Pro gratis** (auch bestehende Nutzer). Danach gilt **Gratis**: 20 Luna-Nachrichten und 5 ausgelesene Belege im Monat, PDFs mit dem kleinen Hinweis „Erstellt mit Lunaxora“. **Pro** (9,99 €/Monat): bis 300 Nachrichten/Belege, E-Mails direkt aus Lunaxora, Angebote online annehmen lassen, 1. und letzte Mahnung, Steuer-Export als ZIP, TikTok/Instagram verbinden, Kalender-Abo. Übersicht in der App: **Profil → Abo**.

Einrichtung:

1. Datenbank-Skript `20261116090000_plans.sql` ausführen (Abschnitt 3).
2. Die Server-Funktionen `assistant` und `mail` neu einspielen (Abschnitt 4 bzw. 10) – sie zählen bzw. prüfen das Abo. Ohne neue Version gilt dort einfach keine Grenze.

**Dich selbst (oder Tester) dauerhaft auf Pro stellen** – im SQL Editor, E-Mail-Adresse anpassen:

```sql
insert into public.subscriptions (user_id, status, source)
select id, 'active', 'manual' from auth.users where email = 'deine@mail.de'
on conflict (user_id) do update set status = 'active', source = 'manual', current_period_end = null;
```

Zurück auf Gratis: `update public.subscriptions set status = 'expired' where user_id = (select id from auth.users where email = 'deine@mail.de');`

Bezahlen in der App (App Store, Google Play, Karte) kommt als nächster Schritt – dann setzt der Bezahldienst diese Einträge automatisch.

## 13. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key, Anthropic-API-Schlüssel (`sk-ant-…`), Groq-Schlüssel (`gsk_…`), TikTok-Client-Secret und Instagram-App-Geheimcode – diese Schlüssel nur als Supabase-Geheimnis.
