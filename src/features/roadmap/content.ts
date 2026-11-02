import type { Goal, Stage } from '@/features/onboarding/options';

/**
 * Inhalte des Gründer-Fahrplans.
 *
 * Die `key`-Werte der Schritte werden in der Datenbank gespeichert
 * (Tabelle roadmap_progress) – einmal vergeben, nie mehr ändern.
 * Texte dürfen jederzeit angepasst werden.
 *
 * Stand 2026, ohne Gewähr – ersetzt keine Rechts- oder Steuerberatung.
 */

export type RoadmapStep = {
  key: string;
  title: string;
  /** Warum dieser Schritt wichtig ist */
  why: string;
  /** Konkrete Tipps ("So geht's") */
  tips: string[];
  /** Passt zu diesen Zielen aus dem Onboarding */
  goals?: Goal[];
};

export type RoadmapPhase = {
  key: string;
  emoji: string;
  title: string;
  description: string;
  steps: RoadmapStep[];
};

export const PHASES: RoadmapPhase[] = [
  {
    key: 'reset',
    emoji: '🧗',
    title: 'Neu ausrichten',
    description: 'Durchatmen, ehrlich hinschauen und den einen Hebel finden, der dich wieder in Bewegung bringt.',
    steps: [
      {
        key: 'reset_blockers',
        title: 'Schreib auf, was dich gerade aufhält',
        why: 'Was nur im Kopf herumschwirrt, fühlt sich riesig an. Aufgeschrieben wird daraus eine Liste, die man abarbeiten kann.',
        tips: [
          'Nimm dir 15 Minuten und schreib alles auf, was dich gerade blockiert – ohne zu sortieren.',
          'Markiere danach: Was davon kannst du selbst ändern, was nicht?',
          'Streiche alles, worauf du keinen Einfluss hast. Der Rest ist dein Arbeitsfeld.',
        ],
        goals: ['motivation'],
      },
      {
        key: 'reset_numbers',
        title: 'Mach einen ehrlichen Zahlen-Check',
        why: 'Oft fühlt sich alles schlecht an, obwohl einzelne Dinge gut laufen – oder umgekehrt. Zahlen zeigen, wo es wirklich hakt.',
        tips: [
          'Welche Kunden oder Angebote haben in den letzten 3 Monaten das meiste Geld gebracht?',
          'Wofür geht viel Zeit drauf, die kaum etwas einbringt?',
          'Wie viel musst du im Monat mindestens umsetzen, damit es sich trägt?',
        ],
        goals: ['finances', 'more_revenue'],
      },
      {
        key: 'reset_one_change',
        title: 'Wähle eine Sache, die du diese Woche änderst',
        why: 'Alles auf einmal ändern zu wollen, führt meist dazu, dass sich nichts ändert. Ein einziger Hebel reicht für den Anfang.',
        tips: [
          'Such dir aus deiner Liste die Sache aus, die am meisten bewirkt und am wenigsten Aufwand macht.',
          'Leg einen festen Termin dafür in deinen Kalender.',
          'Schau am Ende der Woche: Was hat sich verändert?',
        ],
        goals: ['motivation'],
      },
      {
        key: 'reset_feedback',
        title: 'Hol dir Feedback von einem Kunden',
        why: 'Kunden sehen dein Business von außen. Ein ehrliches Gespräch zeigt oft in zehn Minuten, was du allein monatelang nicht siehst.',
        tips: [
          'Frag einen zufriedenen Kunden: Warum hast du dich für mich entschieden?',
          'Frag: Was hätte ich besser machen können?',
          'Hör nur zu und rechtfertige dich nicht – schreib mit.',
        ],
        goals: ['first_customers', 'more_revenue'],
      },
    ],
  },
  {
    key: 'basis',
    emoji: '💡',
    title: 'Idee & Fundament',
    description: 'Bevor du loslegst: Klarheit darüber, was du anbietest, für wen und zu welchem Preis.',
    steps: [
      {
        key: 'idea_sentence',
        title: 'Beschreibe deine Idee in einem Satz',
        why: 'Wenn du dein Angebot in einem Satz erklären kannst, können es auch deine Kunden weitererzählen.',
        tips: [
          'Nutze die Formel: „Ich helfe [Zielgruppe], [Problem] zu lösen, indem ich [Angebot].“',
          'Lies den Satz drei Menschen vor. Verstehen sie ihn sofort?',
          'Kürze so lange, bis kein Fachbegriff mehr drin ist.',
        ],
      },
      {
        key: 'target_group',
        title: 'Finde heraus, wer deine Kunden sind',
        why: '„Alle“ ist keine Zielgruppe. Je genauer du deine Kunden kennst, desto leichter findest und überzeugst du sie.',
        tips: [
          'Beschreib deinen Wunschkunden: Situation, Problem, wo er nach Lösungen sucht.',
          'Sprich mit fünf Menschen aus dieser Gruppe, bevor du viel Geld investierst.',
          'Frag nicht „Würdest du das kaufen?“, sondern „Wie löst du das Problem heute?“.',
        ],
        goals: ['first_customers'],
      },
      {
        key: 'offer_price',
        title: 'Leg dein Angebot und deine Preise fest',
        why: 'Viele Gründer sind zu günstig und merken es erst, wenn das Geld am Monatsende nicht reicht. Rechne rückwärts.',
        tips: [
          'Was musst du im Monat verdienen? Kosten + Rücklagen für Steuern + dein Gehalt = dein Mindestumsatz.',
          'Teile den Mindestumsatz durch die Stunden oder Aufträge, die realistisch sind.',
          'Schau dir die Preise der Konkurrenz an – der Billigste zu sein, ist selten ein guter Plan.',
        ],
        goals: ['more_revenue', 'finances'],
      },
      {
        key: 'business_name',
        title: 'Wähle einen Namen',
        why: 'Ein Name, den man sich merken kann und der noch frei ist, erspart dir später teure Umbenennungen.',
        tips: [
          'Prüfe, ob die passende Domain und die Social-Media-Namen noch frei sind.',
          'Schau beim Deutschen Patent- und Markenamt (DPMA), ob der Name schon als Marke geschützt ist.',
          'Einzelunternehmer müssen ihren Vor- und Nachnamen im Geschäftsverkehr nennen (z. B. auf Rechnungen).',
        ],
      },
    ],
  },
  {
    key: 'start',
    emoji: '📝',
    title: 'Offiziell starten',
    description: 'Die Pflichtschritte, damit dein Business rechtlich sauber an den Start geht.',
    steps: [
      {
        key: 'register_business',
        title: 'Gewerbe anmelden – oder freiberuflich starten',
        why: 'Wer ein Gewerbe betreibt, muss es beim Gewerbeamt anmelden. Bestimmte freie Berufe melden sich stattdessen nur beim Finanzamt.',
        tips: [
          'Die Anmeldung geht in vielen Städten online, die Gebühr liegt meist bei etwa 15–65 €.',
          'Halte deinen Ausweis bereit. Für manche Tätigkeiten brauchst du zusätzlich Erlaubnisse oder Nachweise.',
          'Unsicher, ob du gewerblich oder freiberuflich bist? Frag beim Finanzamt oder einer Steuerberatung nach.',
        ],
      },
      {
        key: 'tax_registration',
        title: 'Beim Finanzamt anmelden',
        why: 'Ohne Steuernummer darfst du keine ordentlichen Rechnungen schreiben. Den Antrag stellst du über den „Fragebogen zur steuerlichen Erfassung“.',
        tips: [
          'Den Fragebogen füllst du online über ELSTER aus.',
          'Beantrage deinen ELSTER-Zugang früh – die Freischaltung per Post dauert einige Tage.',
          'Im Fragebogen schätzt du deinen Umsatz und entscheidest über die Kleinunternehmerregelung.',
        ],
        goals: ['finances'],
      },
      {
        key: 'small_business',
        title: 'Kleinunternehmerregelung prüfen',
        why: 'Bleibt dein Umsatz unter den Grenzen (seit 2025: höchstens 25.000 € im Vorjahr und 100.000 € im laufenden Jahr), kannst du ohne Umsatzsteuer abrechnen. Das ist einfacher – aber nicht immer günstiger.',
        tips: [
          'Vorteil: einfachere Rechnungen und keine Umsatzsteuer-Voranmeldungen.',
          'Nachteil: Du bekommst die Umsatzsteuer auf eigene Einkäufe (Vorsteuer) nicht zurück.',
          'Planst du teure Anschaffungen oder hast vor allem Firmenkunden, rechne es vorher mit einer Steuerberatung durch.',
        ],
        goals: ['finances'],
      },
      {
        key: 'bank_account',
        title: 'Eigenes Geschäftskonto eröffnen',
        why: 'Wenn privates und geschäftliches Geld getrennt sind, behältst du den Überblick – und sparst dir Chaos bei der Steuer.',
        tips: [
          'Vergleiche Kontoführungsgebühren – viele Online-Banken haben günstige Konten für Selbstständige.',
          'Lass alle Einnahmen und Ausgaben deines Business über dieses Konto laufen.',
          'Richte direkt ein zweites Unterkonto für Steuer-Rücklagen ein.',
        ],
        goals: ['finances', 'organization'],
      },
      {
        key: 'insurance',
        title: 'Versicherungen klären',
        why: 'Eine Krankenversicherung ist Pflicht und muss als Selbstständiger oft neu geregelt werden. Eine Betriebshaftpflicht schützt dich, wenn bei einem Auftrag etwas schiefgeht.',
        tips: [
          'Sprich mit deiner Krankenkasse, bevor du startest – besonders wenn du vorher angestellt warst.',
          'Vergleiche Angebote für eine Betriebshaftpflicht, passend zu deiner Branche.',
          'Denk auch an deine Altersvorsorge – als Selbstständiger kümmerst du dich selbst darum.',
        ],
      },
    ],
  },
  {
    key: 'customers',
    emoji: '🤝',
    title: 'Erste Kunden',
    description: 'Sichtbar werden, die ersten Aufträge gewinnen und Vertrauen aufbauen.',
    steps: [
      {
        key: 'online_presence',
        title: 'Sichtbar werden',
        why: 'Kunden können dich nur buchen, wenn sie dich finden. Für den Anfang reicht eine einfache, gepflegte Präsenz.',
        tips: [
          'Ein Google-Unternehmensprofil ist kostenlos und bringt gerade lokal viele Anfragen.',
          'Wähle einen Social-Media-Kanal, auf dem deine Kunden wirklich sind – nicht alle auf einmal.',
          'Vergiss das Impressum nicht – auch auf geschäftlichen Social-Media-Profilen.',
        ],
        goals: ['first_customers', 'social_growth'],
      },
      {
        key: 'first_customers',
        title: 'Gewinn deine ersten drei Kunden',
        why: 'Die ersten Aufträge kommen fast immer über Menschen, die dich schon kennen. Dein Netzwerk ist dein erster Vertriebskanal.',
        tips: [
          'Erzähl 20 Menschen konkret, was du anbietest und für wen.',
          'Frag direkt: „Kennst du jemanden, der das gebrauchen könnte?“',
          'Biete den ersten Kunden einen kleinen Starterpreis – gegen eine ehrliche Bewertung.',
        ],
        goals: ['first_customers'],
      },
      {
        key: 'first_offer',
        title: 'Schreib dein erstes Angebot',
        why: 'Ein klares Angebot mit Leistung, Preis und Frist wirkt professionell und verhindert Missverständnisse.',
        tips: [
          'Beschreib die Leistungen konkret statt allgemein („3 Social-Media-Posts pro Woche“ statt „Social Media“).',
          'Nenn einen klaren Preis und bis wann das Angebot gilt.',
          'Fass nach ein paar Tagen freundlich nach, wenn du nichts hörst.',
        ],
        goals: ['first_customers', 'more_revenue'],
      },
      {
        key: 'reviews',
        title: 'Sammle Bewertungen',
        why: 'Gute Bewertungen sind das stärkste Verkaufsargument, das du nicht selbst schreiben kannst.',
        tips: [
          'Frag zufriedene Kunden direkt nach einer Bewertung – am besten mit Link.',
          'Der beste Zeitpunkt ist kurz nach einem erfolgreich abgeschlossenen Auftrag.',
          'Antworte auf jede Bewertung, auch auf kritische – freundlich und sachlich.',
        ],
        goals: ['first_customers', 'more_revenue'],
      },
    ],
  },
  {
    key: 'structure',
    emoji: '🗂️',
    title: 'Struktur & Finanzen',
    description: 'Ordnung in Rechnungen, Steuern und Woche – damit du mehr Zeit fürs Wesentliche hast.',
    steps: [
      {
        key: 'invoices',
        title: 'Rechnungen richtig schreiben',
        why: 'Rechnungen brauchen Pflichtangaben. Fehlt etwas, kann es Ärger mit dem Finanzamt oder deinen Kunden geben.',
        tips: [
          'Pflicht sind u. a.: Name und Anschrift beider Seiten, Steuernummer, Datum, fortlaufende Rechnungsnummer, Leistung und Betrag.',
          'Als Kleinunternehmer gehört ein Hinweis auf die Steuerbefreiung nach § 19 UStG auf die Rechnung.',
          'Bewahre Rechnungen und Belege geordnet auf – am besten von Anfang an digital.',
        ],
        goals: ['finances', 'organization'],
      },
      {
        key: 'tax_reserve',
        title: 'Rücklagen für Steuern bilden',
        why: 'Ein Teil jeder Einnahme gehört dem Finanzamt. Wer das vergisst, bekommt nach der ersten Steuererklärung einen Schreck.',
        tips: [
          'Viele legen 25–35 % jeder Einnahme zurück – je nach Gewinn und Steuersituation.',
          'Überweis den Betrag direkt auf ein separates Unterkonto.',
          'Nach der ersten Steuererklärung können Vorauszahlungen für das nächste Jahr kommen – plane sie ein.',
        ],
        goals: ['finances'],
      },
      {
        key: 'bookkeeping',
        title: 'Einnahmen und Ausgaben festhalten',
        why: 'Für die Steuer brauchst du am Jahresende meist eine Einnahmen-Überschuss-Rechnung (EÜR). Wer monatlich sortiert, spart sich Stress im Frühjahr.',
        tips: [
          'Lege jeden Beleg sofort ab – Foto oder PDF reicht oft.',
          'Nimm dir einmal im Monat 30 Minuten für deine Buchhaltung.',
          'Überleg früh, ob eine Steuerberatung oder Buchhaltungssoftware dir Zeit spart.',
        ],
        goals: ['finances', 'organization'],
      },
      {
        key: 'weekly_routine',
        title: 'Führ eine feste Wochenroutine ein',
        why: 'Wer nur auf Aufträge reagiert, hat nie Zeit für neue Kunden oder Verbesserungen. Feste Blöcke schaffen Ruhe.',
        tips: [
          'Plane jede Woche feste Zeit für Kundengewinnung, Buchhaltung und Weiterentwicklung.',
          'Leg einen Tag fest, an dem du die Woche planst – zum Beispiel Sonntagabend oder Montagmorgen.',
          'Plane auch Pausen ein. Ausgebrannt hilft niemandem.',
        ],
        goals: ['organization', 'motivation'],
      },
    ],
  },
  {
    key: 'growth',
    emoji: '📈',
    title: 'Wachstum',
    description: 'Mehr Umsatz mit weniger Aufwand – und das Fundament für die nächsten Schritte.',
    steps: [
      {
        key: 'monthly_numbers',
        title: 'Check deine Zahlen jeden Monat',
        why: 'Umsatz, Gewinn und Anzahl der Kunden zeigen dir früh, ob du auf Kurs bist – lange bevor es auf dem Konto eng wird.',
        tips: [
          'Schau dir einmal im Monat Umsatz, Ausgaben und Gewinn an.',
          'Welche Kunden und Angebote bringen am meisten? Mach mehr davon.',
          'Setz dir für jeden Monat ein konkretes Umsatzziel.',
        ],
        goals: ['more_revenue', 'finances'],
      },
      {
        key: 'automate',
        title: 'Automatisiere wiederkehrende Arbeit',
        why: 'Jede Aufgabe, die du dreimal von Hand machst, ist ein Kandidat für eine Vorlage oder Automatisierung.',
        tips: [
          'Erstelle Vorlagen für Angebote, Rechnungen und häufige E-Mails.',
          'Nutze Werkzeuge, die Rechnungen und Erinnerungen automatisch verschicken.',
          'Schreib Abläufe auf – das hilft auch, wenn du später Hilfe einstellst.',
        ],
        goals: ['organization'],
      },
      {
        key: 'content_plan',
        title: 'Plane deine Inhalte für Social Media',
        why: 'Regelmäßigkeit schlägt Perfektion. Ein einfacher Plan sorgt dafür, dass du sichtbar bleibst, auch wenn viel los ist.',
        tips: [
          'Plane zwei bis drei Posts pro Woche im Voraus.',
          'Zeig deine Arbeit: Vorher-Nachher, Einblicke hinter die Kulissen, Kundenstimmen.',
          'Schau dir monatlich an, welche Inhalte am besten funktionieren.',
        ],
        goals: ['social_growth'],
      },
      {
        key: 'raise_prices',
        title: 'Überprüf deine Preise',
        why: 'Mit mehr Erfahrung und Nachfrage steigt dein Wert. Viele erhöhen ihre Preise zu spät.',
        tips: [
          'Bist du über Wochen voll ausgebucht? Das ist ein Zeichen, dass deine Preise zu niedrig sind.',
          'Erhöhe für Neukunden zuerst und kündige Änderungen für Bestandskunden rechtzeitig an.',
          'Begründe Preise mit dem Ergebnis für den Kunden, nicht mit deinem Aufwand.',
        ],
        goals: ['more_revenue'],
      },
      {
        key: 'get_help',
        title: 'Hol dir Unterstützung',
        why: 'Irgendwann bist du selbst der Engpass. Hilfe einzuplanen, ist der Schritt vom Selbstständigen zum Unternehmer.',
        tips: [
          'Was kostet dich viel Zeit, könnte aber jemand anderes erledigen?',
          'Freelancer, Aushilfen oder eine Steuerberatung können dich schnell entlasten.',
          'Bei Minijobs und anderen Anstellungen gibt es Melde- und Aufzeichnungspflichten – informier dich vorher.',
        ],
        goals: ['team', 'organization'],
      },
    ],
  },
];

/** Reihenfolge der Phasen je nach Antwort "Wo stehst du gerade?" */
const PHASE_ORDER: Record<Stage, string[]> = {
  idea: ['basis', 'start', 'customers', 'structure', 'growth'],
  started: ['start', 'customers', 'structure', 'growth', 'basis'],
  stuck: ['reset', 'customers', 'structure', 'growth', 'basis', 'start'],
  growing: ['structure', 'growth', 'customers', 'basis', 'start'],
};

/** Die Phasen in der Reihenfolge, die zu dieser Phase passt. */
export function phasesFor(stage: Stage | null | undefined): RoadmapPhase[] {
  const order = PHASE_ORDER[stage ?? 'started'];
  return order.map((key) => PHASES.find((p) => p.key === key)!).filter(Boolean);
}

/** Alle Schritte des persönlichen Fahrplans, in Reihenfolge. */
export function stepsFor(stage: Stage | null | undefined): RoadmapStep[] {
  return phasesFor(stage).flatMap((p) => p.steps);
}

/** Die nächsten offenen Schritte. */
export function nextSteps(stage: Stage | null | undefined, done: Set<string>, count = 3): RoadmapStep[] {
  return stepsFor(stage)
    .filter((s) => !done.has(s.key))
    .slice(0, count);
}
