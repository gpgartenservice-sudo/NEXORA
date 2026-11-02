import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { validateEmail } from '@/lib/validation';
import { useProfile } from '@/providers/profile-provider';

import { missingSellerFields, type Seller } from './document-logic';
import { useDocuments } from './documents-provider';
import { LogoCard } from './logo-card';

type Draft = Record<
  'company_name' | 'owner_name' | 'street' | 'zip' | 'city' | 'phone' | 'email' | 'website' | 'tax_number' | 'vat_id' | 'bank_name' | 'iban' | 'bic' | 'payment_days' | 'offer_validity_days',
  string
> & { small_business: boolean; vat_rate: '19' | '7' };

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
  small_business: s.small_business,
  vat_rate: s.vat_rate === 7 ? '7' : '19',
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
  };
}

/** Bereich "Firma": Logo, Firmendaten, Steuern und Bank – so stehen sie auf Angeboten und Rechnungen. */
export function CompanyScreen() {
  const { loading } = useDocuments();
  return (
    <Screen maxWidth={760}>
      <PageHeader title="Firma" subtitle="Dein Logo und deine Firmendaten – so stehen sie auf deinen Angeboten und Rechnungen." />
      {/* Formular erst zeigen, wenn die gespeicherten Daten da sind */}
      {!loading && <CompanyForm />}
    </Screen>
  );
}

function CompanyForm() {
  const { seller, hasSettings, saveSeller, error } = useDocuments();
  const { profile } = useProfile();
  const [draft, setDraft] = useState<Draft>(() => {
    const d = toDraft(seller);
    // Noch nichts gespeichert: Firmenname aus dem Onboarding vorschlagen
    if (!hasSettings && !d.company_name && profile?.business_name) d.company_name = profile.business_name;
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

  const field = (key: keyof Omit<Draft, 'small_business' | 'vat_rate'>, label: string, extra: Partial<Parameters<typeof TextField>[0]> = {}) => (
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
    };
    setErrors(next);
    setFailure(null);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    const { error: err } = await saveSeller(toValues(draft));
    setSaving(false);
    if (err) setFailure(err);
    else setSaved(true);
  };

  // Aktueller Stand der Eingaben (auch ungespeichert) – für Hinweise und Vorschau
  const preview: Seller = { ...toValues(draft), logo_id: seller.logo_id };
  const missingInvoice = missingSellerFields(preview, 'invoice');

  return (
    <>
      {error === 'setup' && (
        <Notice tone="error">Firmendaten können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).</Notice>
      )}
      {missingInvoice.length > 0 && <Notice>Für Rechnungen fehlt noch: {missingInvoice.join(', ')}.</Notice>}

      <Reveal delay={160}>
        <LogoCard preview={preview} />
      </Reveal>

      <Reveal delay={220}>
        <Card>
          <Text style={styles.cardTitle}>Absender</Text>
          {field('company_name', 'Firmenname', { placeholder: 'z. B. Lena Design Studio' })}
          {field('owner_name', 'Inhaber/in', { placeholder: 'Vor- und Nachname', autoCapitalize: 'words' })}
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
  hint: { color: Colors.textFaint, fontSize: 13 },
  disclaimer: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center' },
});
