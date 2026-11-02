import { isAuthError } from '@supabase/supabase-js';

/** Übersetzt Fehler von Supabase in verständliche deutsche Meldungen. */
export function authErrorMessage(error: unknown): string {
  if (!isAuthError(error)) {
    console.warn('[Supabase]', error);
    return `Etwas ist schiefgelaufen. Bitte versuch es gleich noch einmal.\n\nTechnische Details: ${String(error)}`;
  }

  switch (error.code) {
    case 'invalid_credentials':
      return 'E-Mail oder Passwort stimmt nicht.';
    case 'email_not_confirmed':
      return 'Deine E-Mail-Adresse ist noch nicht bestätigt.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Mit dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich einfach an.';
    case 'weak_password':
      return 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen, am besten mit Zahlen und Sonderzeichen.';
    case 'same_password':
      return 'Das neue Passwort muss sich vom alten unterscheiden.';
    case 'otp_expired':
      return 'Der Code ist abgelaufen oder falsch. Fordere einfach einen neuen an.';
    case 'email_address_invalid':
      return 'Diese E-Mail-Adresse wird nicht akzeptiert.';
    case 'over_email_send_rate_limit':
      return 'Es wurden gerade zu viele E-Mails verschickt. Bitte warte ein paar Minuten.';
    case 'over_request_rate_limit':
      return 'Zu viele Versuche. Bitte warte kurz und versuch es dann erneut.';
    case 'signup_disabled':
      return 'Registrierungen sind gerade deaktiviert.';
    case 'user_not_found':
      return 'Zu dieser E-Mail-Adresse gibt es kein Konto.';
  }

  // Unerwartete Fehler: technische Details anhängen, damit sich die Ursache finden lässt
  console.warn('[Supabase]', error);
  const detail = `\n\nTechnische Details: ${error.name}${error.status ? ` (${error.status})` : ''}${error.code ? ` [${error.code}]` : ''} – ${error.message}`;
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.' + detail;
  }
  return 'Etwas ist schiefgelaufen. Bitte versuch es gleich noch einmal.' + detail;
}
