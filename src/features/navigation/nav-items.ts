import {
  Briefcase,
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
  href: '/home' | '/fahrplan' | '/kunden' | '/auftraege' | '/finanzen' | '/social' | '/assistent' | '/profil' | '/mehr';
  label: string;
  icon: LucideIcon;
  /** Kurzbeschreibung (Platzhalter-Seiten, "Mehr"-Liste) */
  description: string;
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
    label: 'Fahrplan',
    icon: Route,
    description: 'Schritt für Schritt zu deinem Business – mit Meilensteinen und Checklisten.',
    mobileTab: true,
    soon: true,
  },
  {
    name: 'kunden',
    href: '/kunden',
    label: 'Kunden',
    icon: Users,
    description: 'Alle Kunden an einem Ort – mit Kontaktdaten, Notizen und Umsatz pro Kunde.',
    mobileTab: true,
    soon: true,
  },
  {
    name: 'auftraege',
    href: '/auftraege',
    label: 'Aufträge',
    icon: Briefcase,
    description: 'Vom ersten Kontakt bis zur bezahlten Rechnung: Angebote, Termine, Rechnungen.',
    soon: true,
  },
  {
    name: 'finanzen',
    href: '/finanzen',
    label: 'Finanzen',
    icon: Wallet,
    description: 'Einnahmen, Ausgaben und Gewinn im Blick – inklusive offener Rechnungen.',
    soon: true,
  },
  {
    name: 'social',
    href: '/social',
    label: 'Social Media',
    icon: Megaphone,
    description: 'Content-Ideen sammeln, Posts planen und deine Zahlen verfolgen.',
    soon: true,
  },
  {
    name: 'assistent',
    href: '/assistent',
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
