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

/** Neuen Auftrag anlegen: Kunde wählen (oder neu anlegen), Leistung, optional Preis. */
export function OrderNewScreen() {
  const params = useLocalSearchParams<{ customer?: string }>();
  const { customers, createCustomer, createOrder, customerById, error } = useCrm();
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
      customer: selected || q ? undefined : 'Bitte wähle einen Kunden.',
      title: title.trim() ? undefined : 'Was ist zu tun? (z. B. „Website erstellen“)',
      price: parsedPrice === 'invalid' ? 'Bitte gib einen Betrag wie 1.250,00 ein.' : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (next.customer || next.title || next.price) return;

    setSaving(true);
    let id = selected?.id;
    // Kunde noch nicht vorhanden -> mit anlegen
    if (!id) {
      const created = await createCustomer({ name: query.trim(), company: null, phone: null, email: null, address: null, notes: null });
      if (created.error || !created.data) {
        setSaving(false);
        setFailure(created.error ?? 'Der Kunde konnte nicht angelegt werden.');
        return;
      }
      id = created.data.id;
    }
    const { data, error: err } = await createOrder({
      customer_id: id,
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
                label="Kunde suchen oder neu eingeben"
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
              {!!q && !customers.some((c) => c.name.toLowerCase() === q) && (
                <Text style={styles.hint}>Kein passender Kunde? „{query.trim()}“ wird beim Speichern als neuer Kunde angelegt.</Text>
              )}
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
  multiline: { minHeight: 90, paddingVertical: Spacing.md, textAlignVertical: 'top' },
});
