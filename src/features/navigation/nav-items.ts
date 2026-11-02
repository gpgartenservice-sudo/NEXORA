import {
  Briefcase,
  Building2,
  Ellipsis,
  House,
  Megaphone,
  Route,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

export type NavItem = {
  /** Name der Route (Datei in src/app/(app)/(tabs)/) */
  name: string;
  href: '/home' | '/fahrplan' | '/kunden' | '/auftraege' | '/firma' | '/finanzen' | '/social' | '/assistent' | '/profil' | '/mehr';
  label: string;
  icon: LucideIcon;
  /** Kurzbeschreibung (Platzhalter-Seiten, "Mehr"-Liste) */
  description: string;
  /** Was in diesem Bereich geplant ist (für die "kommt bald"-Seite) */
  planned?: string[];
  /** Am Handy direkt in der Tab-Leiste (sonst unter "Mehr") */
  mobileTab?: boolean;
  /** Bereich ist noch in Arbeit */
  soon?: boolean;
  /** Nur am Handy (Seitenleiste zeigt alles direkt) */
  mobileOnly?: boolean;
  /** Unten in der Seitenleiste statt in der Hauptliste */
  footer?: boolean;
};

/** Alle Bereiche der App, in der Reihenfolge der Navigation. */
export const NAV_ITEMS: NavItem[] = [
  { name: 'home', href: '/home', label: 'Start', icon: House, description: 'Dein Überblick', mobileTab: true },
  {
    name: 'fahrplan',
    href: '/fahrplan',
    planned: ['Persönlicher Plan passend zu deiner Phase', 'Checklisten für jeden Schritt', 'Meilensteine und sichtbarer Fortschritt', 'Erklärungen zu Gewerbe, Steuern & Co.'],
    label: 'Fahrplan',
    icon: Route,
    description: 'Schritt für Schritt zu deinem Business – mit Meilensteinen und Checklisten.',
    mobileTab: true,
  },
  {
    name: 'kunden',
    href: '/kunden',
    planned: ['Kundenakte mit Kontaktdaten und Notizen', 'Anrufen und E-Mail mit einem Klick', 'Umsatz und Aufträge pro Kunde', 'Erkennt doppelte Kunden'],
    label: 'Kunden',
    icon: Users,
    description: 'Alle Kunden an einem Ort – mit Kontaktdaten, Notizen und Umsatz pro Kunde.',
    mobileTab: true,
  },
  {
    name: 'auftraege',
    href: '/auftraege',
    planned: ['Status, der sich von selbst aktualisiert', 'Angebote als PDF – Annahme per Link', 'Rechnungen und Zahlungserinnerungen', 'Termine direkt im Kalender'],
    label: 'Aufträge',
    icon: Briefcase,
    description: 'Vom ersten Kontakt bis zur bezahlten Rechnung: Angebote, Termine, Rechnungen.',
  },
  {
    name: 'firma',
    href: '/firma',
    label: 'Firma',
    icon: Building2,
    description: 'Logo, Adresse, Steuern und Bankverbindung für deine Angebote und Rechnungen.',
  },
  {
    name: 'finanzen',
    href: '/finanzen',
    planned: ['Umsatz, Ausgaben und Gewinn', 'Offene Rechnungen auf einen Blick', 'Wiederkehrende Ausgaben', 'Einkommensnachweis als PDF'],
    label: 'Finanzen',
    icon: Wallet,
    description: 'Einnahmen, Ausgaben und Gewinn im Blick – inklusive offener Rechnungen.',
  },
  {
    name: 'social',
    href: '/social',
    planned: ['Content-Board von der Idee bis zum Post', 'Wochenplan und Hashtag-Sets', 'Zahlen pro Post', 'Verbindung zu TikTok und Instagram'],
    label: 'Social Media',
    icon: Megaphone,
    description: 'Content-Ideen sammeln, Posts planen und deine Zahlen verfolgen.',
    soon: true,
  },
  {
    name: 'assistent',
    href: '/assistent',
    planned: ['Sprechen oder tippen', 'Erkennt Kunden, Aufträge, Ideen und To-dos', 'Du bestätigst, bevor etwas gespeichert wird'],
    label: 'Assistent',
    icon: Sparkles,
    description: 'Einfach drauflossprechen – die KI legt Kunden, Aufträge und To-dos für dich an.',
    mobileTab: true,
    soon: true,
  },
  { name: 'profil', href: '/profil', label: 'Profil', icon: UserRound, description: 'Dein Konto und deine Antworten', footer: true },
  { name: 'mehr', href: '/mehr', label: 'Mehr', icon: Ellipsis, description: 'Alle Bereiche', mobileOnly: true, mobileTab: true },
];

export const navItem = (name: string) => NAV_ITEMS.find((i) => i.name === name);

/** Ab dieser Fensterbreite gibt es die Seitenleiste statt der Tab-Leiste unten. */
export const SIDEBAR_BREAKPOINT = 820;

/** Breite der Seitenleiste auf dem Mac */
export const SIDEBAR_WIDTH = 248;
