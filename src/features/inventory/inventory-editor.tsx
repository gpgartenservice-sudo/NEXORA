import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { parseEuro } from '@/features/crm/order-logic';
import { useHover } from '@/hooks/use-hover';

import { DEFAULT_CATEGORIES, INVENTORY_STATUS, categoryCounts, type InventoryItem, type InventoryStatus } from './inventory-logic';
import { useInventory, type InventoryInput } from './inventory-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/inventar'));

const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Neues Teil (Route /inventar/neu) */
export function InventoryNewScreen() {
  return <InventoryEditor />;
}

/** Teil bearbeiten (Route /inventar/[id]) */
export function InventoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, loading } = useInventory();
  const item = items.find((e) => e.id === id);
  if (!item) {
    return (
      <Screen maxWidth={680}>
        <PageHeader title="Inventar" back={{ label: 'Inventar', onPress: back }} />
        {!loading && <Notice>Dieses Teil gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <InventoryEditor key={item.id} item={item} />;
}

function InventoryEditor({ item }: { item?: InventoryItem }) {
  const { items, createItem, updateItem, deleteItem, error: setupError } = useInventory();
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item?.price !== null && item?.price !== undefined ? money(item.price) : '');
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1));
  const [status, setStatus] = useState<InventoryStatus>(item?.status ?? 'in_betrieb');
  const [category, setCategory] = useState(item?.category ?? '');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(item?.purchase_date ?? null);
  const [location, setLocation] = useState(item?.location ?? '');
  const [serial, setSerial] = useState(item?.serial_number ?? '');
  const [shop, setShop] = useState(item?.shop ?? '');
  const [url, setUrl] = useState(item?.product_url ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [errors, setErrors] = useState<{ name?: string; price?: string; quantity?: string; url?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // eigene Kategorien zuerst, dann Vorschläge
  const suggestions = useMemo(() => {
    const own = categoryCounts(items).map((c) => c.name);
    return [...own, ...DEFAULT_CATEGORIES.filter((d) => !own.some((o) => o.toLowerCase() === d.toLowerCase()))].slice(0, 12);
  }, [items]);

  const save = async () => {
    const parsedPrice = parseEuro(price);
    const qty = Number(quantity.trim());
    const cleanUrl = url.trim();
    const problems = {
      name: name.trim() ? undefined : 'Wie heißt das Teil?',
      price: parsedPrice === 'invalid' || (typeof parsedPrice === 'number' && parsedPrice < 0) ? 'Bitte einen Preis wie 349,99 eingeben.' : undefined,
      quantity: Number.isInteger(qty) && qty >= 0 && qty <= 100000 ? undefined : 'Bitte eine ganze Zahl eingeben.',
      url: !cleanUrl || /^https?:\/\/\S+$/i.test(cleanUrl) ? undefined : 'Der Link muss mit https:// beginnen.',
    };
    setErrors(problems);
    setFailure(null);
    if (problems.name || problems.price || problems.quantity || problems.url || parsedPrice === 'invalid') return;
    const input: InventoryInput = {
      name: name.trim(),
      price: parsedPrice,
      quantity: qty,
      status,
      category: category.trim() || null,
      brand: brand.trim() || null,
      purchase_date: purchaseDate,
      location: location.trim() || null,
      serial_number: serial.trim() || null,
      shop: shop.trim() || null,
      product_url: cleanUrl || null,
      notes: notes.trim() || null,
    };
    setSaving(true);
    const r = item ? await updateItem(item.id, input) : await createItem(input);
    setSaving(false);
    if (r.error) return setFailure(r.error);
    back();
  };

  return (
    <Screen maxWidth={680}>
      <PageHeader
        title={item ? item.name : 'Neues Teil'}
        subtitle={item ? undefined : 'Gerät, Werkzeug, Material – alles, was deinem Business gehört.'}
        back={{ label: 'Inventar', onPress: back }}
      />
      {setupError === 'setup' && (
        <Notice tone="error">Das Inventar ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql).</Notice>
      )}
      {failure && <Notice tone="error">{failure}</Notice>}

      <Reveal delay={100}>
        <Card>
          <TextField label="Name *" value={name} onChangeText={setName} error={errors.name} placeholder="z. B. Akku-Heckenschere" />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="Preis (€)"
                value={price}
                onChangeText={setPrice}
                error={errors.price}
                keyboardType="decimal-pad"
                placeholder="z. B. 349,99"
              />
            </View>
            <View style={styles.small}>
              <TextField label="Anzahl" value={quantity} onChangeText={setQuantity} error={errors.quantity} keyboardType="number-pad" />
            </View>
          </View>

          <Text style={styles.label}>ZUSTAND</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Zustand">
            {INVENTORY_STATUS.map((s) => (
              <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => setStatus(s.key)} />
            ))}
          </View>
          {status === 'verkauft' && (
            <Text style={styles.hint}>Verkaufte Teile bleiben dokumentiert, zählen aber nicht mehr zum Wert.</Text>
          )}

          <TextField label="Kategorie" value={category} onChangeText={setCategory} placeholder="z. B. Werkzeug" />
          <View style={styles.chips}>
            {suggestions.map((c) => (
              <Chip key={c} label={c} small active={category.trim().toLowerCase() === c.toLowerCase()} onPress={() => setCategory(c)} />
            ))}
          </View>
        </Card>
      </Reveal>

      <Reveal delay={160}>
        <Card>
          <Text style={styles.cardTitle}>Details</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField label="Marke" value={brand} onChangeText={setBrand} placeholder="z. B. Stihl" />
            </View>
            <View style={styles.flex}>
              <DateField label="Gekauft am" value={purchaseDate} onChange={setPurchaseDate} />
            </View>
          </View>
          <TextField label="Standort / bei wem" value={location} onChangeText={setLocation} placeholder="z. B. Garage, Anhänger, bei Pascal" />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField label="Seriennummer" value={serial} onChangeText={setSerial} autoCapitalize="characters" autoCorrect={false} />
            </View>
            <View style={styles.flex}>
              <TextField label="Gekauft bei" value={shop} onChangeText={setShop} placeholder="z. B. OBI, Amazon" />
            </View>
          </View>
          <TextField
            label="Produktlink"
            value={url}
            onChangeText={setUrl}
            error={errors.url}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…"
          />
          {!!item?.product_url && <TextLink label="Produktseite öffnen" onPress={() => void Linking.openURL(item.product_url!)} />}
          <TextField
            label="Notizen"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Wartung, Zubehör, Garantie bis …"
            style={styles.notes}
          />
        </Card>
      </Reveal>

      <View style={styles.actions}>
        <Button label={item ? 'Speichern' : 'Eintragen'} loading={saving} onPress={() => void save()} />
        <Button label="Abbrechen" variant="secondary" onPress={back} />
      </View>

      {item && (
        <ConfirmDelete
          label="Teil löschen"
          question={`„${item.name}“ wirklich löschen? Tipp: Verkaufte Teile lieber auf „Verkauft / Ausgemustert“ setzen – dann bleiben sie dokumentiert.`}
          onConfirm={async () => {
            const r = await deleteItem(item.id);
            if (r.error) setFailure(r.error);
            else back();
          }}
        />
      )}
    </Screen>
  );
}

function Chip({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      style={[styles.chip, small && styles.chipSmall, active && styles.chipActive, hovered && !active && styles.chipHover]}>
      <Text style={[styles.chipText, small && styles.chipTextSmall, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  flex: { flexGrow: 1, flexBasis: 200 },
  small: { flexBasis: 110, flexGrow: 0 },
  label: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  hint: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  chipHover: { backgroundColor: Colors.surfaceRaised },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  chipTextSmall: { fontSize: 12.5, color: Colors.textMuted },
  chipTextActive: { color: Colors.onAccent },
  notes: { minHeight: 80, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
});
