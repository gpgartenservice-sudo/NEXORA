#!/bin/bash
# =====================================================================
#  Lunaxora – Kundenseite „Ihre Kontaktdaten“ + Standard-Datenschutzerklärung
#  fertig machen (Hochladen: bash scripts/web-hochladen.sh kunde)
#
#  Aufruf (im Projektordner):   bash scripts/web-kunde-bauen.sh
#
#  Nimmt web-kunde/index.html, setzt die öffentliche Supabase-Adresse und den
#  Publishable Key aus der .env ein und legt das Ergebnis in
#  dist-kunde/index.html ab. Diese Datei kommt auf dem Webspace in den Ordner
#  /Kunde/ von lunaxora.de (webgo: Dateimanager -> lunaxora.de -> Ordner
#  "Kunde" anlegen -> index.html hochladen). Die Links in den E-Mails lauten
#  https://lunaxora.de/Kunde/?einladung=… (Server-Funktion "mail", INVITE_URL).
# =====================================================================
set -u
cd "$(dirname "$0")/.." || exit 1
grn() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
SB_URL="$(envval EXPO_PUBLIC_SUPABASE_URL)"
SB_KEY="$(envval EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
printf '%s' "$SB_URL" | grep -Eq '^https://[A-Za-z0-9.-]+$' || { red "EXPO_PUBLIC_SUPABASE_URL fehlt oder ist ungültig in der .env."; exit 1; }
printf '%s' "$SB_KEY" | grep -Eq '^[A-Za-z0-9._-]+$' || { red "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt oder ist ungültig in der .env."; exit 1; }
mkdir -p dist-kunde
for F in index.html datenschutz.html; do
    sed -e "s|%%SUPABASE_URL%%|$SB_URL|g" -e "s|%%SUPABASE_KEY%%|$SB_KEY|g" "web-kunde/$F" > "dist-kunde/$F"
    if grep -q '%%SUPABASE_' "dist-kunde/$F"; then red "Platzhalter in $F nicht ersetzt."; exit 1; fi
done
grn "Fertig: dist-kunde/index.html und dist-kunde/datenschutz.html  →  auf lunaxora.de in den Ordner /Kunde/ hochladen"
