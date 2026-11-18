import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { validReviewUrl } from '@/features/dunning/dunning-logic';
import { LEGAL_FORMS, isCorporation } from '@/features/onboarding/options';
import { BUSINESS_SEATS } from '@/features/plan/plan-logic';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';
import { validateEmail } from '@/lib/validation';
import { useProfile } from '@/providers/profile-provider';

import { LEGAL_KEYS, legalFooterLines, legalNameHint, missingSellerFields, type Seller, type SellerLegalForm } from './document-logic';
import { useDocuments } from './documents-provider';
import { LogoCard } from './logo-card';

type Draft = Record<
  | 'company_name'
  | 'owner_name'
  | 'street'
  | 'zip'
  | 'city'
  | 'phone'
  | 'email'
  | 'website'
  | 'tax_number'
  | 'vat_id'
  | 'bank_name'
  | 'iban'
  | 'bic'
  | 'payment_days'
  | 'offer_validity_days'
  | 'review_url'
  | 'privacy_url'
  | 'partners'
  | 'managing_director'
  | 'register_court'
  | 'register_number',
  string
> & { small_business: boolean; vat_rate: '19' | '7'; legal_form: SellerLegalForm | null };

const toDraft = (s: Seller): Draft => ({
  company_name: s.company_name ?? '',
  owner_name: s.owner_name ?? '',
  street: s.street ?? '',
  zip: s.zip ?? '',
  city: s.city ?? '',
  phone: s.phone ?? '',
  email: s.email ?? '',
  website: s.website ?? '',
  tax_number: s.tax_number ?? '',
  vat_id: s.vat_id ?? '',
  bank_name: s.bank_name ?? '',
  iban: s.iban ?? '',
  bic: s.bic ?? '',
  payment_days: String(s.payment_days),
  offer_validity_days: String(s.offer_validity_days),
  review_url: s.review_url ?? '',
  privacy_url: s.privacy_url ?? '',
  small_business: s.small_business,
  vat_rate: s.vat_rate === 7 ? '7' : '19',
  legal_form: s.legal_form ?? null,
  partners: s.partners ?? '',
  managing_director: s.managing_director ?? '',
  register_court: s.register_court ?? '',
  register_number: s.register_number ?? '',
});

const clean = (v: string) => (v.trim() ? v.trim() : null);

/** Eingaben -> Firmendaten (ohne Logo; das wird direkt beim Hochladen gespeichert). */
function toValues(draft: Draft): Omit<Seller, 'logo_id'> {
  const iban = draft.iban.replace(/\s+/g, '').toUpperCase();
  return {
    company_name: clean(draft.company_name),
    owner_name: clean(draft.owner_name),
    street: clean(draft.street),
    zip: clean(draft.zip),
    city: clean(draft.city),
    phone: clean(draft.phone),
    email: clean(draft.email),
    website: clean(draft.website),
    tax_number: clean(draft.tax_number),
    vat_id: clean(draft.vat_id),
    bank_name: clean(draft.bank_name),
    iban: iban ? iban.replace(/(.{4})/g, '$1 ').trim() : null,
    bic: clean(draft.bic.toUpperCase()),
    payment_days: Number(draft.payment_days),
    offer_validity_days: Number(draft.offer_validity_days),
    small_business: draft.small_business,
    vat_rate: Number(draft.vat_rate),
    review_url: clean(draft.review_url),
    privacy_url: clean(draft.privacy_url),
    legal_form: draft.legal_form,
    // nur speichern, was zur Rechtsform gehört
    partners: draft.legal_form === 'gbr' ? clean(draft.partners) : null,
    managing_director: isCorporation(draft.legal_form) ? clean(draft.managing_director) : null,
    register_court: isCorporation(draft.legal_form) ? clean(draft.register_court) : null,
    register_number: isCorporation(draft.legal_form) ? clean(draft.register_number) : null,
  };
}

/** Bereich "Firma": Logo, Firmendaten, Steuern und Bank – so stehen sie auf Angeboten und Rechnungen. */
export function CompanyScreen() {
  const { loading } = useDocuments();
  useAreaTutorial('firma');
  return (
    <Screen maxWidth={760}>
      <PageHeader
        title="Firma"
        subtitle="Dein Logo und deine Firmendaten – so stehen sie auf deinen Angeboten und Rechnungen."
        help={<TutorialButton id="firma" />}
      />
      {/* Formular erst zeigen, wenn die gespeicherten Daten da sind */}
      {!loading && <CompanyForm />}
    </Screen>
  );
}

function CompanyForm() {
  const { seller, hasSettings, saveSeller, error } = useDocuments();
  const { profile, save: saveProfile } = useProfile();
  const [draft, setDraft] = useState<Draft>(() => {
    const d = toDraft(seller);
    // Noch nichts gespeichert: Firmenname aus dem Onboarding vorschlagen
    if (!hasSettings && !d.company_name && profile?.business_name) d.company_name = profile.business_name;
    // Rechtsform aus dem Onboarding übernehmen
    if (!d.legal_form && profile?.legal_form) d.legal_form = profile.legal_form;
    return d;
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const field = (key: keyof Omit<Draft, 'small_business' | 'vat_rate' | 'legal_form'>, label: string, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
    <TextField label={label} value={draft[key]} onChangeText={(v) => set(key, v)} error={errors[key]} {...extra} />
  );

  const save = async () => {
    const paymentDays = Number(draft.payment_days);
    const validity = Number(draft.offer_validity_days);
    const iban = draft.iban.replace(/\s+/g, '').toUpperCase();
    const next: Partial<Record<keyof Draft, string>> = {
      email: draft.email.trim() && validateEmail(draft.email) ? 'Bitte eine gültige E-Mail-Adresse eingeben.' : undefined,
      iban: iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban) ? 'Bitte eine gültige IBAN eingeben (z. B. DE89 3704 …).' : undefined,
      payment_days: !Number.isInteger(paymentDays) || paymentDays < 0 || paymentDays > 120 ? 'Zwischen 0 und 120 Tagen.' : undefined,
      offer_validity_days: !Number.isInteger(validity) || validity < 1 || validity > 365 ? 'Zwischen 1 und 365 Tagen.' : undefined,
      review_url:
        draft.review_url.trim() && !validReviewUrl(draft.review_url)
          ? 'Bitte den kompletten Link einfügen (beginnt mit https://).'
          : undefined,
      privacy_url:
        draft.privacy_url.trim() && !validReviewUrl(draft.privacy_url)
          ? 'Bitte den kompletten Link einfügen (beginnt mit https://).'
          : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    const values: Partial<Seller> = toValues(draft);
    // Bewertungs-Link nur mitschicken, wenn es einen gibt (oder gab) – dann klappt das Speichern
    // auch, solange das Datenbank-Skript dafür noch fehlt
    if (!values.review_url && !seller.review_url) delete values.review_url;
    // dasselbe für den Link zur Datenschutzerklärung (Skript 20261119090000_customer_invites.sql)
    if (!values.privacy_url && !seller.privacy_url) delete values.privacy_url;
    // … und für die Rechtsform (Skript 20261120090000_feinschliff.sql)
    for (const k of LEGAL_KEYS) if (!values[k] && !seller[k]) delete values[k];
    const { error: err } = await saveSeller(values);
    setSaving(false);
    if (err) return setFailure(err);
    setSaved(true);
    // Rechtsform auch im Profil, damit Tipps und Abo-Empfehlung passen
    if (draft.legal_form && draft.legal_form !== profile?.legal_form) void saveProfile({ legal_form: draft.legal_form });
  };

  // Aktueller Stand der Eingaben (auch ungespeichert) – für Hinweise und Vorschau
  const preview: Seller = { ...toValues(draft), logo_id: seller.logo_id };
  const missingInvoice = missingSellerFields(preview, 'invoice');
  const nameHint = legalNameHint(preview);
  const footer = legalFooterLines(preview);
  const team = draft.legal_form === 'gbr' || isCorporation(draft.legal_form);

  return (
    <>
      {error === 'setup' && (
        <Notice tone="error">Firmendaten können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).</Notice>
      )}
      {missingInvoice.length > 0 && <Notice>Für Rechnungen fehlt noch: {missingInvoice.join(', ')}.</Notice>}

      <TourTarget id="firma.logo">
        <Reveal delay={160}>
          <LogoCard preview={preview} />
        </Reveal>
      </TourTarget>

      <TourTarget id="firma.absender">
        <Reveal delay={220}>
          <Card>
            <Text style={styles.cardTitle}>Absender</Text>
            {field('company_name', 'Firmenname', {
              placeholder:
                draft.legal_form === 'ug'
                  ? 'z. B. Lena Design UG (haftungsbeschränkt)'
                  : draft.legal_form === 'gmbh'
                    ? 'z. B. Lena Design GmbH'
                    : draft.legal_form === 'gbr'
                      ? 'z. B. Lena & Tom Design GbR'
                      : 'z. B. Lena Design Studio',
            })}
            {!!nameHint && <Text style={styles.warn}>{nameHint}</Text>}
            {field('owner_name', team ? 'Ansprechpartner/in' : 'Inhaber/in', { placeholder: 'Vor- und Nachname', autoCapitalize: 'words' })}
            {field('street', 'Straße und Hausnummer')}
            <View style={styles.row}>
              <View style={styles.zip}>{field('zip', 'PLZ', { keyboardType: 'number-pad' })}</View>
              <View style={styles.flex}>{field('city', 'Ort')}</View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>{field('phone', 'Telefon', { keyboardType: 'phone-pad' })}</View>
              <View style={styles.flex}>{field('email', 'E-Mail', { keyboardType: 'email-address', autoCapitalize: 'none' })}</View>
            </View>
            {field('website', 'Website', { autoCapitalize: 'none', placeholder: 'optional' })}
          </Card>
        </Reveal>
      </TourTarget>

      <Reveal delay={250}>
        <Card>
          <Text style={styles.cardTitle}>Rechtsform</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Rechtsform">
            {LEGAL_FORMS.map((f) => {
              const active = draft.legal_form === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => set('legal_form', f.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {f.emoji} {f.title}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {draft.legal_form === 'gbr' && (
            <>
              {field('partners', 'Gesellschafter/innen', { placeholder: 'z. B. Lena Schmidt, Tom Becker', autoCapitalize: 'words' })}
              <Text style={styles.hint}>
                Alle Namen, kommagetrennt – sie stehen unten auf Angeboten und Rechnungen. Arbeitet ihr zu mehreren in
                Lunaxora? Mit Business teilt ihr euch ein Konto mit bis zu {BUSINESS_SEATS} Personen (Profil → Team).
              </Text>
            </>
          )}
          {isCorporation(draft.legal_form) && (
            <>
              {field('managing_director', 'Geschäftsführer/in', { placeholder: 'Vor- und Nachname (bei mehreren kommagetrennt)', autoCapitalize: 'words' })}
              <View style={styles.row}>
                <View style={styles.flex}>{field('register_court', 'Registergericht', { placeholder: 'z. B. Amtsgericht Köln' })}</View>
                <View style={styles.flex}>{field('register_number', 'Handelsregister-Nr.', { placeholder: 'z. B. HRB 12345', autoCapitalize: 'characters' })}</View>
              </View>
              <Text style={styles.hint}>
                Pflicht auf allen Geschäftsbriefen einer {draft.legal_form === 'ug' ? 'UG' : 'GmbH'} (§ 35a GmbHG): Rechtsform,
                Sitz, Registergericht, Registernummer und alle Geschäftsführer.
              </Text>
            </>
          )}
          {(draft.legal_form === 'none' || !draft.legal_form) && (
            <Text style={styles.hint}>Noch nicht angemeldet? Der Fahrplan zeigt dir Schritt für Schritt, wie du dein Gewerbe anmeldest.</Text>
          )}
          {footer.length > 0 && (
            <Text style={styles.hint}>
              Steht so in der Fußzeile deiner PDFs: {footer.join(' · ')}
            </Text>
          )}
        </Card>
      </Reveal>

      <TourTarget id="firma.steuern">
        <Reveal delay={280}>
          <Card>
            <Text style={styles.cardTitle}>Steuern</Text>
            <ToggleRow
              label="Kleinunternehmerregelung (§ 19 UStG)"
              hint="Keine Umsatzsteuer auf Rechnungen – der Preis ist der Endbetrag."
              value={draft.small_business}
              onChange={(v) => set('small_business', v)}
            />
            {!draft.small_business && (
              <Segmented
                label="Umsatzsteuersatz"
                value={draft.vat_rate}
                onChange={(v) => set('vat_rate', v)}
                options={[
                  { value: '19', label: '19 %' },
                  { value: '7', label: '7 % (ermäßigt)' },
                ]}
              />
            )}
            <View style={styles.row}>
              <View style={styles.flex}>{field('tax_number', 'Steuernummer', { placeholder: 'vom Finanzamt' })}</View>
              <View style={styles.flex}>{field('vat_id', 'USt-IdNr.', { placeholder: 'optional, z. B. DE123456789', autoCapitalize: 'characters' })}</View>
            </View>
            <Text style={styles.hint}>Auf Rechnungen muss die Steuernummer oder die USt-IdNr. stehen.</Text>
          </Card>
        </Reveal>
      </TourTarget>

      <TourTarget id="firma.bank">
        <Reveal delay={360}>
          <Card>
            <Text style={styles.cardTitle}>Bank & Fristen</Text>
            {field('bank_name', 'Bank', { placeholder: 'z. B. Sparkasse' })}
            <View style={styles.row}>
              <View style={styles.flex}>{field('iban', 'IBAN', { autoCapitalize: 'characters', placeholder: 'DE89 3704 0044 0532 0130 00' })}</View>
              <View style={styles.zip}>{field('bic', 'BIC', { autoCapitalize: 'characters' })}</View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex}>{field('payment_days', 'Zahlungsziel (Tage)', { keyboardType: 'number-pad' })}</View>
              <View style={styles.flex}>{field('offer_validity_days', 'Angebote gültig (Tage)', { keyboardType: 'number-pad' })}</View>
            </View>
          </Card>
        </Reveal>
      </TourTarget>

      <Reveal delay={420}>
        <Card>
          <Text style={styles.cardTitle}>Bewertungen</Text>
          {field('review_url', 'Link für Bewertungen', {
            autoCapitalize: 'none',
            autoCorrect: false,
            placeholder: 'https://g.page/r/…/review',
          })}
          <Text style={styles.hint}>
            Nach der Zahlung kannst du deine Kunden mit einem Klick um eine Bewertung bitten. Google: Unternehmensprofil
            öffnen → „Nach Rezensionen fragen“ → Link kopieren.
          </Text>
        </Card>
      </Reveal>

      <Reveal delay={460}>
        <Card>
          <Text style={styles.cardTitle}>Datenschutz</Text>
          {field('privacy_url', 'Link zu deiner Datenschutzerklärung', {
            autoCapitalize: 'none',
            autoCorrect: false,
            placeholder: 'https://deine-website.de/datenschutz (optional)',
          })}
          <Text style={styles.hint}>
            Neue Kunden bekommen per E-Mail einen Link, tragen ihre Daten selbst ein und bestätigen deine
            Datenschutzerklärung. Hast du keine eigene, bekommen sie die Standard-Datenschutzerklärung von Lunaxora mit
            deinem Namen, deiner Anschrift und E-Mail von oben als Verantwortlichem (Muster, keine Rechtsberatung).
          </Text>
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      {saved && <Notice tone="success">Firmendaten gespeichert.</Notice>}
      <Button label="Firmendaten speichern" onPress={save} loading={saving} />
      <Text style={styles.disclaimer}>Hinweise nach bestem Wissen (Stand 2026) – im Zweifel mit einer Steuerberatung abstimmen.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 200 },
  zip: { width: 130 },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  warn: { color: '#F5B94A', fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  chipTextActive: { color: Colors.onAccent },
  disclaimer: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center' },
});
