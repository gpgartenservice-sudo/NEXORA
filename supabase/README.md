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

Ein Skript versehentlich zweimal auszuführen schadet nicht.

## 4. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key.
