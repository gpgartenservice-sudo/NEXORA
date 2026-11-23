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
| `20261116090000_plans.sql` | Abo: 14 Tage Pro-Test, danach Gratis; Pro-Funktionen (Online-Angebote, Mahnungen, Kalender-Abo) werden in der Datenbank geprüft |
| `20261117090000_plan_tiers.sql` | Abo-Stufen Gratis / Pro / Business: neue Grenzen je Monat (Luna-Nachrichten, Belege, Vorlesen) und Spalte `tier` für Business |
| `20261118090000_billing.sql` | Bezahlen mit Stripe: Spalten `stripe_customer_id` und `stripe_subscription_id` im Abo (Abschnitt 14) |
| `20261119090000_customer_invites.sql` | Neue Kunden per Datenschutz-Link: Einladungen (E-Mail + geheimer Link), Kundenseite ohne Anmeldung, Nachweis der bestätigten Datenschutzerklärung am Kunden (Abschnitt 15) |
| `20261120090000_feinschliff.sql` | Feinschliff: eigene Branche, Rechtsform + Pflichtangaben, Gutscheine (20 Codes für die Warteliste: `select code from public.vouchers where note = 'Warteliste'`), ein Gerät gleichzeitig, Business-Team (bis 5 Personen, gemeinsame Daten), Inventar, Termine „draußen“ |
| `20261121090000_kosten.sql` | Kosten pro Konto: jede Luna-Nachricht, jeder Beleg, jedes Vorlesen und jede Spracheingabe mit Verbrauch; Übersicht `kosten.pro_konto` (Abschnitt 16) |
| `20261122090000_einnahmen.sql` | Einnahmen pro Konto neben den Kosten: Zahlungen (`kosten.zahlungen`), Abo-Wert pro Monat und Gewinn in `kosten.pro_konto` / `kosten.pro_kunde` (Abschnitt 16) |
| `20261123090000_lagerbestand.sql` | Lagerbestand (vorher Inventar): Art Gerät/Produkt, Einheit, Menge mit Komma, Mindestbestand („Wird knapp“), Verkaufspreis, `inventory_adjust()` für +/− |

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

**Kosten:** Standardmäßig nutzt Luna **Claude Sonnet 5.5** – grob 2–3 Cent pro Nachricht, Folgenachrichten innerhalb von 5 Minuten sind dank Cache günstiger. Die Abo-Preise sind darauf gerechnet. Ein Geheimnis `ASSISTANT_MODEL` überschreibt das Modell (z. B. `claude-opus-5-5`: gründlicher, etwa doppelt so teuer – dann passen die Abo-Preise nicht mehr; `claude-haiku-5-5`: ein Bruchteil eines Cents, bei kniffligen Fragen weniger genau). Den Verbrauch jeder Anfrage siehst du unter Edge Functions → assistant → Logs (Zeilen `usage`). Gründlicher (langsamer, teurer) antwortet Luna mit `ASSISTANT_EFFORT` = `medium`.

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
   1. Beim Hoster die Domain (z. B. `lunaxora.de`) mit einem eigenen Ordner verbinden, z. B. `/home/www/lunaxora.de`, und **SSL/HTTPS einschalten** („Let’s Encrypt“).
   2. Im Projektordner `bash scripts/web-hochladen.sh` ausführen. Das Skript baut `dist-angebot/index.html` aus [`web-angebot/index.html`](../web-angebot/index.html) (setzt Supabase-Adresse und Publishable Key aus der `.env` ein) und lädt sie per SFTP in den Unterordner `Angebot` (aus `EXPO_PUBLIC_WEB_URL`, legt ihn bei Bedarf an). Beim ersten Mal fragt es Server, Benutzer und den Ordner der Domain ab, das Passwort jedes Mal. In den Hauptordner lädt es nie.
      Ohne Skript: im Ordner der Domain einen Ordner `Angebot` anlegen (Groß-/Kleinschreibung wie in `EXPO_PUBLIC_WEB_URL`) und `dist-angebot/index.html` per Dateimanager des Hosters dort hinein hochladen.
   3. Test: `https://lunaxora.de/Angebot/` öffnen – „Angebot ansehen“ erscheint.
3. Die Adresse in die `.env` der App eintragen (steht schon drin):
   ```
   EXPO_PUBLIC_WEB_URL=https://lunaxora.de/Angebot
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

## 12. Abo (Gratis / Pro / Business)

Nach dem Skript `20261116090000_plans.sql` bekommt jeder Nutzer beim nächsten Öffnen **14 Tage Pro gratis** (auch bestehende Nutzer). Danach gilt **Gratis** – außer es gibt ein bezahltes Abo. Übersicht in der App: **Profil → Abo**.

| Abo | Preis | Luna-Nachrichten | Belege auslesen | Vorlesen* |
|---|---|---|---|---|
| Gratis | 0 € | 15 | 3 | 30 |
| Testphase (14 Tage) | – | 50 | 20 | 70 |
| Pro | 23,99 €/Monat oder 239,90 €/Jahr | 100 | 50 | 120 |
| Business | 29,99 €/Monat oder 299 €/Jahr | 200 | 150 | 220 |

\* je Monat; einmal Vorlesen = ein Abschnitt bis 400 Zeichen (etwa eine kurze Antwort).

Pro, Business und die Testphase haben alle Pro-Funktionen: E-Mails direkt aus Lunaxora, Angebote online annehmen lassen, 1. und letzte Mahnung, Steuer-Export als ZIP, TikTok verbinden, Kalender-Abo, PDFs ohne „Erstellt mit Lunaxora“. Die Grenzen stehen in `nexora_limit()` (Skript `20261117090000_plan_tiers.sql`) und in `LIMITS` in `src/features/plan/plan-logic.ts` – ein Test prüft, dass beide gleich sind.

Einrichtung:

1. Datenbank-Skripte `20261116090000_plans.sql` und `20261117090000_plan_tiers.sql` ausführen (Abschnitt 3).
2. Die Server-Funktionen `assistant` und `mail` neu einspielen (Abschnitt 4 bzw. 10) – sie zählen bzw. prüfen das Abo. Ohne neue Version gilt dort einfach keine Grenze.

**Dich selbst (oder Tester) dauerhaft auf Pro stellen** – im SQL Editor, E-Mail-Adresse anpassen (für Business `'pro'` durch `'business'` ersetzen):

```sql
insert into public.subscriptions (user_id, status, source, tier)
select id, 'active', 'manual', 'pro' from auth.users where email = 'deine@mail.de'
on conflict (user_id) do update set status = 'active', source = 'manual', tier = excluded.tier, current_period_end = null;
```

Zurück auf Gratis: `update public.subscriptions set status = 'expired' where user_id = (select id from auth.users where email = 'deine@mail.de');`

Bezahlt wird über **Stripe** (Abschnitt 14) – Stripe meldet jede Änderung an die Server-Funktion `billing`, die diese Einträge dann automatisch setzt. In den Handy-Apps (iPhone/Android) sind die Bezahl-Knöpfe ausgeblendet: Apple und Google verlangen dort ihre eigenen In-App-Käufe – das kommt mit der Veröffentlichung in den Stores.

## 13. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## 14. Bezahlen mit Stripe

Auf **Profil → Abo** (Web-App und Mac-App) wählt man Monatlich/Jährlich und tippt **Pro holen** bzw. **Business holen**. Die Bezahlseite von Stripe öffnet sich im Browser (Karte, SEPA-Lastschrift, Apple Pay, Google Pay, PayPal – je nachdem, was du in Stripe einschaltest). Nach der Zahlung meldet Stripe das Abo an die Server-Funktion `billing`, die es in die Tabelle `subscriptions` einträgt; die App lädt es neu, sobald man zurückkommt. Mit **Abo verwalten oder kündigen** öffnet sich das Stripe-Kundenportal (kündigen, Pro ↔ Business wechseln, Zahlungsart ändern, Rechnungen herunterladen). Rechnungen und Belege verschickt Stripe selbst per E-Mail.

> Erst alles im **Testmodus** (Sandbox) von Stripe einrichten und testen – dort fließt kein echtes Geld. Für echte Zahlungen dieselben Schritte danach im **Live-Modus** wiederholen (Schritt 7).

**1. Stripe-Konto**

1. Auf [stripe.com](https://stripe.com) ein Konto anlegen und die Geschäftsdaten ausfüllen (Name, Anschrift, Bankkonto für Auszahlungen).
2. **Settings → Business → Public details:** Name „Lunaxora“, Support-E-Mail, Webseite `https://lunaxora.de` – das sehen Kunden auf der Bezahlseite und der Rechnung.
3. **Kleinunternehmer:** **Stripe Tax nicht einschalten** und keine Steuersätze anlegen. Unter **Settings → Billing → Invoices** in die Fußzeile (Default footer) schreiben: `Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.` – dann steht der Satz auf jeder Rechnung.
4. **Settings → Payment methods:** die Zahlarten einschalten, die du anbieten willst (Karte ist immer dabei; SEPA-Lastschrift, PayPal, Apple Pay, Google Pay empfohlen).

**2. Produkte und Preise**

**Product catalog → Add product** – zwei Produkte mit je zwei Preisen (wiederkehrend, Währung EUR). Den **Lookup key** findest du beim Preis unter den erweiterten Optionen („More options“ / „Advanced“) – er muss genau so heißen, daran findet die App den Preis:

| Produkt | Preis | Abrechnung | Lookup key |
|---|---|---|---|
| Lunaxora Pro | 23,99 € | monatlich | `pro_month` |
| Lunaxora Pro | 239,90 € | jährlich | `pro_year` |
| Lunaxora Business | 29,99 € | monatlich | `business_month` |
| Lunaxora Business | 299,00 € | jährlich | `business_year` |

Preis ändern: in Stripe einen neuen Preis anlegen und den Lookup key mit „Transfer lookup key“ übernehmen – bestehende Abos behalten ihren alten Preis. Dann auch `PRICES` in `src/features/plan/plan-logic.ts` anpassen (Anzeige in der App).

**3. Kundenportal**

**Settings → Billing → Customer portal** → aktivieren und einstellen:

- **Cancel subscriptions:** an, „At end of billing period“ (Pro bleibt bis zum Ende der bezahlten Zeit).
- **Switch plans:** an – beide Produkte mit allen vier Preisen hinzufügen (so geht der Wechsel Pro ↔ Business und Monat ↔ Jahr).
- **Update payment methods** und **Invoice history:** an.
- Unten Datenschutz- und AGB-Link eintragen → **Save**.

Unter **Settings → Billing → Subscriptions and emails** einschalten, dass Kunden Rechnungen und Zahlungsbelege per E-Mail bekommen (und eine Erinnerung vor der Verlängerung von Jahresabos).

**4. Datenbank und Server-Funktion**

1. Datenbank-Skript `20261118090000_billing.sql` ausführen (Abschnitt 3).
2. **Edge Functions → Deploy a new function → Via Editor**, Name genau `billing`, Inhalt von [`functions/billing/index.ts`](functions/billing/index.ts) einfügen → **Deploy**.
3. In den Einstellungen der Funktion **Verify JWT** (bzw. „Enforce JWT Verification“) **ausschalten** – Pflicht, denn Stripe meldet sich nicht bei Lunaxora an. Die Funktion prüft Stripes Meldungen über die Signatur und bei allem anderen selbst, ob ein angemeldeter Nutzer fragt.

**5. Webhook (Stripe meldet Zahlungen an Lunaxora)**

1. In Stripe **Developers → Webhooks** (bzw. **Workbench → Webhooks**) → **Add destination / Add endpoint**.
2. Adresse:

   ```
   https://DEIN-PROJEKT.supabase.co/functions/v1/billing/webhook
   ```

3. Ereignisse auswählen: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` (Einnahmen je Kunde, Abschnitt 16) → speichern.
4. Das **Signing secret** des Endpunkts kopieren (beginnt mit `whsec_`).

**6. Schlüssel als Geheimnisse in Supabase** (**Edge Functions → Secrets**)

| Name | Wert |
|---|---|
| `STRIPE_SECRET_KEY` | **Developers → API keys → Secret key** (`sk_test_…` im Testmodus, später `sk_live_…`). Noch sicherer: ein *Restricted key* mit Schreibrecht für Customers, Checkout Sessions und Customer portal sowie Leserecht für Prices und Subscriptions. |
| `STRIPE_WEBHOOK_SECRET` | das Signing secret aus Schritt 5 (`whsec_…`) |

> Beide Schlüssel **niemals** in die App, ins Repository oder in einen Chat – nur als Supabase-Geheimnis.

**Testen:** In der Web-App (`npm run web`) oder Mac-App **Profil → Abo → Pro holen** → auf der Stripe-Seite die Testkarte `4242 4242 4242 4242`, ein beliebiges Datum in der Zukunft und eine beliebige Prüfnummer eingeben → **Abonnieren**. Zurück in Lunaxora steht oben „Pro“ mit Laufzeitende. Danach **Abo verwalten oder kündigen** → kündigen → in der App steht „Gekündigt – läuft noch bis …“. Klappt etwas nicht: in Stripe beim Webhook unter **Event deliveries** nachsehen und in Supabase die Logs der Funktion `billing` öffnen.

**7. Live schalten (echtes Geld)**

1. In Stripe oben vom Test- in den **Live-Modus** wechseln. Produkte/Preise (mit denselben Lookup keys), Kundenportal und Webhook dort noch einmal anlegen – der Live-Webhook hat ein eigenes `whsec_…`.
2. In Supabase `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` durch die Live-Werte ersetzen.
3. Vorher die rechtlichen Seiten fertig haben (AGB, Widerrufsbelehrung mit Zustimmung zum sofortigen Start, Kündigungsbutton, Datenschutz mit Stripe als Zahlungsdienstleister).

Tester, die in der Testphase von Hand auf Pro gestellt wurden (Abschnitt 12), sind von Stripe unberührt – die Funktion ändert nur Einträge, die zu einem Stripe-Abo gehören bzw. von Stripe gemeldet werden.

## 15. Neue Kunden per Datenschutz-Link

Neue Kunden entstehen in Lunaxora nur noch über den Kunden selbst: Unter **Kunden → Neuen Kunden einladen** gibt der Nutzer nur die E-Mail-Adresse ein und tippt **Datenschutzerklärung schicken**. Der Kunde bekommt eine E-Mail mit einem Link auf `https://lunaxora.de/Kunde/?einladung=…`, trägt dort Name, Anschrift und (optional) Firma und Telefon ein und bestätigt die Datenschutzerklärung. Erst beim Abschicken entsteht der Kunde – mit Zeitpunkt der Bestätigung und welcher Datenschutzerklärung (eigener Link oder Muster). Bis dahin speichert Lunaxora nur die E-Mail-Adresse; offene Links stehen in der Kundenliste unter „Wartet auf Daten“ (erneut senden oder löschen). Ein Link gilt 30 Tage.

Die Datenschutzerklärung auf der Kundenseite ist entweder der eigene Link aus **Firma → Datenschutz** oder – ohne Link – die Standard-Datenschutzerklärung von Lunaxora ([`web-kunde/datenschutz.html`](../web-kunde/datenschutz.html), liegt als `https://lunaxora.de/Kunde/datenschutz.html` neben dem Formular). Sie trägt Name, Anschrift und E-Mail aus den Firmendaten als Verantwortlichen ein (die müssen dann ausgefüllt sein) und nennt Lunaxora und die Dienstleister (Supabase, webgo, Anthropic, Groq, ElevenLabs) als Auftragsverarbeiter. Ändert sich an den Dienstleistern etwas, den Text dort anpassen. Muster, keine Rechtsberatung.

Der Datenschutz-Link geht in **jedem Abo** (auch Gratis) – er läuft über dieselbe Funktion `mail` wie Abschnitt 10, die Grenzen (20 pro Stunde, 100 pro Tag) gelten mit. Empfänger und Text legt die Funktion selbst fest, die App kann darüber also keine beliebigen E-Mails verschicken.

Einrichtung:

1. Datenbank-Skript `20261119090000_customer_invites.sql` ausführen (Abschnitt 3).
2. Funktion `mail` neu einspielen: **Edge Functions → mail → Code** → Inhalt von [`functions/mail/index.ts`](functions/mail/index.ts) komplett ersetzen → **Deploy**. Die Secrets aus Abschnitt 10 bleiben. Optional: Secret `INVITE_URL`, falls die Kundenseite woanders liegt (Standard `https://lunaxora.de/Kunde`).
3. Funktion `assistant` genauso neu einspielen ([`functions/assistant/index.ts`](functions/assistant/index.ts)) – damit Luna nach der E-Mail-Adresse fragt, statt Kunden direkt anzulegen.
4. **Kundenseite ins Internet stellen** (nur eine einzige Datei, wie die Angebotsseite in Abschnitt 9):
   Am einfachsten: `bash scripts/web-hochladen.sh kunde` – baut beide Dateien und lädt sie per SFTP in den Ordner `Kunde` (wie bei der Angebotsseite, fragt das Passwort ab). Ohne Skript:
   1. Im Projektordner `bash scripts/web-kunde-bauen.sh` ausführen. Das Skript baut `dist-kunde/index.html` (Formular) und `dist-kunde/datenschutz.html` (Standard-Datenschutzerklärung) aus dem Ordner [`web-kunde/`](../web-kunde) (setzt Supabase-Adresse und Publishable Key aus der `.env` ein).
   2. Beim Hoster im Ordner der Domain `lunaxora.de` einen Ordner `Kunde` anlegen (großes K, wie in der E-Mail) und beide Dateien dort hineinladen – in den Hauptordner nie, dort liegt die Homepage.
   3. Test: `https://lunaxora.de/Kunde/` öffnen – „Bitte öffnen Sie den Link aus Ihrer E-Mail“ erscheint (ohne Link aus einer E-Mail ist das richtig).
5. In der App unter **Firma** Name, Anschrift und E-Mail eintragen oder den Link zur eigenen Datenschutzerklärung.

Testen: **Kunden → Neuen Kunden einladen** → eigene zweite E-Mail-Adresse eintragen → **Datenschutzerklärung schicken** → in der E-Mail auf den Link → Daten eintragen, Haken setzen, **Daten absenden** → in der App unter **Kunden** erscheint der neue Kunde (Liste neu öffnen).

Ändert sich etwas an der Kundenseite oder der Datenschutzerklärung (`web-kunde/`), Schritt 4 wiederholen.

## 16. Kosten und Einnahmen pro Konto

Die Funktion `assistant` speichert bei jeder bezahlten Anfrage, was sie verbraucht hat – Luna-Nachrichten und Belege (Claude: Tokens), Vorlesen (ElevenLabs: Zeichen) und Sprache → Text (Groq: Sekunden) – zusammen mit dem Konto. Die Preise rechnet die Datenbank beim Ansehen aus der Preisliste aus.

Einrichtung:

1. Datenbank-Skripte `20261121090000_kosten.sql` und danach `20261122090000_einnahmen.sql` ausführen (Abschnitt 3).
2. Funktion `assistant` neu einspielen: **Edge Functions → assistant → Code** → Inhalt von [`functions/assistant/index.ts`](functions/assistant/index.ts) komplett ersetzen → **Deploy**. Neue Secrets braucht es nicht (`SUPABASE_SERVICE_ROLE_KEY` stellt Supabase selbst bereit). Gezählt wird ab dann – frühere Anfragen fehlen.
3. **ElevenLabs-Preis anpassen** (der eingetragene ist nur geschätzt): **SQL Editor** →
   `update kosten.preise set usd_1000_zeichen = 0.11 where modell = 'eleven_v4_turbo';`
   mit deinem Wert = Tarifpreis in $ ÷ Credits im Tarif × Credits pro Zeichen × 1000. Den Dollarkurs genauso: `update kosten.einstellungen set eur_pro_usd = 0.86;`

Ansehen: **Table Editor** → oben links Schema **kosten** wählen, oder im **SQL Editor**:

| Abfrage | Zeigt |
|---|---|
| `select * from kosten.pro_konto;` | jedes Konto: Abo, Einnahmen, Kosten und Gewinn (Monat / Vormonat / gesamt in €), Abo-Wert pro Monat, Luna-Nachrichten, Belege, Vorlese-Zeichen und Sprach-Minuten diesen Monat |
| `select * from kosten.pro_kunde;` | wie oben, Business-Teams (Inhaber + Mitglieder) zusammengerechnet |
| `select * from kosten.zahlungen order by bezahlt_am desc;` | jede eingegangene Zahlung |
| `select * from kosten.pro_monat;` | je Monat, Konto und Art |
| `select * from kosten.einzeln;` | jede einzelne Anfrage mit Preis |

**Einnahmen:** `einnahmen_…` = was wirklich eingegangen ist. Stripe trägt jede bezahlte Rechnung selbst ein – dafür muss der Webhook (Abschnitt 14) auch `invoice.paid` melden und `billing` neu eingespielt sein. Zahlungen von Hand (z. B. Überweisung):
`insert into kosten.zahlungen (user_id, betrag_eur, intervall, stufe, beschreibung) values ((select id from auth.users where email = 'kunde@beispiel.de'), 23.99, 'month', 'pro', 'Überweisung');`
`abo_wert_monat_eur` = was ein laufendes, bezahltes Abo pro Monat bringt (Jahresabo ÷ 12; Testphase und Gutscheine 0 €), Preise in `kosten.abo_preise`. `gewinn_monat_eur` = Abo-Wert − Kosten diesen Monat, `gewinn_gesamt_eur` = alle Einnahmen − alle Kosten. Stripe-Gebühren sind nicht abgezogen.

Ändert ein Anbieter seine Preise, die Zeile in `kosten.preise` anpassen – alle Übersichten rechnen sofort mit dem neuen Preis. Ein neues Modell (z. B. über das Secret `ASSISTANT_MODEL`) braucht eine eigene Zeile; bis dahin zählt `anfragen_ohne_preis` in `kosten.pro_konto` mit.

Das Schema `kosten` ist über die App-API nicht erreichbar – Nutzer sehen weder eigene noch fremde Kosten und Einnahmen, nur im Dashboard sind sie sichtbar. Wird ein Konto gelöscht, verschwinden seine Einträge mit.

## 17. Rechtstexte und Kündigungsbutton („Verträge hier kündigen“)

Vor dem Start Pflicht: Datenschutzerklärung der App, AGB, AV-Vertrag und der Kündigungsbutton nach § 312k BGB.

- **Texte:** `web-recht/datenschutz.html`, `web-recht/agb.html`, `web-recht/avv.html` → auf lunaxora.de in den Ordner `App/`
  (`bash scripts/web-hochladen.sh recht` oder von Hand). Vor dem Start von einer Anwältin / einem Anwalt prüfen lassen.
- **Registrierung:** Ohne Häkchen bei „Ich stimme den AGB und dem AV-Vertrag zu“ kein Konto. Fassung und Zeitpunkt
  stehen am Konto (Authentication → Users → User Metadata: `terms_version`, `terms_accepted_at`).
  Neue Fassung der Texte → `TERMS_VERSION` in `src/features/legal/legal-logic.ts` hochsetzen.
- **App:** Profil → Rechtliches (Verträge hier kündigen, AGB, Datenschutz, AV-Vertrag, Impressum) und Profil → Abo
  („Verträge hier kündigen“).
- **Widerrufsfunktion** (§ 356a BGB, seit 19.06.2026 Pflicht): dieselbe Seite mit `?widerrufen`
  (lunaxora.de/kuendigen/?widerrufen, „Vertrag widerrufen“ → „Widerruf bestätigen“), in der App unter Profil → Rechtliches
  und Profil → Abo. Nach einem Widerruf (effect `withdrawal`): prüfen, ob die 14 Tage noch liefen, dann Abo beenden und
  Geld zurück (Stripe → Zahlung → Erstatten), abzüglich Wertersatz, falls der Kunde den sofortigen Beginn verlangt hat.
- **Kündigungsseite** lunaxora.de/kuendigen/ (Quelle `web-kuendigen/`), ohne Anmeldung:
  1. Skript `20261205090000_kuendigung.sql` im SQL Editor ausführen.
  2. Funktion `mail` neu einspielen (kind `cancellation`). Optional Secret `CANCEL_COPY_TO`
     (Kopie jeder Kündigung, Standard `kontakt@lunaxora.de`).
  3. Seite hochladen: `bash scripts/web-hochladen.sh kuendigen` (setzt Supabase-Adresse und Publishable Key ein,
     lädt `index.html` und `.htaccess` hoch).
- **Was nach einer Kündigung zu tun ist** (vorerst von Hand): Die Kopie kommt an kontakt@lunaxora.de.
  Stripe-Abo: Stripe-Dashboard → Kunde → Abo → „Abo kündigen“ → „Am Ende des aktuellen Zeitraums“.
  Danach in Supabase markieren:
  ```sql
  update public.contract_cancellations set done_at = now() where email = 'kunde@example.com' and done_at is null;
  ```
  Offene Kündigungen ansehen:
  ```sql
  select received_at, name, email, contract, kind, effect, ends_on, mailed_at from public.contract_cancellations
   where done_at is null order by received_at;
  ```
  Abos aus App Store / Google Play kündigt der Kunde selbst im Store; die Bestätigung sagt ihm, wo.
  „Ganzes Konto“: erst löschen, wenn der Kunde das per Antwort auf die Bestätigung bestätigt hat
  (am einfachsten löscht er es selbst in der App, Abschnitt 18; sonst „Von Hand löschen“ dort).

## 18. Konto in der App löschen (App Store 5.1.1(v))

Apple verlangt: Wer in der App ein Konto anlegen kann, muss es dort auch löschen können. In der App:
**Profil → Konto → „Konto löschen“** (`src/features/account/`). Die Seite zeigt, was gelöscht wird, erinnert an den
Export (Finanzen → Steuern → „Alles als ZIP“), warnt bei laufendem Abo und bei Teams und verlangt zur Bestätigung die
E-Mail-Adresse des Kontos. Danach meldet sie ab und zeigt „Konto gelöscht“.

**Einrichten (einmalig):**
1. Skript [`migrations/20261206090000_konto_loeschen.sql`](migrations/20261206090000_konto_loeschen.sql) im SQL Editor
   ausführen (Voraussetzung: alle Skripte bis `20261205090000_kuendigung.sql`).
2. **Edge Functions → Deploy a new function → Via Editor**, Name genau `account`, Inhalt von
   [`functions/account/index.ts`](functions/account/index.ts) → **Deploy**. In den Einstellungen der Funktion
   **Verify JWT** ausschalten (die Funktion prüft die Anmeldung selbst). Keine eigenen Secrets nötig.
3. Funktion `billing` neu einspielen (Stripe-Meldungen zu gelöschten Konten werden jetzt bestätigt statt
   tagelang wiederholt).

**Was beim Löschen passiert** (Funktion `account`, `mode: "delete"`):
1. Prüfen: angemeldet, E-Mail richtig abgetippt, **kein laufendes Stripe-Abo**. Läuft eins (nicht gekündigt), bricht
   sie mit `subscription_active` ab – sonst würde Stripe weiter abbuchen. Die App bietet dann das Stripe-Kundenportal
   („Im Kundenportal kündigen“, wirkt sofort) und „Verträge hier kündigen“ an. Ein gekündigtes Abo, das noch bis zum
   Zeitraumende läuft, hält nicht auf (es endet dann sofort, ohne Erstattung – AGB § 13).
   Abos aus App Store / Google Play halten auch nicht auf; die App sagt, dass man sie im Store kündigen muss.
2. `account_delete_prepare`: Abo noch einmal prüfen, Kündigung „Mein ganzes LUNAXORA-Konto“ als erledigt markieren,
   Einträge zum Missbrauchsschutz löschen, Kalender-Links der Teams, in denen die Person Mitglied war, ungültig machen
   (wie beim Entfernen aus dem Team), Besitz an Dateien im Speicher lösen.
3. TikTok-Zugang bei TikTok zurückziehen (über die Funktion `social`, nur wenn verbunden; Fehler halten nicht auf).
4. Alle Belege im Speicher `receipts` der eigenen Firmen löschen (Ordner = Firmen-ID; erste Firma und weitere).
5. Konto über die Auth-Admin-API löschen. Den Rest löscht die Datenbank selbst (`on delete cascade`): Profil,
   Abo-Eintrag, Kontingent, Geräte, Push-Tokens, TikTok/Instagram, alle eigenen Firmen mit Kunden, Aufträgen,
   Rechnungen, Finanzen, Terminen, Kalender-Link, Logo, To-dos, Lager, Social und deren Teams.

**Was bleibt:**
- **Unsere Rechnungen an den Kunden** liegen bei Stripe und bleiben dort (Aufbewahrungspflicht). Der Stripe-Kunde
  wird nicht gelöscht.
- **Einnahmen und Kosten** (`kosten.zahlungen`, `kosten.nutzung`) bleiben für unsere Buchhaltung, nur ohne Konto-ID.
- **Kündigungen** (`contract_cancellations`) bleiben als Nachweis, ohne Konto-ID.
- **Löscht ein Teammitglied sein Konto**, bleiben seine Stunden, Abwesenheiten, Einsätze und Chat-Nachrichten bei der
  Firma (die Firma ist dafür verantwortlich, z. B. für die Lohnabrechnung) – die App zeigt „Ehemaliges Mitglied“.
  Belege, die es in der Firma hochgeladen hat, bleiben ebenfalls bei der Firma.
- **Löscht der Inhaber**, verlieren alle Teammitglieder den Zugang; ihre eigenen Konten bleiben.

**Von Hand löschen** (Kunde hat per E-Mail oder Kündigungsseite gebeten und bestätigt):
1. Läuft ein Stripe-Abo: erst in Stripe kündigen.
2. SQL Editor (aufräumen, gibt die Firmen-IDs zurück):
   ```sql
   select public.account_delete_prepare(id) from auth.users where email = 'kunde@example.com';
   ```
3. Storage → `receipts` → die Ordner mit diesen Firmen-IDs löschen.
4. Authentication → Users → Nutzer → **Delete user**.

**Prüfen nach dem Einrichten** (ohne etwas zu löschen):
```sql
select proname from pg_proc where proname in ('account_deletion_info', 'account_delete_prepare');   -- 2 Zeilen
select public.account_deletion_info(id) from auth.users where email = 'du@example.com';           -- was passieren würde
```

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key, Anthropic-API-Schlüssel (`sk-ant-…`), Groq-Schlüssel (`gsk_…`), Stripe-Secret-Key (`sk_live_…`/`sk_test_…`/`rk_…`) und Webhook-Secret (`whsec_…`), TikTok-Client-Secret und Instagram-App-Geheimcode – diese Schlüssel nur als Supabase-Geheimnis.
