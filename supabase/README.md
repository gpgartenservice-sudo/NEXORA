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

## 3. Wichtig zum Testen: E-Mail-Versand

Ohne eigenen E-Mail-Server verschickt Supabase nur **sehr wenige E-Mails pro Stunde** und **nur an Adressen von Mitgliedern eures Supabase-Teams**. Zum Testen also mit der E-Mail-Adresse registrieren, mit der ihr bei Supabase angemeldet seid.

Vor dem Start mit echten Nutzern braucht ihr einen eigenen Versand (**Authentication → Emails → SMTP Settings**), z. B. über einen Anbieter wie Resend oder das Postfach eurer Domain.

## Sicherheit

- In der App steht nur der **Publishable Key** (`.env`). Der ist öffentlich und darf in die App.
- **Niemals** in die App oder ins Repository: Datenbank-Passwort, `secret`- bzw. `service_role`-Key.
