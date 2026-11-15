import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { OptionCard } from '@/components/ui/option-card';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';

import { useCrm } from './crm-provider';
import { parseEuro } from './order-logic';
import { CrmSetupNotice } from './ui';

/**
 * Neuen Auftrag anlegen: Kunde wählen, Leistung, optional Preis. Neue Kunden
 * entstehen nur über den Datenschutz-Link (Kunden → Neuer Kunde).
 */
export function OrderNewScreen() {
  const params = useLocalSearchParams<{ customer?: string }>();
  const { customers, createOrder, customerById, error } = useCrm();
  const [customerId, setCustomerId] = useState<string | null>(params.customer ?? null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [errors, setErrors] = useState<{ customer?: string; title?: string; price?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selected = customerId ? customerById(customerId) : undefined;
  const q = query.trim().toLowerCase();
  const matches = (q ? customers.filter((c) => [c.name, c.company, c.email].some((v) => v?.toLowerCase().includes(q))) : customers).slice(0, 6);

  const submit = async () => {
    const parsedPrice = parseEuro(price);
    const next = {
      customer: selected ? undefined : 'Bitte wähle einen Kunden aus der Liste.',
      title: title.trim() ? undefined : 'Was ist zu tun? (z. B. „Website erstellen“)',
      price: parsedPrice === 'invalid' ? 'Bitte gib einen Betrag wie 1.250,00 ein.' : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (next.customer || next.title || next.price) return;

    if (!selected) return;
    setSaving(true);
    const { data, error: err } = await createOrder({
      customer_id: selected.id,
      title: title.trim(),
      description: description.trim() || null,
      price: parsedPrice === 'invalid' ? null : parsedPrice,
    });
    setSaving(false);
    if (err || !data) {
      setFailure(err ?? 'Der Auftrag konnte nicht angelegt werden.');
      return;
    }
    router.replace(`/auftraege/${data.id}`);
  };

  return (
    <Screen maxWidth={720}>
      <PageHeader
        title="Neuer Auftrag"
        subtitle="Den Rest – Termin, Angebot, Ausführung – trägst du danach im Auftrag ein."
        back={{ label: 'Aufträge', onPress: () => router.navigate('/auftraege') }}
      />
      <CrmSetupNotice error={error} />

      <Reveal delay={220}>
        <Card>
          <Text style={styles.cardTitle}>Für welchen Kunden?</Text>
          {selected ? (
            <View style={styles.selected}>
              <Text style={styles.selectedName}>{selected.name}</Text>
              <TextLink label="Ändern" onPress={() => setCustomerId(null)} />
            </View>
          ) : (
            <View style={styles.picker}>
              <TextField
                label="Kunde suchen"
                value={query}
                onChangeText={(v) => {
                  setQuery(v);
                  if (errors.customer) setErrors((e) => ({ ...e, customer: undefined }));
                }}
                error={errors.customer}
                placeholder="Name oder Firma"
                autoCorrect={false}
              />
              {matches.map((c) => (
                <OptionCard key={c.id} compact title={c.name} description={c.company ?? undefined} selected={false} onPress={() => setCustomerId(c.id)} />
              ))}
              {(!!q && matches.length === 0) || customers.length === 0 ? (
                <View style={styles.newCustomer}>
                  <Text style={styles.hint}>
                    {customers.length === 0 ? 'Du hast noch keine Kunden.' : `Kein Kunde gefunden für „${query.trim()}“.`} Neue
                    Kunden tragen ihre Daten selbst ein – du brauchst nur ihre E-Mail-Adresse.
                  </Text>
                  <Button label="Neuen Kunden einladen" variant="secondary" onPress={() => router.push('/kunden/neu')} />
                </View>
              ) : null}
            </View>
          )}
        </Card>
      </Reveal>

      <Reveal delay={320}>
        <Card>
          <Text style={styles.cardTitle}>Was ist zu tun?</Text>
          <TextField
            label="Leistung *"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              if (errors.title) setErrors((e) => ({ ...e, title: undefined }));
            }}
            error={errors.title}
            placeholder="z. B. Website erstellen, Hecke schneiden, Fotoshooting"
            maxLength={200}
          />
          <TextField
            label="Beschreibung"
            value={description}
            onChangeText={setDescription}
            placeholder="Details, Wünsche des Kunden, Umfang …"
            multiline
            style={styles.multiline}
            maxLength={5000}
          />
          <TextField
            label="Preis in €"
            value={price}
            onChangeText={(v) => {
              setPrice(v);
              if (errors.price) setErrors((e) => ({ ...e, price: undefined }));
            }}
            error={errors.price}
            hint="Optional – kannst du auch später eintragen."
            placeholder="z. B. 1.250,00"
            keyboardType="decimal-pad"
          />
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      <Reveal delay={400}>
        <Button label="Auftrag anlegen" onPress={submit} loading={saving} />
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  picker: { gap: Spacing.sm },
  selected: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectedName: { color: Colors.text, fontSize: 17, fontWeight: '600' },
  hint: { color: Colors.textFaint, fontSize: 13 },
  newCustomer: { gap: Spacing.sm, alignItems: 'flex-start' },
  multiline: { minHeight: 90, paddingVertical: Spacing.md, textAlignVertical: 'top' },
});
