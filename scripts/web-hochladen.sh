#!/bin/bash
# =====================================================================
#  NEXORA – Angebotsseite (nur die Seite zum Annehmen, NICHT die App)
#  fertig machen und per SFTP in den Unterordner von nexoranexy.de hochladen
#
#  Aufruf (im Projektordner):   bash scripts/web-hochladen.sh
#
#  - Nimmt web-angebot/index.html, setzt die öffentliche Supabase-Adresse und
#    den Publishable Key aus der .env ein und legt das Ergebnis in
#    dist-angebot/index.html ab (die kannst du auch selbst hochladen).
#  - Der Unterordner kommt aus EXPO_PUBLIC_WEB_URL in der .env
#    (https://nexoranexy.de/angebot -> Ordner "angebot"). Direkt in den
#    Hauptordner lädt das Skript nie – dort liegt die NEXORA-Homepage.
#  - Fragt beim ersten Mal Server, Benutzer und den Ordner der Domain ab und
#    merkt sie sich in ~/.nexora-upload.conf (OHNE Passwort).
#  - Das Passwort fragt das Mac-Programm "sftp" selbst ab – es wird
#    nirgends gespeichert.
#  - Lädt nur in einen Ordner hoch, in dessen Pfad "nexora" vorkommt, damit
#    nie aus Versehen die Gartenservice-Seite überschrieben wird. Gibt es den
#    Ordner der Domain auf dem Server nicht, bricht sftp ab, ohne etwas zu
#    verändern; den Unterordner legt es bei Bedarf an.
# =====================================================================

set -u
cd "$(dirname "$0")/.." || exit 1
CONF="$HOME/.nexora-upload.conf"

grn() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# --- 1. Seite fertig machen ------------------------------------------------
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
SB_URL="$(envval EXPO_PUBLIC_SUPABASE_URL)"
SB_KEY="$(envval EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
printf '%s' "$SB_URL" | grep -Eq '^https://[A-Za-z0-9.-]+$' || { red "EXPO_PUBLIC_SUPABASE_URL fehlt oder ist ungültig in der .env."; exit 1; }
printf '%s' "$SB_KEY" | grep -Eq '^[A-Za-z0-9._-]+$' || { red "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlt oder ist ungültig in der .env."; exit 1; }

# Unterordner aus der Web-Adresse: https://nexoranexy.de/angebot -> angebot
WEB_URL="$(envval EXPO_PUBLIC_WEB_URL)"; WEB_URL="${WEB_URL%/}"
SUB="$(printf '%s' "$WEB_URL" | sed -E 's|^https://[^/]+/?||')"
printf '%s' "$SUB" | grep -Eq '^[A-Za-z0-9-]+$' || {
    red "EXPO_PUBLIC_WEB_URL in der .env muss auf einen Unterordner zeigen, z. B. https://nexoranexy.de/angebot"
    red "(jetzt: \"$WEB_URL\") – in den Hauptordner wird nie hochgeladen, dort liegt die Homepage."
    exit 1
}

mkdir -p dist-angebot
sed -e "s|%%SUPABASE_URL%%|$SB_URL|g" -e "s|%%SUPABASE_KEY%%|$SB_KEY|g" web-angebot/index.html > dist-angebot/index.html
if grep -q '%%SUPABASE_' dist-angebot/index.html; then red "Platzhalter nicht ersetzt – nichts hochgeladen."; exit 1; fi
grn "Fertig: dist-angebot/index.html"

# --- 2. Hochladen ----------------------------------------------------------
WEB_HOST=""; WEB_USER=""; WEB_DIR=""
[ -f "$CONF" ] && . "$CONF"
if [ -z "$WEB_HOST" ] || [ -z "$WEB_USER" ] || [ -z "$WEB_DIR" ]; then
    echo
    echo "Einmalige Einrichtung (steht im webgo-Kundenbereich unter FTP-/SSH-Zugänge):"
    read -r -p "  Server [s179.goserver.host]: " WEB_HOST
    WEB_HOST="${WEB_HOST:-s179.goserver.host}"
    read -r -p "  Benutzername: " WEB_USER
    echo "  Jetzt den Ordner, in dem deine HOMEPAGE liegt – nicht \"$SUB\", den hängt das Skript selbst an."
    read -r -p "  Ordner der Domain nexoranexy.de [/home/www/nexoranexy.de]: " WEB_DIR
    WEB_DIR="${WEB_DIR:-/home/www/nexoranexy.de}"
    WEB_DIR="/${WEB_DIR#/}"; WEB_DIR="${WEB_DIR%/}"
    case "$(printf '%s' "$WEB_DIR" | tr '[:upper:]' '[:lower:]')" in
        *nexora*) ;;
        *) red "\"$WEB_DIR\" ist nicht der Ordner der Domain (im Pfad muss \"nexora\" vorkommen, z. B. /home/www/nexoranexy.de)."
           red "Nichts gespeichert – einfach das Skript neu starten."
           exit 1 ;;
    esac
    printf 'WEB_HOST=%q\nWEB_USER=%q\nWEB_DIR=%q\n' "$WEB_HOST" "$WEB_USER" "$WEB_DIR" > "$CONF"
    chmod 600 "$CONF"
fi

case "$(printf '%s' "$WEB_DIR" | tr '[:upper:]' '[:lower:]')" in
    *nexora*) ;;
    *) red "Zielordner \"$WEB_DIR\" enthält nicht \"nexora\" – abgebrochen."
       red "Einstellungen ändern: rm ~/.nexora-upload.conf und das Skript neu starten."
       exit 1 ;;
esac

echo
echo "Ziel:  $WEB_USER@$WEB_HOST (SFTP)  →  $WEB_DIR/$SUB/index.html"
echo "       (die Homepage in $WEB_DIR bleibt unberührt)"
read -r -p "Hochladen? (j/n) " OK
[ "$OK" = "j" ] || [ "$OK" = "J" ] || { echo "Abgebrochen."; exit 0; }

BATCH="$(mktemp)"
trap 'rm -f "$BATCH"' EXIT
{
    # ohne "-": gibt es den Ordner der Domain nicht, bricht sftp hier ab
    echo "cd \"$WEB_DIR\""
    echo "-mkdir \"$SUB\""
    # ohne "-": klappt der Wechsel in den Unterordner nicht, wird nichts hochgeladen
    echo "cd \"$SUB\""
    echo "pwd"
    echo "lcd dist-angebot"
    echo "put index.html"
    echo "ls -l index.html"
} > "$BATCH"

echo
echo "Gleich fragt sftp nach dem Passwort (beim Tippen ist nichts zu sehen)."
if sftp -o BatchMode=no -o StrictHostKeyChecking=accept-new \
        -o PreferredAuthentications=keyboard-interactive,password \
        -b "$BATCH" "$WEB_USER@$WEB_HOST"; then
    echo
    grn "Fertig. Test: $WEB_URL/ im Browser öffnen."
else
    echo
    red "Hochladen fehlgeschlagen (siehe Meldung oben)."
    red "Häufigster Grund: Der Ordner $WEB_DIR existiert nicht oder dieser Benutzer darf nicht hinein."
    exit 1
fi
