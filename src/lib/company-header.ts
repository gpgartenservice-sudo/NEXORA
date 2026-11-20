/**
 * Mehrere Firmen in einem Konto (Skript 20261127090000_mehrere_firmen.sql): Die App sagt der
 * Datenbank mit dieser Kopfzeile, welche Firma gerade offen ist. Ohne Kopfzeile gilt die
 * Standard-Firma – darum wird sie nur geschickt, wenn eine andere Firma offen ist.
 */
export const COMPANY_HEADER = 'x-lunaxora-company';

let current: string | null = null;

export function setCompanyHeader(id: string | null) {
  current = id;
}

export function companyHeader(): string | null {
  return current;
}

/** Nur Datenbank und Server-Funktionen brauchen die Firma (Anmeldung und Speicher nicht) */
const NEEDS_COMPANY = /\/(rest|functions)\/v1\//;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** fetch für den Supabase-Client: hängt die offene Firma an */
export const companyFetch: typeof fetch = (input, init) => {
  const id = current;
  if (!id || !NEEDS_COMPANY.test(urlOf(input))) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(COMPANY_HEADER, id);
  return fetch(input, { ...init, headers });
};
