/** E-Mail-Adressen – reine Logik (mit Unit-Tests) */

/** Mehrere Adressen erlaubt (Komma/Semikolon) */
export function splitRecipients(to: string): string[] {
  return to
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export const validEmail = (v: string) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(v);
