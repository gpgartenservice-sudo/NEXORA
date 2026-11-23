/**
 * Beträge und Pflichtangaben für Angebote und Rechnungen.
 *
 * Bewusst ohne Imports, damit die Funktionen einzeln getestet werden können
 * (tests/unit/document-logic.test.mjs).
 *
 * Hinweise nach bestem Wissen (Stand 2026) – ersetzt keine Steuerberatung.
 */

export type DocumentKind = 'offer' | 'invoice';

/** Firmendaten des Absenders (Tabelle business_settings). */
export type Seller = {
  company_name: string | null;
  owner_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_number: string | null;
  vat_id: string | null;
  small_business: boolean;
  vat_rate: number;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  payment_days: number;
  offer_validity_days: number;
  /** Aktuelles Firmenlogo (Tabelle business_logos) */
  logo_id: string | null;
  /** Link, unter dem Kunden eine Bewertung abgeben können (z. B. Google) */
  review_url?: string | null;
  /** Link zur eigenen Datenschutzerklärung (sonst Muster auf der Kundenseite) */
  privacy_url?: string | null;
  /** Rechtsform (Skript 20261120090000_feinschliff.sql) */
  legal_form?: SellerLegalForm | null;
  /** GbR: alle Gesellschafter */
  partners?: string | null;
  /** UG/GmbH: Geschäftsführer, Registergericht, HRB-Nummer (Pflicht auf Geschäftsbriefen, § 35a GmbHG) */
  managing_director?: string | null;
  register_court?: string | null;
  register_number?: string | null;
};

export type SellerLegalForm = 'none' | 'sole' | 'freelance' | 'gbr' | 'ug' | 'gmbh';

export const LEGAL_KEYS = ['legal_form', 'partners', 'managing_director', 'register_court', 'register_number'] as const;

export type Buyer = {
  name: string;
  company: string | null;
  address: string | null;
  email: string | null;
};

export type LineItem = {
  description: string;
  details: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type Totals = {
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  net: number;
  vat_rate: number;
  vat_amount: number;
  gross: number;
};

/** Alles, was auf dem Dokument steht – wird beim Erstellen "eingefroren". */
export type DocumentData = {
  kind: DocumentKind;
  seller: Seller;
  buyer: Buyer;
  items: LineItem[];
  totals: Totals;
  small_business: boolean;
  /** Rechnung: Datum oder Zeitraum der Leistung (Pflichtangabe) */
  service_date: string | null;
  service_period: { from: string; to: string } | null;
  /** Monatliche Abrechnung */
  monthly: boolean;
  /**
   * Rechnung mit Umsatzsteuer an Privatkunden für Arbeiten an Haus oder Grundstück:
   * Pflichthinweis auf die Aufbewahrungspflicht (§ 14 Abs. 4 Nr. 9 UStG). Fehlt bei älteren Rechnungen.
   */
  property_work?: boolean;
  /** Rechnung an Privatkunden: Hinweis auf Verzug nach 30 Tagen (§ 286 Abs. 3 BGB). Fehlt bei älteren Rechnungen. */
  late_notice?: boolean;
};

export const EMPTY_SELLER: Seller = {
  company_name: null,
  owner_name: null,
  street: null,
  zip: null,
  city: null,
  phone: null,
  email: null,
  website: null,
  tax_number: null,
  vat_id: null,
  small_business: true,
  vat_rate: 19,
  bank_name: null,
  iban: null,
  bic: null,
  payment_days: 14,
  offer_validity_days: 30,
  logo_id: null,
  review_url: null,
  privacy_url: null,
  legal_form: null,
  partners: null,
  managing_director: null,
  register_court: null,
  register_number: null,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Summen: Positionen -> Rabatt -> Netto -> Umsatzsteuer -> Gesamt.
 * Kleinunternehmer: keine Umsatzsteuer, der Preis ist der Endbetrag.
 * Sonst gelten die Preise als Netto-Preise.
 */
export function computeTotals(items: LineItem[], discountPercent: number, smallBusiness: boolean, vatRate: number): Totals {
  const subtotal = round2(items.reduce((sum, i) => sum + round2(i.quantity * i.unit_price), 0));
  const discount = Math.max(0, Math.min(100, discountPercent || 0));
  const discountAmount = round2((subtotal * discount) / 100);
  const net = round2(subtotal - discountAmount);
  const rate = smallBusiness ? 0 : Math.max(0, vatRate);
  const vat = round2((net * rate) / 100);
  return {
    subtotal,
    discount_percent: discount,
    discount_amount: discountAmount,
    net,
    vat_rate: rate,
    vat_amount: vat,
    gross: round2(net + vat),
  };
}

// ---------------------------------------------------------------------------
// Hinweise unter den Summen
// ---------------------------------------------------------------------------

/** Kleinunternehmer auf Rechnungen (§ 34a UStDV seit 2025, Formulierung wie im Beispiel der IHK München) */
export const SMALL_BUSINESS_NOTE = 'Dieser Umsatz ist gemäß § 19 UStG von der Umsatzsteuer befreit (Kleinunternehmerregelung).';
/** Kleinunternehmer auf Angeboten (noch kein Umsatz) */
export const SMALL_BUSINESS_OFFER_NOTE = 'Gemäß § 19 UStG von der Umsatzsteuer befreit (Kleinunternehmerregelung).';
/** Privatkunden bei Arbeiten an Haus oder Grundstück (§ 14 Abs. 4 Nr. 9, § 14b Abs. 1 Satz 5 UStG) */
export const PROPERTY_NOTE =
  'Bitte bewahren Sie diese Rechnung zwei Jahre auf. Dazu sind Sie als Privatperson gesetzlich verpflichtet (§ 14b Abs. 1 Satz 5 UStG).';
/** Ohne diesen Hinweis gilt die 30-Tage-Regel für Privatkunden nicht (§ 286 Abs. 3 BGB) */
export const LATE_NOTE =
  'Zahlen Sie nicht innerhalb von 30 Tagen nach Fälligkeit und Zugang dieser Rechnung, kommen Sie auch ohne Mahnung in Verzug (§ 286 Abs. 3 BGB).';

/** Privatkunde = ohne Firmenname. Für ihn gelten die Hinweise zu Aufbewahrung und Verzug. */
export function isPrivateBuyer(b: { company?: string | null }): boolean {
  return !b.company?.trim();
}

/** Aufbewahrungs-Hinweis möglich? Nur Rechnungen mit Umsatzsteuer an Privatkunden. */
export function propertyNoteApplies(seller: { small_business: boolean }, buyer: { company?: string | null }): boolean {
  return !seller.small_business && isPrivateBuyer(buyer);
}

/** Vorschlag für den Schalter „Arbeit an Haus oder Grundstück“: wie bei der letzten passenden Rechnung. */
export function lastPropertyChoice(docs: { kind: DocumentKind; data: DocumentData }[]): boolean {
  const last = docs.find((d) => d.kind === 'invoice' && d.data.property_work !== undefined && propertyNoteApplies(d.data, d.data.buyer));
  return !!last?.data.property_work;
}

/** Alle Hinweise unter den Summen, in der Reihenfolge auf dem PDF. */
export function documentNotes(doc: { kind: DocumentKind; number: string; due_on: string | null; data: DocumentData }): string[] {
  const { data } = doc;
  const isInvoice = doc.kind === 'invoice';
  const notes: string[] = [];
  if (data.monthly) notes.push(isInvoice ? 'Die Leistung wird monatlich abgerechnet.' : 'Die Preise verstehen sich pro Monat.');
  if (data.small_business) notes.push(isInvoice ? SMALL_BUSINESS_NOTE : SMALL_BUSINESS_OFFER_NOTE);
  if (isInvoice) {
    notes.push(
      `Bitte überweisen Sie den Rechnungsbetrag${doc.due_on ? ` bis zum ${formatDay(doc.due_on)}` : ''} unter Angabe der Rechnungsnummer ${doc.number} auf das unten genannte Konto.`,
    );
    if (data.late_notice) notes.push(LATE_NOTE);
    if (data.property_work) notes.push(PROPERTY_NOTE);
  } else if (doc.due_on) {
    notes.push(`Dieses Angebot ist gültig bis zum ${formatDay(doc.due_on)}. Ich freue mich auf Ihre Zusage!`);
  }
  return notes;
}

/** Name, unter dem der Absender auftritt (Firma oder Inhaber). */
export function sellerName(s: Seller): string {
  return (s.company_name || s.owner_name || '').trim();
}

// ---------------------------------------------------------------------------
// Widerrufsrecht für Privatkunden (Online-Annahme = Fernabsatzvertrag)
// ---------------------------------------------------------------------------

export type WithdrawalSection = { heading: string; paragraphs: string[] };

/** Name, Anschrift, Telefon und E-Mail des Selbstständigen in einer Zeile (für Belehrung und Formular). */
export function sellerContactLine(s: Seller, withPhone = true): string {
  return [
    sellerName(s),
    s.street,
    [s.zip, s.city].filter(Boolean).join(' '),
    withPhone && s.phone ? `Tel. ${s.phone}` : null,
    s.email ? `E-Mail ${s.email}` : null,
  ]
    .map((v) => v?.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Gestaltungshinweis 3 des Musters: Pflicht, weil es auf der Angebotsseite die
 * Schaltfläche „Vertrag widerrufen“ gibt (§ 356a BGB, Skript 20261203090000_widerruf_online.sql).
 */
export const ONLINE_WITHDRAWAL_NOTE =
  'Sie können Ihr Widerrufsrecht auch online unter dem Link zu diesem Angebot (Schaltfläche „Vertrag widerrufen“) ausüben. Wenn Sie diese Online-Funktion nutzen, übermitteln wir Ihnen auf einem dauerhaften Datenträger (z. B. durch eine E-Mail) unverzüglich eine Eingangsbestätigung mit Informationen zum Inhalt der Widerrufserklärung sowie dem Datum und der Uhrzeit ihres Eingangs.';

/** Vertrag, wie er im Widerrufs-Formular vorausgefüllt wird */
export function withdrawalContract(number: string, issuedOn: string): string {
  return `Angebot ${number} vom ${formatDay(issuedOn)}`;
}

/** Wortlaut der Erklärung – gleich in der Funktion "mail" (Eingangsbestätigung) */
export function withdrawalStatement(contract: string): string {
  return `Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ${contract}`;
}

/**
 * Widerrufsbelehrung für Dienstleistungen: Wortlaut des Musters aus Anlage 1 zu
 * Art. 246a § 1 Abs. 2 Satz 2 EGBGB (Gestaltungshinweise: Dienstleistung, Frist
 * ab Vertragsabschluss, Online-Widerrufsfunktion, Absatz zum Wertersatz).
 * Nur Text einsetzen, nicht umformulieren.
 *
 * `online = false` lässt den Satz zur Online-Widerrufsfunktion weg – nur, wenn der
 * Kunde gar keinen Link zum Angebot hat (z. B. PDF ohne Online-Angebot).
 */
export function withdrawalNotice(s: Seller, online = true): WithdrawalSection[] {
  return [
    {
      heading: 'Widerrufsrecht',
      paragraphs: [
        'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
        'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
        `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${sellerContactLine(s)}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.${online ? ` ${ONLINE_WITHDRAWAL_NOTE}` : ''}`,
        'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
      ],
    },
    {
      heading: 'Folgen des Widerrufs',
      paragraphs: [
        'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
        'Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.',
      ],
    },
  ];
}

/** Muster-Widerrufsformular (Anlage 2 zu Art. 246a § 1 Abs. 2 Satz 1 Nr. 1 EGBGB) mit Name, Anschrift und E-Mail. */
export function withdrawalForm(s: Seller): string[] {
  return [
    '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
    `– An ${sellerContactLine(s, false)}:`,
    '– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)',
    '– Bestellt am (*)/erhalten am (*)',
    '– Name des/der Verbraucher(s)',
    '– Anschrift des/der Verbraucher(s)',
    '– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
    '– Datum',
    '(*) Unzutreffendes streichen.',
  ];
}

/**
 * Früher Start: Wertersatz gibt es nur, wenn der Kunde ausdrücklich verlangt, dass vor
 * Ablauf der Frist begonnen wird (§ 357a Abs. 2 BGB) – per E-Mail ist das nachweisbar.
 */
export function earlyStartHint(s: Seller): string {
  const who = sellerName(s) || 'Ihr Auftragnehmer';
  return s.email
    ? `Soll ${who} schon vor Ablauf der Widerrufsfrist anfangen? Dann schreiben Sie das bitte ausdrücklich per E-Mail an ${s.email}.`
    : `Soll ${who} schon vor Ablauf der Widerrufsfrist anfangen? Dann teilen Sie das bitte ausdrücklich schriftlich mit, zum Beispiel per E-Mail.`;
}

/**
 * Fehlende Angaben, ohne die das Dokument nicht erstellt werden sollte.
 * Rechnungen brauchen u. a. vollständige Anschrift und Steuernummer
 * oder USt-IdNr. (§ 14 UStG).
 */
export function missingSellerFields(s: Seller, kind: DocumentKind): string[] {
  const missing: string[] = [];
  if (!sellerName(s)) missing.push('Firmenname oder Inhaber');
  if (!s.street?.trim()) missing.push('Straße und Hausnummer');
  if (!s.zip?.trim() || !s.city?.trim()) missing.push('PLZ und Ort');
  if (kind === 'invoice') {
    if (!s.tax_number?.trim() && !s.vat_id?.trim()) missing.push('Steuernummer oder USt-IdNr.');
    if (!s.iban?.trim()) missing.push('IBAN für die Überweisung');
  }
  // UG/GmbH: Pflichtangaben auf allen Geschäftsbriefen (§ 35a GmbHG)
  if (s.legal_form === 'ug' || s.legal_form === 'gmbh') {
    if (!s.register_court?.trim() || !s.register_number?.trim()) missing.push('Registergericht und HRB-Nummer');
    if (!s.managing_director?.trim()) missing.push('Geschäftsführer/in');
  }
  return missing;
}

/** Zusatzzeilen für die Fußzeile je nach Rechtsform (Pflicht- bzw. empfohlene Angaben). */
export function legalFooterLines(s: Seller): string[] {
  const t = (v?: string | null) => v?.trim() ?? '';
  switch (s.legal_form) {
    case 'gbr':
      return t(s.partners) ? [`Gesellschafter: ${t(s.partners)}`] : [];
    case 'ug':
    case 'gmbh': {
      const lines: string[] = [];
      if (t(s.city)) lines.push(`Sitz: ${t(s.city)}`);
      const reg = [t(s.register_court) && `Registergericht ${t(s.register_court)}`, t(s.register_number)].filter(Boolean).join(', ');
      if (reg) lines.push(reg);
      if (t(s.managing_director)) lines.push(`Geschäftsführung: ${t(s.managing_director)}`);
      return lines;
    }
    default:
      // Einzelunternehmen/Freiberufler mit Fantasienamen: Vor- und Nachname gehört dazu
      return t(s.company_name) && t(s.owner_name) && t(s.company_name) !== t(s.owner_name) ? [`Inhaber/in: ${t(s.owner_name)}`] : [];
  }
}

/** Hinweis, wenn der Firmenname nicht zur Rechtsform passt (z. B. UG ohne Zusatz). */
export function legalNameHint(s: Pick<Seller, 'legal_form' | 'company_name'>): string | null {
  const name = s.company_name?.trim() ?? '';
  if (!name) return null;
  if (s.legal_form === 'ug' && !/UG\s*\(haftungsbeschränkt\)|Unternehmergesellschaft\s*\(haftungsbeschränkt\)/i.test(name))
    return 'Bei einer UG muss „UG (haftungsbeschränkt)“ im Firmennamen stehen.';
  if (s.legal_form === 'gmbh' && !/GmbH|Gesellschaft mit beschränkter Haftung/i.test(name))
    return 'Bei einer GmbH muss „GmbH“ im Firmennamen stehen.';
  if (s.legal_form === 'gbr' && !/GbR|Gesellschaft bürgerlichen Rechts/i.test(name))
    return 'Tipp: Schreib „GbR“ hinter euren Namen, damit Kunden die Rechtsform erkennen.';
  return null;
}

/** Fehlende Angaben zum Kunden (Rechnung: Name und Anschrift sind Pflicht). */
export function missingBuyerFields(b: Buyer, kind: DocumentKind): string[] {
  const missing: string[] = [];
  if (!b.name?.trim()) missing.push('Name des Kunden');
  if (kind === 'invoice' && !b.address?.trim()) missing.push('Anschrift des Kunden');
  return missing;
}

/** Datum "JJJJ-MM-TT" + Tage -> "JJJJ-MM-TT" */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Heute als "JJJJ-MM-TT" (lokale Zeit) */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "JJJJ-MM-TT" -> "TT.MM.JJJJ" */
export function formatDay(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

// ---------------------------------------------------------------------------
// Texte zum Verschicken (E-Mail, WhatsApp)
// ---------------------------------------------------------------------------

export type MessageInput = {
  kind: DocumentKind;
  number: string;
  due_on: string | null;
  data: DocumentData;
  /** Aktueller Name des Kunden – sonst der Name, der auf dem Dokument steht */
  customerName?: string | null;
};

/** Betreff + Text für die E-Mail, kürzerer Text für WhatsApp & Co. */
export type DocumentMessage = { subject: string; body: string; chat: string };

/** Fertige Nachricht zu einem Angebot bzw. einer Rechnung (Sie-Form wie im PDF). */
export function documentMessage(doc: MessageInput): DocumentMessage {
  const { data } = doc;
  const isInvoice = doc.kind === 'invoice';
  const name = (doc.customerName || data.buyer.name || '').trim();
  const greeting = name ? `Guten Tag ${name},` : 'Guten Tag,';
  const what = data.items.length === 1 ? data.items[0].description.trim() : '';
  const forWhat = what ? ` für „${what}“` : '';
  const amount = formatMoney(data.totals.gross) + (!isInvoice && data.monthly ? ' pro Monat' : '');
  const due = formatDay(doc.due_on);
  const s = data.seller;
  const company = sellerName(s);
  const sender = (s.owner_name || company).trim();
  const signature = [sender, company !== sender ? company : '', s.phone ? `Tel. ${s.phone}` : '', s.website ?? '']
    .map((l) => l.trim())
    .filter(Boolean);

  const subject = `${isInvoice ? 'Rechnung' : 'Angebot'} ${doc.number}${what ? ` – ${what}` : ''}`;

  const paragraphs = isInvoice
    ? [
        greeting,
        `vielen Dank für Ihren Auftrag. Im Anhang finden Sie die Rechnung ${doc.number}${forWhat} über ${amount}.`,
        `Bitte überweisen Sie den Betrag${due ? ` bis zum ${due}` : ''} unter Angabe der Rechnungsnummer ${doc.number} auf das in der Rechnung genannte Konto.`,
      ]
    : [
        greeting,
        `vielen Dank für Ihre Anfrage. Im Anhang finden Sie mein Angebot ${doc.number}${forWhat} über ${amount}.${due ? ` Das Angebot ist gültig bis zum ${due}.` : ''}`,
        'Bei Fragen melden Sie sich gern bei mir. Ich freue mich auf Ihre Rückmeldung!',
      ];
  const body = [...paragraphs, ['Mit freundlichen Grüßen', ...signature].join('\n')].join('\n\n');

  const bye = sender ? ` Viele Grüße, ${sender}` : ' Viele Grüße';
  const chat = isInvoice
    ? `${greeting} anbei die Rechnung ${doc.number}${forWhat} über ${amount}${due ? `, zahlbar bis ${due}` : ''}. Vielen Dank für Ihren Auftrag!${bye}`
    : `${greeting} anbei mein Angebot ${doc.number}${forWhat} über ${amount}${due ? ` (gültig bis ${due})` : ''}. Bei Fragen melden Sie sich gern!${bye}`;

  return { subject, body, chat };
}

/**
 * Telefonnummer für WhatsApp-Links: nur Ziffern mit Ländervorwahl,
 * z. B. "0171 1234567" -> "491711234567". Ohne Vorwahl gilt Deutschland.
 * null, wenn es keine brauchbare Nummer ist.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim().replace(/\(0\)/g, '');
  let digits = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `49${digits.slice(1)}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

const encode = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, '\r\n'));

/** mailto:-Link mit Empfänger, Betreff und Text (ungültige Adresse = ohne Empfänger). */
export function mailtoUrl(to: string | null | undefined, subject: string, body: string): string {
  const address = to?.trim() ?? '';
  const valid = /^[^\s@<>?&,;]+@[^\s@<>?&,;]+\.[^\s@<>?&,;]+$/.test(address);
  return `mailto:${valid ? address : ''}?subject=${encode(subject)}&body=${encode(body)}`;
}

/** WhatsApp-Link mit fertigem Text (ohne Nummer wählt man den Kontakt selbst). */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  return `https://wa.me/${whatsappNumber(phone) ?? ''}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Muster-Rechnung (Vorschau im Bereich "Firma")
// ---------------------------------------------------------------------------

/** Beispiel-Rechnung mit den eigenen Firmendaten – nur zur Ansicht, wird nicht gespeichert. */
export function sampleInvoice(seller: Seller, today: string = todayIso()) {
  const items: LineItem[] = [
    { description: 'Beispiel-Leistung', details: 'So sieht eine Position auf deinen Rechnungen aus', quantity: 1, unit: 'pauschal', unit_price: 100 },
  ];
  const data: DocumentData = {
    kind: 'invoice',
    seller,
    buyer: { name: 'Max Mustermann', company: null, address: 'Musterstraße 1, 12345 Musterstadt', email: null },
    items,
    totals: computeTotals(items, 0, seller.small_business, seller.vat_rate),
    small_business: seller.small_business,
    service_date: today,
    service_period: null,
    monthly: false,
    late_notice: true,
  };
  return { kind: 'invoice' as const, number: 'RE-MUSTER', issued_on: today, due_on: addDays(today, seller.payment_days || 0), data };
}
