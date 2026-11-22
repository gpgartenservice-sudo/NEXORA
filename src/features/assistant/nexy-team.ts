/**
 * Was Luna über das Team weiß (Business/Teams) – reine Logik mit Unit-Tests:
 * wer dabei ist, was der Nutzer darf, ungelesene Chats, offene Anträge (mit
 * Kurzzeichen U1, U2 … zum Entscheiden), das eigene Urlaubskonto – und welche
 * Bereiche Luna gar nicht erst mitgeschickt bekommt, weil der Nutzer sie nicht sehen darf.
 */
import { AREAS, ROLE_LABEL, isEmployer, type Access, type Area, type EditableRole, type MemberRole } from '../team/roles';
import {
  directPartner,
  KIND_LABEL,
  rangeLabel,
  unseenSickNotes,
  vacationAccount,
  workingDays,
  type Absence,
  type ChatKey,
  type ChatSummary,
} from '../team/staff-logic';

export type TeamPerson = {
  id: string;
  name: string;
  role: MemberRole;
  title?: string | null;
  vacation_days?: number | null;
};

/** Was Luna zum Ausführen über das Team wissen muss (aus App-Daten, nicht von der KI) */
export type TeamKnown = {
  me: string;
  role: MemberRole;
  /** Arbeitsplan, Urlaub genehmigen, Stunden aller (Recht „Personal“) */
  hr: boolean;
  /** To-dos anlegen und verteilen (Recht „To-dos & Ziele“ bearbeiten) */
  canTodo: boolean;
  members: TeamPerson[];
  /** Rechte der Rollen (nur Inhaber/Mitgründer) */
  roles?: Record<EditableRole, Access>;
  /** Anträge/Krankmeldungen, die Luna als U1, U2 … kennt */
  absences?: Absence[];
  absenceRefs?: Record<string, string>;
};

export const teamDarf = (t: Pick<TeamKnown, 'role' | 'hr' | 'canTodo'>) => ({
  todos_verteilen: t.canTodo,
  team_verwalten: isEmployer(t.role),
  leitung_chat: isEmployer(t.role),
  personal: t.hr,
  mitgruender_ernennen: t.role === 'inhaber',
});

const norm = (s: string) =>
  s
    .toLowerCase()
    // „Krüger“ = „Krueger“
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const SELF = /^(ich|mich|mir|selbst|selber|me|du|dich)$/;

/**
 * Person aus dem Team zu einem genannten Namen: voller Name, Vorname oder Anfang
 * (nur wenn eindeutig). "ich"/"mich" = man selbst.
 */
export function matchMember<T extends { id: string; name: string }>(
  name: string | null | undefined,
  members: T[],
  me: string,
): T | null {
  const n = name ? norm(name) : '';
  if (!n) return null;
  if (SELF.test(n)) return members.find((m) => m.id === me) ?? null;
  const only = (list: T[]) => (list.length === 1 ? list[0] : null);
  return (
    only(members.filter((m) => norm(m.name) === n)) ??
    // Vorname („Anna“) oder Nachname („Berg“)
    only(members.filter((m) => norm(m.name).split(' ').includes(n))) ??
    only(members.filter((m) => norm(m.name).startsWith(n)))
  );
}

/** Chat zu "alle" | "leitung" | "direkt" + Person */
export function chatFor(
  chat: string | null | undefined,
  person: string | null | undefined,
  members: TeamPerson[],
  me: string,
): { key: ChatKey; label: string } | { error: string } {
  const c = chat ? norm(chat) : '';
  if (c === 'alle' || c === 'team' || c === 'all') return { key: 'alle', label: 'Alle im Team' };
  if (c === 'leitung') return { key: 'leitung', label: 'Leitung' };
  const m = matchMember(person ?? (c && c !== 'direkt' ? chat : null), members, me);
  if (!m) return { error: person ? `${person} gibt es im Team nicht.` : 'Für wen ist die Nachricht?' };
  if (m.id === me) return { error: 'Eine Nachricht an dich selbst geht nicht.' };
  return { key: `direkt:${m.id}`, label: m.name };
}

const short = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Team-Block für <daten> + Kurzzeichen der Anträge (U1 …) */
export function nexyTeam(input: {
  team: TeamKnown;
  chats?: ChatSummary[];
  absences?: Absence[];
  invites?: number;
  today: string;
}): { context: Record<string, unknown>; absences: Absence[]; absenceRefs: Record<string, string> } {
  const { team, chats = [], absences = [], today } = input;
  const nameOf = (id: string) => (id === team.me ? 'du' : (team.members.find((m) => m.id === id)?.name ?? 'Ehemaliges Mitglied'));
  const darf = teamDarf(team);
  const year = Number(today.slice(0, 4));

  // Leitung: offene Anträge und neue Krankmeldungen mit Kurzzeichen
  const open = team.hr ? absences.filter((a) => a.status === 'offen' && a.member_id !== team.me) : [];
  const sick = team.hr ? unseenSickNotes(absences, team.me, today) : [];
  const listed = [...open, ...sick].slice(0, 20);
  const refs = Object.fromEntries(listed.map((a, i) => [`U${i + 1}`, a.id])) as Record<string, string>;
  const refOf = (a: Absence) => `U${listed.indexOf(a) + 1}`;

  const me = team.members.find((m) => m.id === team.me);
  const account = me?.vacation_days != null ? vacationAccount(absences, team.me, me.vacation_days, year, today) : null;

  const chatName = (key: ChatKey) =>
    key === 'alle' ? 'Alle im Team' : key === 'leitung' ? 'Leitung' : `direkt mit ${nameOf(directPartner(key) ?? '')}`;

  const context: Record<string, unknown> = {
    du_bist: ROLE_LABEL[team.role],
    darf,
    mitglieder: team.members.map((m) => ({
      name: m.name,
      rolle: ROLE_LABEL[m.role],
      ...(m.id === team.me ? { das_bist_du: true } : {}),
      ...(m.title ? { bezeichnung: m.title } : {}),
      ...((darf.team_verwalten || team.hr) && m.vacation_days != null ? { urlaubstage: m.vacation_days } : {}),
    })),
    ...(darf.team_verwalten && team.roles
      ? {
          rechte: Object.fromEntries(
            (Object.keys(team.roles) as EditableRole[]).map((r) => [
              r,
              Object.fromEntries(AREAS.map((a) => [a.key, team.roles![r][a.key]])),
            ]),
          ),
        }
      : {}),
    ...(darf.team_verwalten && input.invites ? { einladungen_offen: input.invites } : {}),
    chats: chats
      .filter((c) => c.at)
      .slice(0, 12)
      .map((c) => ({
        chat: chatName(c.chat),
        ungelesen: c.unread,
        zuletzt: `${nameOf(c.sender_id)}: ${short(c.body.replace(/\s+/g, ' '), 100)}`,
      })),
    ...(team.hr
      ? {
          offene_antraege: open.slice(0, 20).map((a) => ({
            ref: refOf(a),
            wer: nameOf(a.member_id),
            art: KIND_LABEL[a.kind],
            zeitraum: rangeLabel(a.starts_on, a.ends_on),
            arbeitstage: workingDays(a.starts_on, a.ends_on),
            ...(a.note ? { notiz: short(a.note, 120) } : {}),
          })),
          neue_krankmeldungen: sick.filter((a) => listed.includes(a)).map((a) => ({
            ref: refOf(a),
            wer: nameOf(a.member_id),
            zeitraum: rangeLabel(a.starts_on, a.ends_on),
            ...(a.doctor ? { beim_arzt: true } : {}),
          })),
        }
      : {}),
    ...(account
      ? {
          urlaubskonto: {
            jahr: year,
            anspruch: account.total,
            uebrig: account.left,
            genommen: account.taken,
            geplant: account.planned,
            beantragt: account.pending,
            krankheitstage: account.sick,
          },
        }
      : {}),
  };
  return { context, absences: listed, absenceRefs: refs };
}

/** Bereiche, die Luna nicht mitgeschickt bekommt (Recht fehlt) */
export function hiddenAreas(can: (area: Area) => boolean): Set<Area> {
  return new Set(AREAS.map((a) => a.key).filter((k) => !can(k)));
}

/**
 * Übersicht für Luna ohne Bereiche, die der Nutzer nicht sehen darf – z. B. Mitarbeiter
 * ohne Finanzen: keine Umsätze, Preise, Steuern, Ausgaben.
 */
export function limitNexyContext<T extends Record<string, unknown>>(context: T, hidden: Set<Area>): Record<string, unknown> {
  if (!hidden.size) return context;
  const out: Record<string, unknown> = { ...context };
  const drop = (...keys: string[]) => keys.forEach((k) => delete out[k]);
  if (hidden.has('finanzen')) drop('finanzen', 'steuern', 'ausgaben');
  if (hidden.has('dokumente')) drop('offene_rechnungen', 'letzte_angebote', 'bezahlte_rechnungen', 'bezahlte_rechnungen_anzahl');
  if (hidden.has('kunden')) drop('kunden');
  if (hidden.has('auftraege')) drop('auftraege');
  if (hidden.has('termine')) drop('termine');
  if (hidden.has('aufgaben')) drop('aufgaben', 'aufgaben_offen_gesamt', 'ziele');
  if (hidden.has('social')) drop('social', 'posts');
  if (hidden.has('firma') && out.firma && typeof out.firma === 'object') {
    const f = out.firma as Record<string, unknown>;
    out.firma = { name: f.name ?? null };
  }
  // Aufträge ohne Preise (Finanzen) bzw. ohne Angebots-/Rechnungsnummern (Dokumente)
  if (Array.isArray(out.auftraege) && (hidden.has('finanzen') || hidden.has('dokumente'))) {
    out.auftraege = (out.auftraege as Record<string, unknown>[]).map((o) => {
      const copy = { ...o };
      if (hidden.has('finanzen')) {
        delete copy.preis;
        delete copy.abrechnung;
      }
      if (hidden.has('dokumente')) delete copy.dokumente;
      return copy;
    });
  }
  out.nicht_freigegeben = [...hidden].map((a) => AREAS.find((x) => x.key === a)?.label ?? a);
  return out;
}
