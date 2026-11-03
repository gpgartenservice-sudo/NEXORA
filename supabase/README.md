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

Ein Skript versehentlich zweimal auszuführen schadet nicht.

## 4. Nexy (KI-Assistent) einrichten

Nexy schickt deine Nachricht – zusammen mit dem bisherigen Gespräch und einer kurzen Übersicht deiner Kunden (nur Namen), Aufträge, offenen Rechnungen und Zahlen – an **Claude** (Anthropic). Zurück kommen eine Antwort, ggf. eine Rückfrage und Vorschläge: Kunden, Aufträge, Ausgaben, Post-Ideen, Angebote/Rechnungen als PDF, Einkommensnachweis, Rechnung als bezahlt markieren. Das passiert in einer kleinen **Server-Funktion** bei Supabase, damit der API-Schlüssel nie in der App steht. Die Funktion speichert nichts; gespeichert wird erst, wenn du in der App bestätigst.

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

**Datenschutz:** Nachricht, Gesprächsverlauf und die Übersicht (Kundennamen ohne Telefon/E-Mail/Anschrift, Aufträge, Rechnungsnummern und Beträge, Finanzzahlen) werden zur Auswertung an Anthropic übertragen. Das gehört später in die Datenschutzerklärung.

## 5. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key, Anthropic-API-Schlüssel (`sk-ant-…`, nur als Supabase-Geheimnis).
