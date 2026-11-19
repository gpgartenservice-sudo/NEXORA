import { CloudSun } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useDocuments } from '@/features/documents/documents-provider';
import { dayKey } from '@/features/social/social-logic';

import type { WeatherState } from './use-weather';
import { WeatherIcon } from './weather-icon';

const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/**
 * „Wetter verbinden“ im Bereich Termine: Ort eintragen (landet in den Firmendaten)
 * bzw. die nächsten 7 Tage für den Ort zeigen.
 */
export function WeatherPanel({ weather, now }: { weather: WeatherState; now: Date }) {
  const { seller, saveSeller } = useDocuments();
  const [zip, setZip] = useState(seller.zip ?? '');
  const [city, setCity] = useState(seller.city ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = weather.status === 'ok' && !editing;

  const save = async () => {
    const c = city.trim();
    const z = zip.trim();
    if (c.length < 2) return setError('Bitte trag deinen Ort ein.');
    if (z && !/^\d{5}$/.test(z)) return setError('Die PLZ hat 5 Ziffern.');
    setBusy(true);
    setError(null);
    const r = await saveSeller({ zip: z || null, city: c });
    setBusy(false);
    if (r.error) setError(r.error);
    else setEditing(false);
  };

  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));

  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.icon}>
          <CloudSun size={20} color={Colors.text} strokeWidth={1.8} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{connected ? `Wetter in ${weather.place}` : 'Wetter verbinden'}</Text>
          <Text style={styles.text}>
            {connected ? 'Bei Terminen draußen warnt dich Lunaxora vor Regen, Sturm und Hitze.' : 'Dein Ort reicht – dann siehst du an jedem Tag das Wetter.'}
          </Text>
        </View>
      </View>

      {connected ? (
        <>
          <View style={styles.days}>
            {days.map((d) => {
              const w = weather.days.get(dayKey(d));
              return (
                <View key={d.toISOString()} style={styles.day} accessible accessibilityLabel={w ? `${WEEKDAY[d.getDay()]}: ${w.label}, bis ${w.max} °C` : undefined}>
                  <Text style={styles.dayName}>{WEEKDAY[d.getDay()]}</Text>
                  {w ? <WeatherIcon kind={w.kind} size={22} /> : <View style={styles.noIcon} />}
                  <Text style={styles.max}>{w?.max != null ? `${w.max}°` : '–'}</Text>
                  <Text style={styles.min}>{w?.min != null ? `${w.min}°` : ''}</Text>
                </View>
              );
            })}
          </View>
          <Button label="Ort ändern" variant="secondary" onPress={() => setEditing(true)} style={styles.button} />
        </>
      ) : (
        <>
          {weather.status === 'not_found' && !editing && (
            <Notice tone="error">
              {seller.city ? `„${seller.city}“ haben wir nicht gefunden.` : 'Ort nicht gefunden.'} Prüf die Schreibweise.
            </Notice>
          )}
          {weather.status === 'error' && !editing && <Notice tone="info">Das Wetter ist gerade nicht erreichbar.</Notice>}
          <View style={styles.form}>
            <View style={styles.zip}>
              <TextField label="PLZ" value={zip} onChangeText={setZip} keyboardType="number-pad" maxLength={5} />
            </View>
            <View style={styles.flex}>
              <TextField label="Ort" value={city} onChangeText={setCity} error={error ?? undefined} onSubmitEditing={() => void save()} />
            </View>
          </View>
          <Text style={styles.hint}>Wird auch unter Firma gespeichert.</Text>
          <Button label="Wetter verbinden" onPress={() => void save()} loading={busy} style={styles.button} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 2 },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: Spacing.md },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  dayName: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  noIcon: { width: 22, height: 22 },
  max: { color: Colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  min: { color: Colors.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  form: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  zip: { width: 110 },
  hint: { color: Colors.textFaint, fontSize: 12, marginTop: -4 },
  button: { alignSelf: 'flex-start', marginTop: Spacing.sm },
});
