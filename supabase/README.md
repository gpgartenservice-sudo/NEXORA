# Supabase einrichten (einmalig)

Projekt: `txifgiuxecaphmaucmdf` · Region Frankfurt · [Dashboard öffnen](https://supabase.com/dashboard/project/txifgiuxecaphmaucmdf)

Die App bestätigt E-Mail-Adressen und setzt Passwörter **per Code** zurück (statt per Link). Das funktioniert auf Mac, iPhone und Android gleich, ohne dass ein Link die richtige App öffnen muss. Dafür müssen die E-Mail-Vorlagen den Code enthalten.

## 1. E-Mail-Vorlagen (Pflicht)

Im Dashboard: **Authentication → Emails → Templates**

| Vorlage | Betreff | Inhalt (Message body) |
|---|---|---|
| **Confirm signup** | `Dein Bestätigungscode für NEXORA` | kompletten Inhalt von [`templates/confirm-signup.html`](templates/confirm-signup.html) einfügen |
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

Ein Skript versehentlich zweimal auszuführen schadet nicht.

## 4. Nexy (KI-Assistent) einrichten

Nexy schickt deine Nachricht – zusammen mit dem bisherigen Gespräch und einer kurzen Übersicht deiner Kunden (nur Namen), Aufträge, offenen Rechnungen und Zahlen – an **Claude** (Anthropic). Zurück kommen eine Antwort, ggf. eine Rückfrage und Vorschläge: Kunden, Aufträge, Ausgaben, Post-Ideen, Angebote/Rechnungen als PDF, Einkommensnachweis, Rechnung als bezahlt markieren, Termine (eigene anlegen, in Aufträge eintragen, verschieben, ändern, absagen). Das passiert in einer kleinen **Server-Funktion** bei Supabase, damit der API-Schlüssel nie in der App steht. Die Funktion speichert nichts; gespeichert wird erst, wenn du in der App bestätigst.

**1. API-Schlüssel holen**

1. Auf [console.anthropic.com](https://console.anthropic.com) anmelden bzw. registrieren.
2. Unter **Billing** etwas Guthaben aufladen (z. B. 5 €).
3. Unter **API Keys** → **Create Key** einen Schlüssel erstellen (Name z. B. `NEXORA`) und kopieren – er beginnt mit `sk-ant-`.

> Den Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis (Schritt 3).

**2. Server-Funktion anlegen**

1. Im Supabase-Dashboard links **Edge Functions** öffnen → **Deploy a new function** → **Via Editor**.
2. Als Namen genau `assistant` eintragen.
3. Den Beispiel-Code im Editor komplett löschen und den kompletten Inhalt von [`functions/assistant/index.ts`](functions/assistant/index.ts) einfügen.
4. **Deploy** klicken und warten, bis die Funktion als aktiv angezeigt wird.

**3. Schlüssel als Geheimnis speichern**

1. In **Edge Functions** den Bereich **Secrets** öffnen.
2. Neues Geheimnis: Name `ANTHROPIC_API_KEY`, Wert = dein Schlüssel → **Save**.

Fertig – in der App links **Nexy** öffnen und losschreiben.

**Neue Version der Funktion einspielen** (wenn sich `functions/assistant/index.ts` geändert hat): **Edge Functions → assistant → Code** öffnen, den Inhalt komplett durch die neue Datei ersetzen → **Deploy**. Die Geheimnisse bleiben erhalten.

**Falls es nicht klappt**

- Meldung „Server-Funktion „assistant“ fehlt“: Name in Schritt 2 genau `assistant` (klein geschrieben)?
- Meldung „Anmeldung abgelaufen“ bzw. in den Logs `Invalid JWT`: In den Einstellungen der Funktion **Verify JWT** (bzw. „Enforce JWT Verification“) ausschalten. Die Funktion prüft selbst, ob ein angemeldeter NEXORA-Nutzer anfragt.
- Fehler ansehen: **Edge Functions → assistant → Logs**.

**Kosten:** Standardmäßig nutzt Nexy **Claude Opus 5.5** – grob 2–4 Cent pro Nachricht (Gespräch und Übersicht werden jedes Mal mitgeschickt). Günstiger geht es mit einem zweiten Geheimnis `ASSISTANT_MODEL` = `claude-haiku-5-5` (ein Bruchteil eines Cents, bei kniffligen Fragen weniger genau). Gründlicher (langsamer, teurer) antwortet Nexy mit `ASSISTANT_EFFORT` = `medium`.

**Datenschutz:** Nachricht, Gesprächsverlauf und die Übersicht (Kundennamen ohne Telefon/E-Mail/Anschrift, Aufträge, Rechnungsnummern und Beträge, Finanzzahlen, Termine der nächsten Wochen mit Ort) werden zur Auswertung an Anthropic übertragen. Das gehört später in die Datenschutzerklärung.

### Sprachmodus (mit Nexy sprechen)

Im Eingabefeld von Nexy gibt es einen **Mikrofon-Knopf**. Dann hört Nexy zu, merkt an der Pause, wann du fertig bist, antwortet **laut** und hört danach wieder zu. Vorschläge bestätigst du mit „Ja“ (oder verwirfst sie mit „Nein“), „Stopp“ bzw. „Tschüss“ beendet den Sprachmodus.

Claude versteht keine Sprachaufnahmen. Die Umwandlung von Sprache in Text übernimmt deshalb **Groq** (Spracherkennung „Whisper“) – in derselben Server-Funktion `assistant`. Vorgelesen wird mit den Stimmen deines Mac bzw. Browsers (kostenlos).

**1. Groq-Schlüssel holen**

1. Auf [console.groq.com](https://console.groq.com) registrieren bzw. anmelden.
2. Links **API Keys** → **Create API Key** (Name z. B. `NEXORA`) und den Schlüssel kopieren – er beginnt mit `gsk_`.

> Auch diesen Schlüssel **niemals** in die App, ins Repository oder in einen Chat schreiben – nur in Supabase als Geheimnis.

**2. Als Geheimnis speichern:** **Edge Functions → Secrets** → Name `GROQ_API_KEY`, Wert = dein Schlüssel → **Save**.

**3. Neue Version der Funktion einspielen:** **Edge Functions → assistant → Code** → Inhalt komplett durch [`functions/assistant/index.ts`](functions/assistant/index.ts) ersetzen → **Deploy** (der Sprachmodus ist erst in der neuen Version drin).

**Mac-App:** Beim ersten Start des Sprachmodus fragt macOS, ob NEXORA das Mikrofon benutzen darf → **Erlauben**. Falls versehentlich abgelehnt: **Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon** → NEXORA einschalten (beim Start über `npm run mac` heißt der Eintrag „Terminal“ bzw. „Electron“) und die App neu starten.

**Schönere Stimme (Mac):** **Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte → Systemstimme → Stimmen verwalten …** → unter Deutsch z. B. **Anna (Premium)** oder **Petra (Premium)** laden. Nexy nimmt automatisch die beste deutsche Stimme.

**Falls es nicht klappt:** Die App zeigt einen Hinweis, was fehlt („GROQ_API_KEY fehlt“, „alte Version der Server-Funktion“, „Mikrofon blockiert“). Details stehen unter **Edge Functions → assistant → Logs**. Optional: Geheimnis `TRANSCRIBE_MODEL` = `whisper-large-v3` (etwas genauer, etwas langsamer als der Standard `whisper-large-v3-turbo`).

**Kosten:** Groq hat einen kostenlosen Einstieg mit Tageslimits; danach kostet die Spracherkennung nach Audio-Dauer nur einen Bruchteil eines Cents pro Nachricht (aktuelle Preise: groq.com/pricing). Dazu kommt wie beim Schreiben die Antwort von Claude.

**Datenschutz:** Die Sprachaufnahme wird nur zur Umwandlung in Text an Groq (USA) übertragen; NEXORA speichert sie nicht. Auch das gehört in die Datenschutzerklärung.

## 5. TikTok & Instagram verbinden

Im Bereich **Social Media → Konten** verbindest du deine Konten. Danach holt NEXORA Follower, Likes und die Zahlen jedes Videos bzw. Beitrags (beim Öffnen automatisch, wenn der Stand älter als 6 Stunden ist), ordnet neue Videos der passenden Idee im Content-Board zu und überträgt Aufrufe, Likes, Kommentare, Geteilt und Gespeichert in den Post. NEXORA bekommt **nur Lese-Rechte** und postet nichts.

Dafür brauchst du je Plattform eine (kostenlose) **Entwickler-App** – das ist der offizielle Weg, über den sich Nutzer bei TikTok bzw. Instagram anmelden. Die Zugangsdaten (Tokens) speichert die Server-Funktion **verschlüsselt** in der Datenbank.

**1. Datenbank-Skript** `20261108090000_social_accounts.sql` ausführen (siehe Abschnitt 3).

**2. Server-Funktion anlegen**

1. **Edge Functions → Deploy a new function → Via Editor**, Name genau `social`.
2. Den Beispiel-Code komplett durch den Inhalt von [`functions/social/index.ts`](functions/social/index.ts) ersetzen → **Deploy**.
3. In den Einstellungen der Funktion **Verify JWT** (bzw. „Enforce JWT Verification“) **ausschalten**. Das ist hier Pflicht: Nach der Anmeldung leitet TikTok/Instagram den Browser zur Funktion zurück – ohne NEXORA-Anmeldung. Die Funktion prüft bei allen anderen Anfragen selbst, ob ein angemeldeter Nutzer fragt.

Deine **Rückleitungs-Adresse** (brauchst du gleich bei TikTok und Instagram):

```
https://DEIN-PROJEKT.supabase.co/functions/v1/social/callback
```

`DEIN-PROJEKT` ist der Teil aus deiner Supabase-Adresse (`EXPO_PUBLIC_SUPABASE_URL` in `.env`).

**3. TikTok**

1. Auf [developers.tiktok.com](https://developers.tiktok.com) anmelden → **Manage apps** → vorhandene App öffnen oder **Connect an app** (neue App, z. B. „NEXORA“).
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
- Das Abo ist zum Lesen: Termine änderst du in NEXORA.
- Wer den Link kennt, sieht deine Termine (mit Kunden und Adressen). Bei Bedarf in der App **Neuen Link erzeugen** – der alte funktioniert dann sofort nicht mehr.
- Falls **Abo testen** „Schlüssel ungültig“ meldet: Geheimnis `NEXORA_PUBLISHABLE_KEY` = der Publishable Key aus der `.env` der App (der ist öffentlich und darf dort hin).

## 7. Zahlungserinnerungen, Mahnungen & Bewertungen

Dafür reicht das Datenbank-Skript `20261110090000_invoice_followups.sql` (Abschnitt 3) – keine Server-Funktion nötig.

- **Mahnen:** Ist eine Rechnung überfällig, erscheint **Mahnen** in Finanzen (offene Rechnungen), unter Termine → *Zu erledigen* und an der Rechnung im Auftrag. Die Stufen: **Zahlungserinnerung** (freundlich, ohne Gebühr) → **1. Mahnung** → **Letzte Mahnung**, jeweils mit neuer Frist (Vorschlag: 7 Tage) und bei den Mahnungen optional einer Mahngebühr. Das Schreiben gibt es als PDF im Briefkopf der Rechnung, per E-Mail oder WhatsApp mit fertigem Text. NEXORA merkt sich Stufe, Datum und Frist; die nächste Stufe ist erst nach Ablauf der Frist dran. Ein versehentlicher Vermerk lässt sich mit **Rückgängig** zurücknehmen.
- **Nach der letzten Mahnung** zeigt NEXORA den Weg zum gerichtlichen Mahnverfahren ([online-mahnantrag.de](https://www.online-mahnantrag.de)).
- **Bewertung:** Bei bezahlten Rechnungen gibt es **Bewertung** – eine kurze Bitte per E-Mail oder WhatsApp mit deinem Link. Den Link trägst du unter **Firma → Bewertungen** ein (z. B. bei Google: im Google-Unternehmensprofil die Funktion zum Anfordern von Rezensionen öffnen und den Link kopieren).
- Gebühren: Für eine Zahlungserinnerung keine, für Mahnungen nur die tatsächlichen Kosten (z. B. Porto – meist wenige Euro). Das ist kein Rechtsrat – bei größeren Beträgen lohnt eine kurze Beratung.

## 8. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key, Anthropic-API-Schlüssel (`sk-ant-…`), Groq-Schlüssel (`gsk_…`), TikTok-Client-Secret und Instagram-App-Geheimcode – diese Schlüssel nur als Supabase-Geheimnis.
