import type { Stage } from '@/features/onboarding/options';

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
