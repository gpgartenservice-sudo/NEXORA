/**
 * Mehrere Firmen in einem Konto – reine Logik (ohne App/Netz, mit Unit-Tests).
 * Die Datenbank (Skript 20261127090000_mehrere_firmen.sql) entscheidet, wer welche Firma sehen
 * darf; die App merkt sich nur, welche gerade offen ist.
 */

export type Company = {
  id: string;
  name: string;
  /** erste Firma des Inhabers (gibt es seit der Anmeldung) */
  primary: boolean;
  role: 'owner' | 'member';
};

export type Companies = {
  /** Firma, die ohne Auswahl offen ist */
  defaultId: string;
  /** so viele weitere Firmen hat das Konto gebucht */
  extraAllowed: number;
  extraUsed: number;
  list: Company[];
};

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Antwort von my_companies() prüfen; null = unbrauchbar */
export function parseCompanies(raw: unknown): Companies | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.default_id !== 'string' || !Array.isArray(r.companies)) return null;
  const list: Company[] = [];
  for (const c of r.companies as Record<string, unknown>[]) {
    if (!c || typeof c.id !== 'string') continue;
    list.push({
      id: c.id,
      name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Firma ohne Namen',
      primary: c.primary === true,
      role: c.role === 'member' ? 'member' : 'owner',
    });
  }
  return { defaultId: r.default_id, extraAllowed: count(r.extra_allowed), extraUsed: count(r.extra_used), list };
}

/**
 * Welche Firma ist offen? Die gewünschte, solange man dazugehört – sonst die Standard-Firma.
 * Die Kopfzeile gibt es nur für eine andere als die Standard-Firma (so schicken Konten mit nur
 * einer Firma nie etwas mit). Ohne Liste (offline): die gewünschte, die Datenbank prüft ohnehin.
 */
export function chooseCompany(
  companies: Companies | null,
  wanted: string | null,
  fallback: string,
): { id: string; header: string | null } {
  if (!companies) return { id: wanted ?? fallback, header: wanted };
  const id = wanted && companies.list.some((c) => c.id === wanted) ? wanted : companies.defaultId;
  return { id, header: id === companies.defaultId ? null : id };
}

/** Noch eine gebuchte Firma frei? */
export const canAddCompany = (c: Companies | null) => !!c && c.extraUsed < c.extraAllowed;

const ERRORS: Record<string, string> = {
  invalid_name: 'Bitte gib der Firma einen Namen (höchstens 120 Zeichen).',
  company_limit: 'Für eine weitere Firma muss sie zuerst zu deinem Abo dazugebucht werden.',
};

export function companyErrorText(message: string): string {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : `Das hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${message}`;
}
