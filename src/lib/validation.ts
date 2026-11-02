const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | undefined {
  return EMAIL_PATTERN.test(email.trim()) ? undefined : 'Bitte gib eine gültige E-Mail-Adresse ein.';
}

export function validateNewPassword(password: string): string | undefined {
  return password.length >= MIN_PASSWORD_LENGTH
    ? undefined
    : `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
}

/** Bestätigungscodes per E-Mail haben 6–10 Ziffern (in Supabase einstellbar). */
export function validateCode(code: string): string | undefined {
  return /^\d{6,10}$/.test(code) ? undefined : 'Bitte gib den Code aus der E-Mail ein.';
}
