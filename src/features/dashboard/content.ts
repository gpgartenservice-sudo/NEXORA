import type { Goal, Stage } from '@/features/onboarding/options';

/** Was das Dashboard je nach Phase (aus dem Onboarding) in den Mittelpunkt stellt. */
export const FOCUS: Record<Stage, { emoji: string; title: string; text: string; steps: string[] }> = {
  idea: {
    emoji: '💡',
    title: 'Von der Idee zum ersten Kunden',
    text: 'Wir begleiten dich Schritt für Schritt – von der ersten Skizze bis zum ersten bezahlten Auftrag.',
    steps: ['Beschreibe deine Idee in einem Satz', 'Finde heraus, wer deine Kunden sind', 'Gewerbe anmelden – so geht’s'],
  },
  started: {
    emoji: '🚀',
    title: 'Jetzt richtig durchstarten',
    text: 'Die Basis steht. Jetzt geht es um Kunden, Struktur und Routinen, die dich jeden Tag weiterbringen.',
    steps: ['Lege deine ersten Kunden an', 'Schreib dein erstes Angebot', 'Plane deine Woche'],
  },
  stuck: {
    emoji: '🧗',
    title: 'Wir finden raus, wo es hakt',
    text: 'Feststecken gehört dazu. Gemeinsam finden wir den nächsten Schritt, der dich wirklich weiterbringt.',
    steps: ['Schreib auf, was dich gerade aufhält', 'Wähle eine Sache, die du diese Woche änderst', 'Hol dir Feedback von einem Kunden'],
  },
  growing: {
    emoji: '📈',
    title: 'Bereit für das nächste Level',
    text: 'Mehr Überblick, bessere Abläufe, mehr Umsatz – lass uns dein Business wachsen lassen.',
    steps: ['Behalte Umsatz und Ausgaben im Blick', 'Automatisiere Angebote und Rechnungen', 'Plane deine Inhalte für Social Media'],
  },
};

/**
 * „Dein Fokus“ passend zu den Schwerpunkten aus dem Onboarding: Was jetzt zählt,
 * eine Zahl aus der App dazu und der Knopf in den passenden Bereich.
 */
export type GoalFocus = {
  emoji: string;
  title: string;
  /** Text je Phase (fehlt die Phase: default) */
  text: Partial<Record<Stage, string>> & { default: string };
  action: { label: string; href: '/kunden' | '/finanzen' | '/aufgaben' | '/social' | '/fahrplan' | '/termine' | '/profil/team' };
};

export const GOAL_FOCUS: Record<Goal, GoalFocus> = {
  first_customers: {
    emoji: '🤝',
    title: 'Deine ersten Kunden',
    text: {
      idea: 'Erzähl in deinem Umfeld, was du vorhast – die ersten Kunden kommen fast immer über Empfehlungen.',
      default: 'Jeder Kunde zählt. Lade Interessenten ein, schreib Angebote und bleib dran, bis der erste Auftrag steht.',
    },
    action: { label: 'Zu den Kunden', href: '/kunden' },
  },
  more_revenue: {
    emoji: '💶',
    title: 'Mehr Umsatz',
    text: {
      growing: 'Prüf deine Preise und frag zufriedene Kunden nach Folgeaufträgen – das bringt am schnellsten mehr Umsatz.',
      default: 'Setz dir ein Umsatzziel für diesen Monat – Lunaxora zählt automatisch mit, wie nah du dran bist.',
    },
    action: { label: 'Zu den Finanzen', href: '/finanzen' },
  },
  organization: {
    emoji: '🗂️',
    title: 'Überblick & Organisation',
    text: {
      default: 'Alles, was im Kopf rumschwirrt, gehört in deine To-dos. Plan die Woche und hak ab, was erledigt ist.',
    },
    action: { label: 'Zu den To-dos', href: '/aufgaben' },
  },
  social_growth: {
    emoji: '📱',
    title: 'Social Media wachsen',
    text: {
      default: 'Regelmäßig schlägt perfekt: Sammle Ideen und plane feste Tage, an denen du postest.',
    },
    action: { label: 'Zu Social Media', href: '/social' },
  },
  finances: {
    emoji: '🧾',
    title: 'Finanzen & Steuern im Griff',
    text: {
      idea: 'Trenn von Anfang an privat und geschäftlich – und leg für die Steuer einen festen Anteil zur Seite.',
      default: 'Trag Ausgaben direkt ein und fotografiere Belege – dann ist die Steuer am Jahresende kein Stress.',
    },
    action: { label: 'Zu den Finanzen', href: '/finanzen' },
  },
  motivation: {
    emoji: '🔥',
    title: 'Motivation & dranbleiben',
    text: {
      stuck: 'Kleine Siege zählen: Nimm dir heute eine Sache vor, die du sicher schaffst – und hak sie ab.',
      default: 'Jeden Tag ein kleiner Schritt. Hak deine To-dos ab und schau, wie weit du schon gekommen bist.',
    },
    action: { label: 'Zum Fahrplan', href: '/fahrplan' },
  },
  team: {
    emoji: '👥',
    title: 'Team aufbauen',
    text: {
      default: 'Mit Lunaxora Business arbeitet ihr mit bis zu 5 Personen im selben Business – gleiche Kunden, gleiche Termine.',
    },
    action: { label: 'Team einladen', href: '/profil/team' },
  },
};

/** Welcher Schwerpunkt heute im Fokus steht (wechselt täglich, wenn es mehrere gibt) */
export function focusGoalOfDay(goals: Goal[], date = new Date()): Goal | null {
  if (!goals.length) return null;
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return goals[day % goals.length];
}

/** Ein Impuls pro Tag – kurz, ehrlich, ohne Kalenderspruch-Kitsch. */
export const IMPULSES = [
  'Fang an, bevor du dich bereit fühlst. Bereit wirst du beim Machen.',
  'Ein Kunde, der wiederkommt, ist mehr wert als zehn, die nur schauen.',
  'Erledige heute die eine Aufgabe, vor der du dich drückst. Der Rest wird leichter.',
  'Dein Preis ist kein Gefühl, sondern eine Rechnung. Kenne deine Zahlen.',
  'Perfekt ist der Feind von fertig.',
  'Frag deine Kunden, was sie wirklich brauchen – nicht, was du verkaufen willst.',
  'Kleine Schritte jeden Tag schlagen große Pläne, die liegen bleiben.',
  'Ein Nein von einem Kunden ist eine Info, kein Urteil über dich.',
  'Schreib es auf. Was nur im Kopf ist, bleibt liegen.',
  'Zeig, was du machst. Wer dich nicht sieht, kann dich nicht buchen.',
  'Plane deine Woche, bevor sie dich plant.',
  'Vergleich dich mit dir von letztem Monat – nicht mit anderen auf Instagram.',
  'Mach eine Sache richtig gut, bevor du zehn Sachen halb machst.',
  'Pausen sind Teil des Plans, kein Zeichen von Schwäche.',
  'Jeder Profi hat mal mit dem ersten Auftrag angefangen.',
  'Hol dir früh Feedback. Es ist billiger als späte Fehler.',
  'Dein Netzwerk ist dein erster Marketingkanal. Erzähl, was du machst.',
  'Wenn es sich festgefahren anfühlt: Ändere eine Sache, nicht alles.',
  'Feier kleine Erfolge. Sie sind der Treibstoff für die großen.',
  'Klarheit schlägt Motivation. Wisse, was dein nächster Schritt ist.',
  'Eine Rechnung, die nicht geschrieben ist, wird auch nicht bezahlt.',
];

/** Gleicher Impuls für den ganzen Tag, morgen der nächste. */
export function impulseOfTheDay(date = new Date()): string {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return IMPULSES[day % IMPULSES.length];
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Noch wach';
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Hallo';
  return 'Guten Abend';
}

export function formatToday(date = new Date()): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

/**
 * Lunas Spruch beim Öffnen der App (erscheint kurz auf der Startseite und verschwindet).
 * `lastOpen` = wann die App zuletzt geöffnet wurde (null = erstes Mal).
 */
export function lunaQuip(now: Date, lastOpen: Date | null, name?: string): string | null {
  const h = now.getHours();
  const day = now.getDay();
  const who = name ? `, ${name}` : '';
  const away = lastOpen ? (now.getTime() - lastOpen.getTime()) / 86_400_000 : 0;
  const pick = (list: string[]) => list[(now.getDate() + h) % list.length];

  if (lastOpen && away >= 21) return pick([`Lange nicht gesehen${who}! Schön, dass du wieder da bist. 🥹`, 'Da bist du ja wieder! Ich hab schon Staub angesetzt. 🧹']);
  if (lastOpen && away >= 3) return pick([`Na${who}, wie war dein Urlaub? 🏖️`, 'Da ist ja jemand ausgeschlafen! Wie war die Pause? 😴', `Hey${who}! Ich hab dich vermisst. 💚`]);
  if (h >= 23 || h < 4) return pick([`Du bist aber spät dran heute${who}! 🌙`, 'Nachtschicht? Vergiss den Schlaf nicht. 😴', 'Die besten Ideen kommen nachts – aber morgen auch noch. 🌙']);
  if (h >= 4 && h < 6) return pick([`Früher Vogel${who}! Der Kaffee ist noch nicht mal fertig. ☕`, 'So früh schon wach? Respekt! 🐦']);
  if (h >= 21) return pick(['Feierabend ist auch was Schönes, weißt du? 🛋️', `Noch fleißig${who}? Ich bin dabei! 💪`]);
  if (day === 1 && h < 12) return pick(['Neue Woche, neues Glück! Lass uns was reißen. 💪', 'Montag! Kaffee holen und los geht’s. ☕']);
  if (day === 5 && h >= 13) return pick(['Fast Wochenende! Noch kurz durchziehen. 🎉', 'Freitag! Was wir heute schaffen, freut dich am Montag. 😎']);
  if (day === 0 || day === 6) return pick(['Am Wochenende am Business? Fleißig! 🐝', `Wochenende${who}! Aber kurz reinschauen ist erlaubt. 😉`]);
  return null;
}
