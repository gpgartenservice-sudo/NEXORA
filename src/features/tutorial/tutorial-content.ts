/**
 * Einführungen je Bereich: kurze Schritte, die Nexy erklärt. Ein Schritt mit
 * `target` hebt die passende Stelle hervor (siehe <TourTarget id="…">);
 * `optional` = Schritt auslassen, wenn es die Stelle gerade nicht gibt
 * (z. B. Liste noch leer).
 */
export type TutorialStep = {
  title: string;
  text: string;
  target?: string;
  optional?: boolean;
};

export type TutorialId =
  | 'home'
  | 'fahrplan'
  | 'kunden'
  | 'auftraege'
  | 'auftrag'
  | 'termine'
  | 'aufgaben'
  | 'firma'
  | 'finanzen'
  | 'steuern'
  | 'social'
  | 'nexy';

export type Tutorial = {
  id: TutorialId;
  /** Name des Bereichs (für „Weiter zu …“) */
  label: string;
  href:
    | '/home'
    | '/fahrplan'
    | '/kunden'
    | '/auftraege'
    | '/termine'
    | '/aufgaben'
    | '/firma'
    | '/finanzen'
    | '/finanzen/steuern'
    | '/social'
    | '/assistent'
    | null;
  steps: TutorialStep[];
};

export const TUTORIALS: Record<TutorialId, Tutorial> = {
  home: {
    id: 'home',
    label: 'Start',
    href: '/home',
    steps: [
      {
        title: 'Willkommen bei NEXORA 👋',
        text: 'Ich bin Nexy und zeig dir in jedem Bereich kurz, wie alles funktioniert. Über das ? oben kannst du jede Einführung später wiederholen.',
      },
      {
        target: 'home.today',
        title: 'Heute zu tun',
        text: 'Deine To-dos für heute und wie weit du bei deinen Zielen bist. Stehen heute oder morgen Termine an, siehst du sie direkt darüber.',
      },
      {
        target: 'home.focus',
        title: 'Dein Fokus',
        text: 'Passend zu deiner Phase zeige ich dir, worauf es gerade ankommt – dazu jeden Tag ein kleiner Impuls.',
      },
      {
        target: 'home.steps',
        title: 'Deine nächsten Schritte',
        text: 'Die nächsten Schritte aus deinem Fahrplan. Abhaken geht direkt hier.',
      },
      {
        target: 'home.tools',
        title: 'Deine Werkzeuge',
        text: 'Von hier springst du in jeden Bereich. Die Navigation ist immer da – am Mac links, am Handy unten.',
      },
    ],
  },
  fahrplan: {
    id: 'fahrplan',
    label: 'Fahrplan',
    href: '/fahrplan',
    steps: [
      {
        target: 'fahrplan.fortschritt',
        title: 'Dein Fahrplan',
        text: 'Schritt für Schritt vom ersten Kunden bis zum stabilen Business. Hier siehst du, wie viel du schon geschafft hast.',
      },
      {
        target: 'fahrplan.phasen',
        title: 'Phasen & Schritte',
        text: 'Jede Phase hat konkrete Schritte mit Tipps. Die hervorgehobene Phase passt gerade zu dir – hak ab, was erledigt ist.',
      },
      {
        title: 'Immer im Blick',
        text: 'Die nächsten drei Schritte stehen auch auf der Startseite. So verlierst du nie den Faden.',
      },
    ],
  },
  kunden: {
    id: 'kunden',
    label: 'Kunden',
    href: '/kunden',
    steps: [
      {
        target: 'kunden.neu',
        title: 'Kunden anlegen',
        text: 'Leg hier deine Kunden an – ein Name reicht für den Anfang. Telefon, E-Mail und Adresse kannst du jederzeit ergänzen.',
      },
      {
        target: 'kunden.zahlen',
        optional: true,
        title: 'Umsatz auf einen Blick',
        text: 'Wie viel Umsatz deine Kunden schon gebracht haben – und was noch reinkommt.',
      },
      {
        target: 'kunden.suche',
        optional: true,
        title: 'Schnell finden',
        text: 'Suche nach Name, Firma, Telefon oder E-Mail. In der Kundenakte findest du alle Aufträge, Angebote und Rechnungen dieses Kunden.',
      },
      {
        title: 'Noch schneller',
        text: 'Sag mir einfach: „Neuer Kunde Peter Müller, Telefon 0171 …“ – ich lege ihn für dich an.',
      },
    ],
  },
  auftraege: {
    id: 'auftraege',
    label: 'Aufträge',
    href: '/auftraege',
    steps: [
      {
        target: 'auftraege.neu',
        title: 'Aufträge',
        text: 'Jeder Job ist ein Auftrag – vom Erstgespräch bis zur bezahlten Rechnung. Hier legst du einen neuen an.',
      },
      {
        target: 'auftraege.filter',
        optional: true,
        title: 'Status im Blick',
        text: 'Filtere nach Status. Der Status setzt sich von selbst – je nachdem, was du im Auftrag abhakst.',
      },
      {
        target: 'auftraege.zahlen',
        optional: true,
        title: 'Umsatz',
        text: 'Umsatz zählt, sobald ein Auftrag abgeschlossen ist. Monatliche Aufträge zählen Monat für Monat.',
      },
      {
        title: 'Angebot & Rechnung',
        text: 'Im Auftrag schreibst du Angebot und Rechnung mit einem Klick. Ich zeig dir das, wenn du zum ersten Mal einen Auftrag öffnest.',
      },
    ],
  },
  auftrag: {
    id: 'auftrag',
    label: 'Auftrag',
    href: null,
    steps: [
      {
        target: 'auftrag.status',
        title: 'Wo steht der Auftrag?',
        text: 'Erstgespräch → Angebot → Ausführung → Abschluss. Der Balken zeigt, wo dieser Auftrag gerade steht.',
      },
      {
        target: 'auftrag.ablauf',
        title: 'Abhaken & Preis',
        text: 'Hak ab, was passiert ist (Termin, Angebot verschickt, angenommen …) und trag Preis, Rabatt und Ausgaben ein. Danach speichern.',
      },
      {
        target: 'auftrag.dokumente',
        optional: true,
        title: 'Angebot & Rechnung',
        text: 'Als PDF mit deinem Logo – und über Senden per E-Mail, WhatsApp oder als Link, mit dem dein Kunde online annimmt.',
      },
      {
        title: 'Wenn eine Zahlung fehlt',
        text: 'Ist eine Rechnung überfällig, erscheint beim Dokument „Mahnen“: von der freundlichen Erinnerung bis zur letzten Mahnung.',
      },
    ],
  },
  termine: {
    id: 'termine',
    label: 'Termine',
    href: '/termine',
    steps: [
      {
        target: 'termine.aktionen',
        title: 'Termine',
        text: 'Termine aus deinen Aufträgen landen automatisch hier. Eigene legst du mit „+ Termin“ an – und mit dem Kalender-Abo erscheinen alle in deinem Handy-Kalender.',
      },
      {
        target: 'termine.offen',
        optional: true,
        title: 'Offene Punkte',
        text: 'Was noch fehlt – zum Beispiel Aufträge ohne Termin oder überfällige Rechnungen – mit direktem Sprung dorthin.',
      },
      {
        target: 'termine.ansicht',
        title: 'Woche oder Liste',
        text: 'Wechsle zwischen Wochenansicht und Liste. Für Tage mit mehreren Terminen vor Ort gibt es die Route direkt in Google Maps.',
      },
    ],
  },
  aufgaben: {
    id: 'aufgaben',
    label: 'To-dos & Ziele',
    href: '/aufgaben',
    steps: [
      {
        target: 'aufgaben.neu',
        optional: true,
        title: 'To-dos',
        text: 'Schreib auf, was zu tun ist – mit Fälligkeit und als „wichtig“ markiert, wenn es brennt.',
      },
      {
        target: 'aufgaben.ansicht',
        title: 'Ziele',
        text: 'Unter „Ziele“ setzt du dir z. B. 3.000 € Umsatz im Monat oder 5 neue Kunden. Die zählen automatisch aus deinen echten Zahlen mit.',
      },
      {
        title: 'Einfach sagen',
        text: '„Erinner mich Freitag, die Rechnung an Müller zu schicken“ – sag’s einfach mir. Die To-dos für heute stehen auch auf der Startseite.',
      },
    ],
  },
  firma: {
    id: 'firma',
    label: 'Firma',
    href: '/firma',
    steps: [
      {
        target: 'firma.logo',
        title: 'Dein Logo',
        text: 'Lade dein Logo hoch – es steht dann auf allen Angeboten, Rechnungen und Mahnungen.',
      },
      {
        target: 'firma.absender',
        title: 'Absender',
        text: 'Name, Adresse und Kontakt stehen auf deinen Dokumenten. Fehlt etwas Wichtiges, sagt dir NEXORA Bescheid.',
      },
      {
        target: 'firma.steuern',
        title: 'Steuern',
        text: 'Steuernummer und ob du Kleinunternehmer bist (§ 19 UStG). Davon hängt ab, ob auf deinen Rechnungen Umsatzsteuer steht.',
      },
      {
        target: 'firma.bank',
        title: 'Bank & Fristen',
        text: 'Deine IBAN für die Rechnungen – und wie lange Angebote gelten und Kunden Zeit zum Zahlen haben.',
      },
    ],
  },
  finanzen: {
    id: 'finanzen',
    label: 'Finanzen',
    href: '/finanzen',
    steps: [
      {
        target: 'finanzen.zeitraum',
        title: 'Monat oder Jahr',
        text: 'Wähle den Zeitraum – alle Zahlen darunter passen sich an.',
      },
      {
        target: 'finanzen.zahlen',
        title: 'Was übrig bleibt',
        text: 'Einnahmen aus abgeschlossenen Aufträgen minus Ausgaben = dein Gewinn. Daneben: Rechnungen, die noch offen sind.',
      },
      {
        target: 'finanzen.steuern',
        title: 'Steuer-Topf',
        text: 'Wie viel du fürs Finanzamt zurücklegen solltest – und alles für deine Steuerberatung als ZIP.',
      },
      {
        target: 'finanzen.ausgaben',
        title: 'Ausgaben & Belege',
        text: 'Trag Ausgaben ein oder fotografiere einfach den Beleg – Nexy liest Betrag, Datum und Kategorie aus.',
      },
    ],
  },
  steuern: {
    id: 'steuern',
    label: 'Steuern',
    href: '/finanzen/steuern',
    steps: [
      {
        target: 'steuern.topf',
        title: 'Dein Steuer-Topf',
        text: 'So viel solltest du ungefähr zurücklegen. Den Prozentsatz kannst du anpassen – am besten auf ein eigenes Konto.',
      },
      {
        target: 'steuern.grenze',
        title: 'Grenze & Umsatzsteuer',
        text: 'Als Kleinunternehmer siehst du, wie nah du an der 25.000-€-Grenze bist – sonst die geschätzte Umsatzsteuer.',
      },
      {
        target: 'steuern.export',
        title: 'Für die Steuerberatung',
        text: 'Alles als ZIP: Jahresübersicht, Rechnungen und Ausgaben als Excel-Listen und alle Belege.',
      },
    ],
  },
  social: {
    id: 'social',
    label: 'Social Media',
    href: '/social',
    steps: [
      {
        target: 'social.aktionen',
        title: 'Ideen sammeln',
        text: 'Jede Content-Idee kommt mit „+ Idee“ hier rein. Verbindest du TikTok und Instagram, kommen deine Zahlen automatisch.',
      },
      {
        target: 'social.ansicht',
        title: 'Vom Board bis zu den Zahlen',
        text: 'Im Board wandern Posts von der Idee bis „Veröffentlicht“, im Wochenplan planst du, wann was rausgeht, und unter „Zahlen“ siehst du, was funktioniert.',
      },
      {
        title: 'Zeit sparen',
        text: 'Hashtag-Sets einmal anlegen und bei jedem Post mit einem Klick einfügen.',
      },
    ],
  },
  nexy: {
    id: 'nexy',
    label: 'Nexy',
    href: '/assistent',
    steps: [
      {
        target: 'nexy.eingabe',
        title: 'Sag mir, was ansteht',
        text: 'Schreib oder sprich (Mikrofon) ganz normal: „Neuer Auftrag für Peter Müller, Rasen mähen, 80 €, Freitag 10 Uhr.“',
      },
      {
        target: 'nexy.ideen',
        optional: true,
        title: 'Keine Idee?',
        text: 'Tipp einfach auf einen der Vorschläge.',
      },
      {
        title: 'Ich mach das für dich',
        text: 'Ich erledige es direkt, und du siehst mir zu: Kunden, Aufträge, Termine, To-dos, Ziele und Ausgaben anlegen, ändern oder löschen, Angebote und Rechnungen schreiben, Seiten öffnen – und Fragen zu deinen Zahlen beantworten.',
      },
    ],
  },
};

/** Rundgang: alle Bereiche nacheinander (Reihenfolge wie in der Navigation) */
export const TOUR: TutorialId[] = [
  'home',
  'fahrplan',
  'kunden',
  'auftraege',
  'termine',
  'aufgaben',
  'firma',
  'finanzen',
  'social',
  'nexy',
];
