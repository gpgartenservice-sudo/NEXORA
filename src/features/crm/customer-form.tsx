import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spacing } from '@/constants/theme';
import { validateEmail } from '@/lib/validation';

import type { CustomerInput } from './crm-provider';

type Props = {
  initial?: Partial<CustomerInput>;
  submitLabel: string;
  onSubmit: (input: CustomerInput) => Promise<{ error?: string }>;
};

const clean = (v: string) => (v.trim() === '' ? null : v.trim());

/** Formular für Kundendaten (Anlegen und Bearbeiten). */
export function CustomerForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const next = {
      name: name.trim() ? undefined : 'Bitte gib einen Namen ein.',
      email: email.trim() && validateEmail(email) ? validateEmail(email) : undefined,
    };
    setErrors(next);
    setFailure(null);
    setSaved(false);
    if (next.name || next.email) return;
    setSaving(true);
    const { error } = await onSubmit({
      name: name.trim(),
      company: clean(company),
      phone: clean(phone),
      email: clean(email),
      address: clean(address),
      notes: clean(notes),
    });
    setSaving(false);
    if (error) setFailure(error);
    else setSaved(true);
  };

  const touch = () => saved && setSaved(false);

  return (
    <View style={styles.form}>
      <TextField
        label="Name *"
        value={name}
        onChangeText={(v) => {
          setName(v);
          touch();
          if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
        }}
        error={errors.name}
        placeholder="Vor- und Nachname oder Firmenname"
        autoCapitalize="words"
        maxLength={120}
      />
      <TextField
        label="Firma"
        value={company}
        onChangeText={(v) => {
          setCompany(v);
          touch();
        }}
        placeholder="optional"
        maxLength={120}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Telefon"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              touch();
            }}
            placeholder="0176 1234567"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            maxLength={60}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="E-Mail"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              touch();
              if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
            }}
            error={errors.email}
            placeholder="name@beispiel.de"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={160}
          />
        </View>
      </View>
      <TextField
        label="Adresse"
        value={address}
        onChangeText={(v) => {
          setAddress(v);
          touch();
        }}
        placeholder="Straße, Hausnummer, PLZ, Ort"
        maxLength={300}
      />
      <TextField
        label="Notizen"
        value={notes}
        onChangeText={(v) => {
          setNotes(v);
          touch();
        }}
        placeholder="Was du dir zu diesem Kunden merken willst"
        multiline
        style={styles.notes}
        maxLength={5000}
      />
      {failure && <Notice tone="error">{failure}</Notice>}
      {saved && <Notice tone="success">Gespeichert.</Notice>}
      <Button label={submitLabel} onPress={submit} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  row: { flexDirection: 'row', gap: Spacing.lg, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 220 },
  notes: { minHeight: 90, paddingVertical: Spacing.md, textAlignVertical: 'top' },
});
