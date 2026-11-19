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
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { parseEuro } from '@/features/crm/order-logic';
import { useHover } from '@/hooks/use-hover';

import {
  DEFAULT_CATEGORIES,
  KINDS,
  UNITS,
  categoryCounts,
  formatAmount,
  parseAmount,
  statusOptions,
  type InventoryItem,
  type InventoryKind,
  type InventoryStatus,
} from './inventory-logic';
import { useInventory, type InventoryInput } from './inventory-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/inventar'));

const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Neuer Eintrag (Route /inventar/neu?art=produkt|geraet) */
export function InventoryNewScreen() {
  const { art } = useLocalSearchParams<{ art?: string }>();
  return <InventoryEditor initialKind={art === 'produkt' ? 'produkt' : 'geraet'} />;
}

/** Eintrag bearbeiten (Route /inventar/[id]) */
export function InventoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, loading } = useInventory();
  const item = items.find((e) => e.id === id);
  if (!item) {
    return (
      <Screen maxWidth={680}>
        <PageHeader title="Lagerbestand" back={{ label: 'Lagerbestand', onPress: back }} />
        {!loading && <Notice>Diesen Eintrag gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <InventoryEditor key={item.id} item={item} initialKind={item.kind} />;
}

function InventoryEditor({ item, initialKind }: { item?: InventoryItem; initialKind: InventoryKind }) {
  const { items, createItem, updateItem, deleteItem, error: setupError } = useInventory();
  const [kind, setKind] = useState<InventoryKind>(initialKind);
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item?.price != null ? money(item.price) : '');
  const [salePrice, setSalePrice] = useState(item?.sale_price != null ? money(item.sale_price) : '');
  const [quantity, setQuantity] = useState(item ? formatAmount(item.quantity) : initialKind === 'produkt' ? '' : '1');
  const [unit, setUnit] = useState(item?.unit ?? 'Stück');
  const [minQuantity, setMinQuantity] = useState(item?.min_quantity != null ? formatAmount(item.min_quantity) : '');
  const [status, setStatus] = useState<InventoryStatus>(item?.status ?? 'in_betrieb');
  const [category, setCategory] = useState(item?.category ?? '');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(item?.purchase_date ?? null);
  const [location, setLocation] = useState(item?.location ?? '');
  const [serial, setSerial] = useState(item?.serial_number ?? '');
  const [shop, setShop] = useState(item?.shop ?? '');
  const [url, setUrl] = useState(item?.product_url ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [errors, setErrors] = useState<Partial<Record<'name' | 'price' | 'sale' | 'quantity' | 'min' | 'unit' | 'url', string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const product = kind === 'produkt';
  const unitLabel = unit.trim() || 'Stück';

  // eigene Kategorien dieser Art zuerst, dann Vorschläge
  const suggestions = useMemo(() => {
    const own = categoryCounts(items.filter((it) => it.kind === kind)).map((c) => c.name);
    const defaults = DEFAULT_CATEGORIES[kind].filter((d) => !own.some((o) => o.toLowerCase() === d.toLowerCase()));
    return [...own, ...defaults].slice(0, 12);
  }, [items, kind]);

  const switchKind = (k: InventoryKind) => {
    setKind(k);
    // Geräte zählen in Stück – leere Anzahl heißt dann 1
    if (k === 'geraet' && !quantity.trim()) setQuantity('1');
    // Zustände wie „In Reparatur“ gibt es bei Produkten nicht
    if (!statusOptions(k).some((s) => s.key === status)) setStatus('in_betrieb');
  };

  const save = async () => {
    const parsedPrice = parseEuro(price);
    const parsedSale = product ? parseEuro(salePrice) : null;
    const qty = parseAmount(quantity);
    const min = product ? parseAmount(minQuantity) : null;
    const cleanUrl = url.trim();
    const badMoney = (v: ReturnType<typeof parseEuro>) => v === 'invalid' || (typeof v === 'number' && v < 0);
    const problems = {
      name: name.trim() ? undefined : product ? 'Wie heißt das Produkt?' : 'Wie heißt das Gerät?',
      price: badMoney(parsedPrice) ? 'Bitte einen Preis wie 349,99 eingeben.' : undefined,
      sale: badMoney(parsedSale) ? 'Bitte einen Preis wie 12,90 eingeben.' : undefined,
      quantity:
        qty === 'invalid' || (!product && qty !== null && !Number.isInteger(qty))
          ? product
            ? 'Bitte eine Menge wie 12 oder 2,5 eingeben.'
            : 'Bitte eine ganze Zahl eingeben.'
          : undefined,
      min: min === 'invalid' ? 'Bitte eine Menge wie 5 oder 0,5 eingeben.' : undefined,
      unit: unitLabel.length > 20 ? 'Höchstens 20 Zeichen.' : undefined,
      url: !cleanUrl || /^https?:\/\/\S+$/i.test(cleanUrl) ? undefined : 'Der Link muss mit https:// beginnen.',
    };
    setErrors(problems);
    setFailure(null);
    if (Object.values(problems).some(Boolean)) return;
    const input: InventoryInput = {
      name: name.trim(),
      kind,
      price: parsedPrice as number | null,
      sale_price: product ? (parsedSale as number | null) : null,
      quantity: (qty as number | null) ?? (product ? 0 : 1),
      unit: product ? unitLabel : 'Stück',
      min_quantity: product ? (min as number | null) : null,
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
        title={item ? item.name : product ? 'Neues Produkt' : 'Neues Gerät'}
        subtitle={item ? undefined : product ? 'Ware, Material, Verbrauch – mit Menge im Lager.' : 'Gerät, Werkzeug, Fahrzeug – mit Wert und Zustand.'}
        back={{ label: 'Lagerbestand', onPress: back }}
      />
      {setupError === 'setup' && (
        <Notice tone="error">Der Lagerbestand ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql).</Notice>
      )}
      {failure && <Notice tone="error">{failure}</Notice>}

      <Reveal delay={60}>
        <Segmented
          label="Was ist es?"
          value={kind}
          options={KINDS.map((k) => ({ value: k.key, label: k.label }))}
          onChange={switchKind}
        />
      </Reveal>

      <Reveal delay={100}>
        <Card>
          <TextField
            label="Name *"
            value={name}
            onChangeText={setName}
            error={errors.name}
            placeholder={product ? 'z. B. Rasendünger, Shampoo, Schrauben 4×40' : 'z. B. Akku-Heckenschere'}
          />

          {product ? (
            <>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField
                    label={`Im Lager (${unitLabel})`}
                    value={quantity}
                    onChangeText={setQuantity}
                    error={errors.quantity}
                    keyboardType="decimal-pad"
                    placeholder="z. B. 12"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label={`Mindestbestand (${unitLabel})`}
                    value={minQuantity}
                    onChangeText={setMinQuantity}
                    error={errors.min}
                    keyboardType="decimal-pad"
                    placeholder="z. B. 3"
                  />
                </View>
              </View>
              <Text style={styles.hint}>Fällt die Menge auf den Mindestbestand, zeigt Lunaxora „Wird knapp“.</Text>

              <Text style={styles.label}>EINHEIT</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Einheit">
                {UNITS.map((u) => (
                  <Chip key={u} label={u} small active={unitLabel === u} onPress={() => setUnit(u)} />
                ))}
              </View>
              {!UNITS.includes(unitLabel) || unit === '' ? (
                <TextField label="Eigene Einheit" value={unit} onChangeText={setUnit} error={errors.unit} placeholder="z. B. Eimer" />
              ) : (
                <TextLink label="Andere Einheit" onPress={() => setUnit('')} />
              )}

              <View style={styles.row}>
                <View style={styles.flex}>
                  <TextField
                    label={`Einkaufspreis pro ${unitLabel} (€)`}
                    value={price}
                    onChangeText={setPrice}
                    error={errors.price}
                    keyboardType="decimal-pad"
                    placeholder="z. B. 4,20"
                  />
                </View>
                <View style={styles.flex}>
                  <TextField
                    label={`Verkaufspreis pro ${unitLabel} (€)`}
                    value={salePrice}
                    onChangeText={setSalePrice}
                    error={errors.sale}
                    keyboardType="decimal-pad"
                    placeholder="optional"
                  />
                </View>
              </View>
            </>
          ) : (
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
          )}

          <Text style={styles.label}>{product ? 'STATUS' : 'ZUSTAND'}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={product ? 'Status' : 'Zustand'}>
            {statusOptions(kind).map((s) => (
              <Chip key={s.key} label={s.label} active={status === s.key} onPress={() => setStatus(s.key)} />
            ))}
          </View>
          {status === 'verkauft' && (
            <Text style={styles.hint}>
              {product ? 'Ausgelistete Produkte bleiben gespeichert, zählen aber nicht mehr zum Lager.' : 'Verkaufte Geräte bleiben dokumentiert, zählen aber nicht mehr zum Wert.'}
            </Text>
          )}

          <TextField label="Kategorie" value={category} onChangeText={setCategory} placeholder={product ? 'z. B. Verkaufsware' : 'z. B. Werkzeug'} />
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
              <TextField label={product ? 'Marke / Hersteller' : 'Marke'} value={brand} onChangeText={setBrand} placeholder={product ? 'z. B. Compo' : 'z. B. Stihl'} />
            </View>
            <View style={styles.flex}>
              <DateField label={product ? 'Zuletzt gekauft' : 'Gekauft am'} value={purchaseDate} onChange={setPurchaseDate} />
            </View>
          </View>
          <TextField
            label={product ? 'Lagerort' : 'Standort / bei wem'}
            value={location}
            onChangeText={setLocation}
            placeholder={product ? 'z. B. Regal 2, Keller, Transporter' : 'z. B. Garage, Anhänger, bei Pascal'}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label={product ? 'Artikelnummer / EAN' : 'Seriennummer'}
                value={serial}
                onChangeText={setSerial}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <View style={styles.flex}>
              <TextField label={product ? 'Lieferant' : 'Gekauft bei'} value={shop} onChangeText={setShop} placeholder="z. B. OBI, Amazon, Großhandel" />
            </View>
          </View>
          <TextField
            label={product ? 'Link zum Nachbestellen' : 'Produktlink'}
            value={url}
            onChangeText={setUrl}
            error={errors.url}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://…"
          />
          {!!item?.product_url && (
            <TextLink label={product ? 'Nachbestellen öffnen' : 'Produktseite öffnen'} onPress={() => void Linking.openURL(item.product_url!)} />
          )}
          <TextField
            label="Notizen"
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder={product ? 'Haltbarkeit, Lieferzeit, Mindestabnahme …' : 'Wartung, Zubehör, Garantie bis …'}
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
          label="Eintrag löschen"
          question={
            product
              ? `„${item.name}“ wirklich löschen? Tipp: Produkte, die du nicht mehr führst, lieber auf „Ausgelistet“ setzen.`
              : `„${item.name}“ wirklich löschen? Tipp: Verkaufte Geräte lieber auf „Verkauft / Ausgemustert“ setzen – dann bleiben sie dokumentiert.`
          }
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
