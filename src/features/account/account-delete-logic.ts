/**
 * Konto löschen (Profil → Konto → „Konto löschen“): Texte und Prüfungen ohne Netz.
 * Die Server-Funktion "account" (supabase/functions/account) liefert die Infos und löscht.
 */

/** Antwort von { mode: "check" } */
export type DeletionInfo = {
  email?: string | null;
  blocked?: 'subscription_active' | null;
  subscription: {
    status: string;
    source: string;
    tier: string | null;
    current_period_end: string | null;
    /** Stripe-Abo läuft und ist nicht gekündigt -> erst kündigen */
    running: boolean;
    /** Abo über App Store / Google Play */
    store: boolean;
    /** Kündigung über lunaxora.de/kuendigen/ eingegangen, noch nicht eingetragen */
    cancel_pending: boolean;
  } | null;
  companies: { id: string; name: string | null; primary: boolean; members: number }[];
  /** so viele Personen verlieren den Zugang zu deinen Firmen */
  team_people: number;
  /** Teams anderer Firmen, in denen du Mitglied bist */
  memberships: { company_id: string; name: string | null }[];
};

export type DeletionNote = {
  key: 'subscription' | 'paid_period' | 'store' | 'team_owner' | 'member';
  tone: 'error' | 'info';
  title: string;
  text: string;
};

/** Wer keine E-Mail-Adresse hat, tippt dieses Wort (wie in der Server-Funktion) */
export const CONFIRM_WORD = 'LÖSCHEN';

const TIER: Record<string, string> = { pro: 'Pro', business: 'Business', teams: 'Teams' };
const tierName = (tier: string | null | undefined) => TIER[tier ?? ''] ?? 'Pro';

/** „20.12.2026“ (deutsche Zeit) */
export function dateDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);
}

/** Hat der Nutzer die E-Mail seines Kontos richtig abgetippt? (gleiche Regel wie auf dem Server) */
export function confirmOk(typed: string, email: string | null | undefined): boolean {
  const t = typed.normalize('NFC').trim().toLowerCase();
  const expected = ((email ?? '').trim() || CONFIRM_WORD).normalize('NFC').toLowerCase();
  return t.length > 0 && t === expected;
}

/** Firmennamen lesbar aufzählen: „A“, „A und B“, „A, B und C“ */
export function nameList(names: (string | null | undefined)[], fallback = 'eine Firma'): string {
  const n = names.map((x) => (x ?? '').trim() || fallback);
  if (n.length <= 1) return n[0] ?? fallback;
  return `${n.slice(0, -1).join(', ')} und ${n[n.length - 1]}`;
}

/** Was endgültig gelöscht wird – immer gleich, nur die Firmen hängen vom Konto ab */
export function deletedItems(info: Pick<DeletionInfo, 'companies'> | null): string[] {
  const companies = info?.companies ?? [];
  const firms =
    companies.length > 1
      ? `Alle ${companies.length} Firmen (${nameList(companies.map((c) => c.name))})`
      : companies.length === 1 && companies[0].name
        ? `Deine Firma „${companies[0].name.trim()}“`
        : 'Deine Firma';
  return [
    `${firms} mit Kunden, Aufträgen, Angeboten, Rechnungen, Finanzen, Belegen, Terminen, Lager, To-dos und Social-Beiträgen.`,
    'Dein Profil, deine Anmeldung, Geräte, Push-Mitteilungen und der Kalender-Link.',
    'Verbindungen zu TikTok und Instagram.',
  ];
}

/** Hinweise je nach Konto: Abo, Team, Mitgliedschaften */
export function deletionNotes(info: DeletionInfo | null, now = Date.now()): DeletionNote[] {
  if (!info) return [];
  const notes: DeletionNote[] = [];
  const s = info.subscription;
  const end = s?.current_period_end ? Date.parse(s.current_period_end) : null;

  if (s?.running) {
    notes.push({
      key: 'subscription',
      tone: 'error',
      title: `Dein ${tierName(s.tier)}-Abo läuft noch`,
      text: s.cancel_pending
        ? 'Deine Kündigung ist bei uns eingegangen, aber noch nicht bei Stripe eingetragen. Schneller geht es im Kundenportal: dort kündigen, dann kannst du hier sofort löschen.'
        : 'Kündige es zuerst – sonst würde Stripe weiter abbuchen. Danach kannst du dein Konto hier sofort löschen.',
    });
  } else if (s && s.source === 'stripe' && s.status === 'canceled' && end && end > now) {
    notes.push({
      key: 'paid_period',
      tone: 'info',
      title: `Dein ${tierName(s.tier)}-Abo ist gekündigt`,
      text: `Es läuft noch bis ${dateDe(s.current_period_end)}. Löschst du dein Konto jetzt, endet es sofort – den Rest des bezahlten Zeitraums erstatten wir nicht (AGB § 13).`,
    });
  }

  if (s?.store) {
    notes.push({
      key: 'store',
      tone: 'error',
      title: 'Abo im App Store bzw. bei Google Play',
      text: 'Das Löschen beendet dieses Abo nicht. Kündige es in den Abo-Einstellungen deines Geräts (iPhone: Einstellungen > dein Name > Abonnements) – sonst wird weiter abgebucht.',
    });
  }

  if (info.team_people > 0) {
    const n = info.team_people;
    notes.push({
      key: 'team_owner',
      tone: 'error',
      title: n === 1 ? '1 Person verliert den Zugang' : `${n} Personen verlieren den Zugang`,
      text: `${n === 1 ? 'Die Person in deinem Team kommt' : 'Die Personen in deinem Team kommen'} nicht mehr an deine Firmen. Ihre eigenen Konten bleiben. Arbeitsstunden, Abwesenheiten, Arbeitsplan und Team-Chats deiner Firmen werden mitgelöscht – lade die Stunden vorher als CSV herunter (Team → Stunden).`,
    });
  }

  if (info.memberships.length > 0) {
    const names = nameList(info.memberships.map((m) => m.name));
    notes.push({
      key: 'member',
      tone: 'info',
      title: info.memberships.length === 1 ? `Du verlässt das Team von ${names}` : `Du verlässt die Teams von ${names}`,
      text: 'Die Firma bleibt bestehen. Was du dort eingetragen hast – Stunden, Abwesenheiten, Einsätze und Chat-Nachrichten – bleibt bei der Firma, weil sie es z. B. für die Lohnabrechnung braucht. Fragen dazu klärst du mit der Firma.',
    });
  }
  return notes;
}

/** Fehlertexte der Server-Funktion "account" */
export function deleteErrorText(code: string | undefined, status: number, detail?: string): string {
  const parts = [status ? String(status) : '', code ?? '', detail ? `– ${detail}` : ''].filter(Boolean);
  const tech = parts.length ? `\n\nTechnische Details: ${parts.join(' ')}` : '';
  const fallback =
    'Du kannst dein Konto auch per E-Mail an kontakt@lunaxora.de oder auf lunaxora.de/kuendigen/ („Mein ganzes LUNAXORA-Konto“) löschen lassen.';
  switch (code) {
    case 'confirm_mismatch':
      return 'Die E-Mail-Adresse passt nicht zu deinem Konto. Tippe sie genau so ein, wie sie oben steht.';
    case 'subscription_active':
      return 'Dein Abo läuft noch. Kündige es zuerst, dann kannst du dein Konto löschen.';
    case 'not_signed_in':
      return 'Deine Anmeldung ist abgelaufen. Melde dich neu an und versuch es noch einmal.';
    case 'user_not_found':
      return 'Dieses Konto gibt es nicht mehr – es wurde schon gelöscht.';
    case 'offline':
      return `Der Server antwortet nicht. Prüfe deine Internetverbindung und versuch es noch einmal.\n\n${fallback}`;
    case 'setup_missing':
    case 'not_configured':
      return `Das Löschen in der App ist gerade nicht erreichbar.\n\n${fallback}${tech}`;
    default:
      if (status === 401) return deleteErrorText('not_signed_in', status);
      if (status === 404) return deleteErrorText('setup_missing', status, detail ?? 'Funktion „account“ fehlt');
      return `Das Löschen hat gerade nicht geklappt. Versuch es gleich noch einmal.\n\n${fallback}${tech}`;
  }
}
