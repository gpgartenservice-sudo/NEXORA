/**
 * Dokumente der Firma (Gewerbeanmeldung, ELSTER-Zertifikat, Versicherungen, Verträge …) –
 * reine Logik ohne App/Netz, mit Unit-Tests. Die Regeln prüft die Datenbank
 * (Skript 20261207090000_dokumente.sql): nur Inhaber und Mitgründer, höchstens 20 MB je Datei.
 */

/** Erlaubte Dateien: Endung im Speicher -> Typ */
export const VAULT_MIMES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
  pfx: 'application/x-pkcs12',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;
export type VaultExt = keyof typeof VAULT_MIMES;
export type VaultMime = (typeof VAULT_MIMES)[VaultExt];

/** Höchstgröße je Datei (wie im Speicher eingestellt) */
export const MAX_VAULT_BYTES = 20 * 1024 * 1024;
/** Höchstens so viele Dokumente je Firma */
export const MAX_VAULT_FILES = 500;
/** Ab so vielen Tagen vor Ablauf: „läuft bald ab“ */
export const SOON_DAYS = 60;

export type VaultCategory = 'gewerbe' | 'finanzamt' | 'versicherung' | 'vertrag' | 'bank' | 'nachweis' | 'sonstiges';

export const VAULT_CATEGORIES: { key: VaultCategory; label: string; hint: string }[] = [
  { key: 'gewerbe', label: 'Gewerbe', hint: 'Gewerbeanmeldung, Gewerbeschein, Handwerkskarte, Handelsregister' },
  { key: 'finanzamt', label: 'Finanzamt & ELSTER', hint: 'ELSTER-Zertifikat, Aktivierungsbrief, Steuernummer, Bescheide' },
  { key: 'versicherung', label: 'Versicherungen', hint: 'Betriebshaftpflicht, Berufsgenossenschaft, Krankenkasse' },
  { key: 'vertrag', label: 'Verträge', hint: 'Gesellschaftsvertrag, Miete, Leasing, Lieferanten' },
  { key: 'bank', label: 'Bank', hint: 'Geschäftskonto, Kredit, Kartenverträge' },
  { key: 'nachweis', label: 'Nachweise & Genehmigungen', hint: 'Meisterbrief, Zertifikate, Genehmigungen, Führerschein' },
  { key: 'sonstiges', label: 'Sonstiges', hint: 'Alles andere, was du griffbereit haben willst' },
];
export const CATEGORY_LABEL = Object.fromEntries(VAULT_CATEGORIES.map((c) => [c.key, c.label])) as Record<VaultCategory, string>;
export const isCategory = (v: unknown): v is VaultCategory => VAULT_CATEGORIES.some((c) => c.key === v);

/** Hinweis beim ELSTER-Zertifikat */
export const ELSTER_HINT =
  'Leg hier dein ELSTER-Zertifikat (.pfx) und den Aktivierungsbrief ab. Das Passwort zum Zertifikat speicherst du bitte nicht in Lunaxora – merk es dir oder nutz einen Passwort-Manager. Das Zertifikat gilt 3 Jahre: Trag „Gültig bis“ ein, dann siehst du rechtzeitig, wann du es verlängern musst.';

export const VAULT_UNSUPPORTED =
  'Diese Datei kann ich nicht ablegen. Erlaubt sind PDF, Fotos (JPG, PNG, HEIC), das ELSTER-Zertifikat (.pfx, .p12) sowie Word- und Excel-Dateien (.docx, .xlsx).';
export const VAULT_TOO_BIG = 'Die Datei ist zu groß (höchstens 20 MB).';

/** Fehler mit Text für die Anzeige */
export class VaultError extends Error {}

export type VaultFile = {
  id: string;
  user_id: string;
  category: VaultCategory;
  title: string;
  note: string | null;
  /** "JJJJ-MM-TT" oder null */
  valid_until: string | null;
  file_path: string;
  file_name: string;
  mime: VaultMime;
  size_bytes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Was der Nutzer am Dokument einträgt */
export type VaultMeta = { title: string; category: VaultCategory; note: string | null; valid_until: string | null };

/** Art der Datei: Bilder werden vor dem Hochladen verkleinert (-> JPG) */
export type VaultKind = 'pdf' | 'image' | 'pfx' | 'docx' | 'xlsx';

const EXT_KIND: Record<string, VaultKind> = {
  pdf: 'pdf',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  heic: 'image',
  heif: 'image',
  webp: 'image',
  pfx: 'pfx',
  p12: 'pfx',
  docx: 'docx',
  xlsx: 'xlsx',
};

/** Art aus Dateiname und Typ des Systems; null = nicht erlaubt */
export function vaultKind(name: string, mime: string | null | undefined): VaultKind | null {
  const m = (mime ?? '').toLowerCase().split(';')[0].trim();
  const ext = /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';
  if (m === VAULT_MIMES.pdf) return 'pdf';
  if (m === 'image/svg+xml') return null;
  if (m.startsWith('image/')) return 'image';
  if (m === VAULT_MIMES.pfx || m === 'application/pkcs12') return 'pfx';
  if (m === VAULT_MIMES.docx) return 'docx';
  if (m === VAULT_MIMES.xlsx) return 'xlsx';
  // Typ unbekannt (z. B. .pfx im Browser, „octet-stream“ am Handy): nach der Endung
  return EXT_KIND[ext] ?? null;
}

/** Endung im Speicher je Art (Bilder werden JPG) */
export const kindExt = (kind: VaultKind): VaultExt => (kind === 'image' ? 'jpg' : kind);

/** Speicherpfad: <Firmen-ID>/<Datei-ID>.<Endung> */
export const vaultPath = (companyId: string, fileId: string, ext: VaultExt) => `${companyId}/${fileId}.${ext}`;

/** Dateiname zum Speichern: Endung passend zum gespeicherten Typ */
export function downloadName(name: string, ext: VaultExt): string {
  const base = name.trim().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[/\\:*?"<>|]+/g, '_').slice(0, 150) || 'Dokument';
  return `${base}.${ext}`;
}

/** Vorschlag für den Titel aus dem Dateinamen („Gewerbeanmeldung_2026.pdf“ -> „Gewerbeanmeldung 2026“) */
export function suggestTitle(fileName: string): string {
  const t = fileName
    .trim()
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Fotos vom Handy heißen nur „IMG_1234“ – da hilft der Name nicht
  if (!t || /^(img|image|dsc|pxl|scan|photo|foto|bild)[\s\d–-]*$/i.test(t)) return '';
  return t.slice(0, 120);
}

/** Bereich aus dem Dateinamen raten (der Nutzer kann ihn ändern) */
export function guessCategory(fileName: string, kind: VaultKind | null): VaultCategory {
  const n = fileName.toLowerCase();
  if (kind === 'pfx' || /elster|finanzamt|steuer|\bust\b|bescheid/.test(n)) return 'finanzamt';
  if (/gewerbe|handwerk|handelsregister|hr-?auszug|registerauszug/.test(n)) return 'gewerbe';
  if (/versicher|haftpflicht|police|berufsgenoss|krankenkasse/.test(n)) return 'versicherung';
  if (/vertrag|miete|mietvert|leasing/.test(n)) return 'vertrag';
  if (/bank|konto|kredit|darlehen/.test(n)) return 'bank';
  if (/meister|zertifikat|genehmigung|f(ue|ü)hrerschein|nachweis|zeugnis|befähigung/.test(n)) return 'nachweis';
  return 'sonstiges';
}

const DAY = 24 * 60 * 60 * 1000;
const dayMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** "2029-11-23" -> "23.11.2029" */
export const germanDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export type Validity = { state: 'expired' | 'soon' | 'ok'; days: number };

/** Gültigkeit: abgelaufen, läuft bald ab (≤ 60 Tage) oder gültig; ohne Datum null */
export function validity(validUntil: string | null, today: string): Validity | null {
  if (!validDay(validUntil) || !validDay(today)) return null;
  const days = Math.round((dayMs(validUntil) - dayMs(today)) / DAY);
  return { state: days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'ok', days };
}

export function validityLabel(validUntil: string | null, today: string): string | null {
  const v = validity(validUntil, today);
  if (!v || !validUntil) return null;
  if (v.state === 'expired') return `Abgelaufen am ${germanDay(validUntil)}`;
  if (v.days === 0) return 'Läuft heute ab';
  if (v.days === 1) return 'Läuft morgen ab';
  if (v.state === 'soon') return `Läuft in ${v.days} Tagen ab`;
  return `Gültig bis ${germanDay(validUntil)}`;
}

/** Abgelaufene und bald ablaufende Dokumente – das dringendste zuerst */
export function dueFiles(files: VaultFile[], today: string): VaultFile[] {
  return files
    .filter((f) => {
      const v = validity(f.valid_until, today);
      return v && v.state !== 'ok';
    })
    .sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? ''));
}

/** Steht in der Notiz ein Passwort oder eine PIN? Dann warnen. */
export function secretWarning(text: string | null | undefined): string | null {
  if (!text) return null;
  return /pass(wort|word|wd)|kennwort|geheimzahl|\bpin\b|\bpuk\b|\bpw\s*[:=]/i.test(text)
    ? 'Bitte keine Passwörter oder PINs hier eintragen – die gehören in einen Passwort-Manager.'
    : null;
}

/** 820 -> "820 Byte", 84_000 -> "82 KB", 1_450_000 -> "1,4 MB" */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} Byte`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

export function kindLabel(mime: string): string {
  if (mime === VAULT_MIMES.pdf) return 'PDF';
  if (mime.startsWith('image/')) return 'Foto';
  if (mime === VAULT_MIMES.pfx) return 'Zertifikat';
  if (mime === VAULT_MIMES.docx) return 'Word';
  if (mime === VAULT_MIMES.xlsx) return 'Excel';
  return 'Datei';
}

/** PDF und Fotos lassen sich direkt ansehen; den Rest speichert man */
export const canView = (mime: string) => mime === VAULT_MIMES.pdf || mime.startsWith('image/');

/** Filter: Bereich + Suche (Titel, Dateiname, Notiz, Bereich) */
export function filterFiles(files: VaultFile[], category: VaultCategory | 'all', query: string): VaultFile[] {
  const q = query.trim().toLowerCase();
  return files.filter(
    (f) =>
      (category === 'all' || f.category === category) &&
      (!q || [f.title, f.file_name, f.note ?? '', CATEGORY_LABEL[f.category]].some((s) => s.toLowerCase().includes(q))),
  );
}

/** Nach Bereich gruppiert (Reihenfolge wie VAULT_CATEGORIES), darin das Neueste zuerst */
export function groupFiles(files: VaultFile[]): { category: VaultCategory; label: string; files: VaultFile[] }[] {
  return VAULT_CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    files: files.filter((f) => f.category === c.key).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })).filter((g) => g.files.length > 0);
}

export function categoryCounts(files: VaultFile[]): Record<VaultCategory, number> {
  const out = Object.fromEntries(VAULT_CATEGORIES.map((c) => [c.key, 0])) as Record<VaultCategory, number>;
  for (const f of files) out[f.category] += 1;
  return out;
}

/** Eingaben prüfen und für die Datenbank aufbereiten */
export function cleanMeta(meta: VaultMeta): { meta?: VaultMeta; error?: string } {
  const title = meta.title.replace(/\s+/g, ' ').trim();
  if (!title) return { error: 'Bitte gib dem Dokument einen Namen.' };
  if (title.length > 120) return { error: 'Der Name ist zu lang (höchstens 120 Zeichen).' };
  const note = meta.note?.trim() || null;
  if (note && note.length > 1000) return { error: 'Die Notiz ist zu lang (höchstens 1.000 Zeichen).' };
  if (!isCategory(meta.category)) return { error: 'Bitte wähle einen Bereich.' };
  if (meta.valid_until !== null && !validDay(meta.valid_until)) return { error: 'Das Datum „Gültig bis“ stimmt nicht.' };
  return { meta: { title, category: meta.category, note, valid_until: meta.valid_until } };
}

/** Zeile aus der Datenbank -> Dokument (unbekannter Bereich = Sonstiges) */
export function parseVaultFile(row: Record<string, unknown>): VaultFile {
  return {
    ...(row as unknown as VaultFile),
    category: isCategory(row.category) ? row.category : 'sonstiges',
    note: typeof row.note === 'string' && row.note ? row.note : null,
    valid_until: validDay(row.valid_until) ? row.valid_until : null,
    size_bytes: Number(row.size_bytes ?? 0),
  };
}

const SETUP =
  'Dokumente können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (20261207090000_dokumente.sql, siehe supabase/README.md).';

/** Fehler von Datenbank/Speicher -> Text für die Anzeige */
export function vaultErrorText(e: unknown): string {
  if (e instanceof VaultError) return e.message;
  const err = (e ?? {}) as { code?: string; message?: string; statusCode?: string | number };
  const msg = String(err.message ?? e ?? '');
  if (['PGRST205', '42P01', 'PGRST106'].includes(err.code ?? '') || /bucket not found/i.test(msg)) return SETUP;
  if (/files_limit/.test(msg)) return `Ihr habt schon ${MAX_VAULT_FILES} Dokumente abgelegt. Lösch alte, um Platz zu machen.`;
  if (/row-level security|permission denied|unauthorized|\b403\b/i.test(msg))
    return 'Dokumente sehen und ablegen können nur Inhaber und Mitgründer.';
  if (/mime_check|mime type .*not supported|invalid_mime_type/i.test(msg)) return VAULT_UNSUPPORTED;
  if (/size_check|maximum allowed size|payload too large|entity too large|\b413\b/i.test(msg)) return VAULT_TOO_BIG;
  if (/title_check/.test(msg)) return 'Bitte gib dem Dokument einen Namen (höchstens 120 Zeichen).';
  if (/note_check/.test(msg)) return 'Die Notiz ist zu lang (höchstens 1.000 Zeichen).';
  return `Das hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${msg || 'unbekannt'}`;
}
