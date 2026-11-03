import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { ActionChip } from '@/components/ui/action-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { OptionCard } from '@/components/ui/option-card';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { toDate, toIso, toMs } from '@/lib/dates';

import { buildEvents, type Appointment } from './appointment-logic';
import { useAppointments, type AppointmentInput } from './appointments-provider';
import { addToCalendar, calendarFileSupported, openGoogleCalendar } from './calendar-export';

/** Zurück zu den Terminen (sonst neu öffnen) */
const back = () => (router.canGoBack() ? router.back() : router.navigate('/termine'));

const DURATIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 Min.' },
  { minutes: 60, label: '1 Std.' },
  { minutes: 90, label: '1,5 Std.' },
  { minutes: 120, label: '2 Std.' },
  { minutes: 240, label: '4 Std.' },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Vorschlag für den Beginn: Tag aus der Woche (9 Uhr) oder die nächste volle Stunde */
function initialStart(datum?: string): string {
  if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) return new Date(`${datum}T09:00:00`).toISOString();
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

/** Neuer Termin (Route /termine/neu, optional ?datum=JJJJ-MM-TT) */
export function AppointmentNewScreen() {
  const { datum } = useLocalSearchParams<{ datum?: string }>();
  return <AppointmentEditor key={datum ?? 'neu'} datum={datum} />;
}

/** Termin bearbeiten (Route /termine/[id]) */
export function AppointmentEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { appointments, loading } = useAppointments();
  const appointment = appointments.find((a) => a.id === id);
  if (!appointment) {
    return (
      <Screen maxWidth={680}>
        <PageHeader title="Termin" back={{ label: 'Termine', onPress: back }} />
        {!loading && <Notice>Diesen Termin gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <AppointmentEditor key={appointment.id} appointment={appointment} />;
}

function AppointmentEditor({ appointment, datum }: { appointment?: Appointment; datum?: string }) {
  const { createAppointment, updateAppointment, deleteAppointment, error: setupError } = useAppointments();
  const { customers, customerById } = useCrm();
  const [title, setTitle] = useState(appointment?.title ?? '');
  const [allDay, setAllDay] = useState(appointment?.all_day ?? false);
  const [start, setStart] = useState<string | null>(appointment ? toIso(appointment.starts_at) : initialStart(datum));
  // Dauer des gespeicherten Termins (ungültige Werte: 1 Std.)
  const existingMinutes = appointment?.ends_at
    ? Math.round((toMs(appointment.ends_at) - toMs(appointment.starts_at)) / 60000) || 60
    : 60;
  const [minutes, setMinutes] = useState(existingMinutes);
  const [location, setLocation] = useState(appointment?.location ?? '');
  const [customerId, setCustomerId] = useState<string | null>(appointment?.customer_id ?? null);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState(appointment?.notes ?? '');
  const [done, setDone] = useState(appointment?.done ?? false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const customer = customerId ? customerById(customerId) : undefined;
  const q = query.trim().toLowerCase();
  const matches = q
    ? customers.filter((c) => [c.name, c.company].some((v) => v?.toLowerCase().includes(q))).slice(0, 5)
    : [];
  const startDate = toDate(start);
  const end = startDate && !allDay ? new Date(startDate.getTime() + minutes * 60000) : null;
  const custom = !DURATIONS.some((d) => d.minutes === minutes);

  /** gespeicherter Stand als Kalender-Termin (für "In Kalender") */
  const event = useMemo(
    () => (appointment ? buildEvents([], customers, [appointment])[0] : null),
    [appointment, customers],
  );

  const input = (): AppointmentInput | null => {
    if (!title.trim()) {
      setTitleError('Worum geht es?');
      return null;
    }
    const begin = toDate(start);
    if (!begin) {
      setFailure('Bitte wähle Datum und Uhrzeit.');
      return null;
    }
    // ganztägig: Beginn auf 0 Uhr (lokal)
    if (allDay) begin.setHours(0, 0, 0, 0);
    return {
      title: title.trim(),
      starts_at: begin.toISOString(),
      ends_at: allDay ? null : new Date(begin.getTime() + minutes * 60000).toISOString(),
      all_day: allDay,
      location: location.trim() || null,
      customer_id: customerId,
      notes: notes.trim() || null,
      done,
    };
  };

  const save = async () => {
    setFailure(null);
    setInfo(null);
    const data = input();
    if (!data) return;
    setSaving(true);
    const { error } = appointment ? await updateAppointment(appointment.id, data) : await createAppointment(data);
    setSaving(false);
    if (error) return setFailure(error);
    back();
  };

  return (
    <Screen maxWidth={680}>
      <PageHeader
        title={appointment ? 'Termin bearbeiten' : 'Neuer Termin'}
        subtitle={
          appointment
            ? undefined
            : 'Für alles, was nicht direkt an einem Auftrag hängt – Steuerberatung, Netzwerktreffen, Messe …'
        }
        back={{ label: 'Termine', onPress: back }}
      />
      {setupError === 'setup' && (
        <Notice tone="error">Das Datenbank-Skript für Termine fehlt noch (siehe supabase/README.md).</Notice>
      )}
      <Reveal delay={140}>
        <Card>
          <TextField
            label="Was? *"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setTitleError(undefined);
            }}
            error={titleError}
            placeholder="z. B. Steuerberatung, Netzwerktreffen, Fotoshooting"
            maxLength={200}
          />
          <ToggleRow label="Ganztägig" value={allDay} onChange={setAllDay} />
          <DateField label={allDay ? 'Tag' : 'Beginn'} value={start} onChange={setStart} withTime={!allDay} />
          {!allDay && (
            <View style={styles.durationWrap}>
              <Text style={styles.label}>Dauer</Text>
              <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Dauer">
                {DURATIONS.map((d) => {
                  const active = d.minutes === minutes;
                  return (
                    <Pressable
                      key={d.minutes}
                      onPress={() => setMinutes(d.minutes)}
                      accessibilityRole="radio"
                      aria-checked={active}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
                    </Pressable>
                  );
                })}
                {custom && (
                  <View style={[styles.chip, styles.chipActive]}>
                    <Text style={[styles.chipText, styles.chipTextActive]}>{minutes} Min.</Text>
                  </View>
                )}
              </View>
              {end && (
                <Text style={styles.hint}>
                  bis {pad(end.getHours())}:{pad(end.getMinutes())} Uhr
                </Text>
              )}
            </View>
          )}
        </Card>
      </Reveal>

      <Reveal delay={200}>
        <Card>
          <Text style={styles.cardTitle}>Wo und mit wem?</Text>
          <TextField
            label="Ort"
            value={location}
            onChangeText={setLocation}
            placeholder={customer?.address ? `leer = ${customer.address}` : 'Adresse, Ort oder „online“'}
            maxLength={500}
          />
          {customer ? (
            <View style={styles.selected}>
              <Text style={styles.selectedName}>Kunde: {customer.name}</Text>
              <TextLink label="Entfernen" onPress={() => setCustomerId(null)} />
            </View>
          ) : (
            <View style={styles.picker}>
              <TextField
                label="Kunde (optional)"
                value={query}
                onChangeText={setQuery}
                placeholder="Name oder Firma suchen"
                autoCorrect={false}
              />
              {matches.map((c) => (
                <OptionCard
                  key={c.id}
                  compact
                  title={c.name}
                  description={c.address ?? c.company ?? undefined}
                  selected={false}
                  onPress={() => {
                    setCustomerId(c.id);
                    setQuery('');
                  }}
                />
              ))}
            </View>
          )}
          <TextField
            label="Notiz"
            value={notes}
            onChangeText={setNotes}
            placeholder="optional, z. B. Unterlagen mitbringen"
            multiline
            style={styles.multiline}
            maxLength={5000}
          />
          {appointment && <ToggleRow label="Erledigt" value={done} onChange={setDone} />}
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}
      <Button label={appointment ? 'Änderungen speichern' : 'Termin speichern'} onPress={save} loading={saving} />
      {event && (
        <View style={styles.export}>
          {calendarFileSupported && (
            <ActionChip
              label="In Kalender übernehmen"
              onPress={async () => {
                const r = await addToCalendar(event);
                if (r.error) setFailure(r.error);
                else
                  setInfo(r.opened ? 'Im Kalender geöffnet.' : 'Kalender-Datei gespeichert – öffnen zum Übernehmen.');
              }}
            />
          )}
          <ActionChip label="Google Kalender" onPress={() => openGoogleCalendar(event)} />
        </View>
      )}
      {appointment && (
        <ConfirmDelete
          label="Termin löschen"
          question={`„${appointment.title}“ wirklich löschen?`}
          onConfirm={async () => {
            const { error } = await deleteAppointment(appointment.id);
            if (error) setFailure(error);
            else back();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  hint: { color: Colors.textFaint, fontSize: 13 },
  durationWrap: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '500' },
  chipTextActive: { color: Colors.text, fontWeight: '600' },
  selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  selectedName: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  picker: { gap: Spacing.sm },
  multiline: { minHeight: 80, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  export: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
});
