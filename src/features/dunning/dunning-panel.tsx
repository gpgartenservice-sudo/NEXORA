import { router } from 'expo-router';
import { Download, Gavel, Mail, MessageCircle, Send, Share, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { ActionChip } from '@/components/ui/action-chip';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Customer } from '@/features/crm/crm-provider';
import { DirectMail } from '@/features/documents/direct-mail';
import { formatDay, mailtoUrl, todayIso, whatsappUrl } from '@/features/documents/document-logic';
import { useDocuments, type StoredDocument } from '@/features/documents/documents-provider';
import { downloadPdf, pdfSupported, type PreparedPdf } from '@/features/documents/save-pdf';
import { canShareFile, openWith, shareFile, type Delivery } from '@/features/documents/send-document';

import {
  dunningHistory,
  dunningState,
  MAHNPORTAL,
  reminderFileName,
  reminderText,
  reviewText,
  stageLabel,
  STAGES,
  suggestedDueDate,
  validReviewUrl,
  type DunningKind,
  type Followup,
} from './dunning-logic';
import { useFollowups } from './followups-provider';

type Message = { tone: 'info' | 'success' | 'error'; text: string };

const ABOUT: Record<DunningKind, string> = {
  reminder: 'Freundlich und ohne Gebühr – oft reicht das schon.',
  dunning1: 'Etwas bestimmter, mit neuer Frist.',
  dunning2: 'Letzte Frist – mit Hinweis auf das gerichtliche Mahnverfahren.',
};

/** "2,50" -> 2.5; leer -> 0; ungültig -> null */
function parseFee(text: string): number | null {
  const t = text.trim().replace(/\s*€$/, '').replace(/\./g, '').replace(',', '.');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) / 100 : null;
}

/**
 * Zahlung anmahnen: nächste Stufe (Erinnerung -> 1. Mahnung -> letzte Mahnung) mit
 * neuer Frist, optionaler Gebühr, fertigem Text und PDF. Beim Verschicken wird die
 * Stufe vermerkt – so weiß NEXORA, wann die nächste dran ist.
 */
export function DunningPanel({ doc, customer }: { doc: StoredDocument; customer: Customer }) {
  const { followups, record, remove, error: setupError } = useFollowups();
  const { seller, logo } = useDocuments();
  const [today] = useState(() => todayIso());
  /** in diesem Fenster schon vermerkte Stufe (weitere Wege verschicken nicht erneut vermerken) */
  const [recorded, setRecorded] = useState<Followup | null>(null);
  const [direct, setDirect] = useState(false);
  const history = dunningHistory(followups, doc.id);
  const before = recorded ? history.filter((h) => h.id !== recorded.id) : history;
  const done = new Set(before.map((h) => h.kind));
  const nextStage = recorded ? STAGES.find((s) => s.kind === recorded.kind)! : STAGES.find((s) => !done.has(s.kind));
  const [newDue, setNewDue] = useState<string | null>(nextStage ? suggestedDueDate(nextStage.kind, today) : today);
  const [feeText, setFeeText] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const state = dunningState(doc, followups, today);
  const fee = nextStage?.kind === 'reminder' ? 0 : parseFee(feeText);

  if (!pdfSupported) return <Notice>Mahnen gibt es im Moment nur auf dem Mac. Am Handy folgt es bald.</Notice>;

  const input =
    nextStage && newDue && fee !== null
      ? { kind: nextStage.kind, doc, history: before, fee, newDueOn: newDue, customerName: customer.name, seller }
      : null;
  const text = input ? reminderText(input) : null;

  /** PDF erzeugen, verschicken, beim ersten Mal vermerken */
  const run = async (how: 'pdf' | 'mail' | 'whatsapp' | 'share') => {
    if (!input || !text || !nextStage) {
      setMessage({
        tone: 'error',
        text: fee === null ? 'Bitte eine gültige Gebühr eingeben (z. B. 2,50).' : 'Bitte eine neue Frist wählen.',
      });
      return;
    }
    if (newDue! < today) return setMessage({ tone: 'error', text: 'Die neue Frist liegt in der Vergangenheit.' });
    setBusy(true);
    setMessage(null);
    let pdf: PreparedPdf;
    try {
      const { renderReminderPdf } = await import('./dunning-pdf');
      pdf = { bytes: await renderReminderPdf({ ...input, logo }), fileName: reminderFileName(nextStage.kind, doc) };
    } catch (e) {
      setBusy(false);
      return setMessage({
        tone: 'error',
        text: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}`,
      });
    }
    let delivery: Delivery = {};
    if (how === 'pdf') downloadPdf(pdf);
    else if (how === 'mail') delivery = await openWith(pdf, mailtoUrl(customer.email, text.subject, text.body));
    else if (how === 'whatsapp') delivery = await openWith(pdf, whatsappUrl(customer.phone, text.chat));
    else delivery = await shareFile(pdf, text.body, text.subject);
    if (delivery.error) {
      setBusy(false);
      return setMessage({ tone: 'error', text: delivery.error });
    }
    let note = '';
    if (!recorded) {
      const r = await record({ document_id: doc.id, kind: nextStage.kind, fee: input.fee, new_due_on: newDue });
      if (r.error) {
        setBusy(false);
        return setMessage({ tone: 'error', text: r.error });
      }
      setRecorded(r.data!);
      note = ` Vermerkt: ${nextStage.label} vom ${formatDay(today)}, neue Frist bis ${formatDay(newDue)}.`;
    }
    setBusy(false);
    const where =
      delivery.pdf === 'finder'
        ? ' Das PDF ist im Finder markiert (Downloads › NEXORA) – zieh es in die Nachricht.'
        : how === 'pdf' || delivery.pdf === 'download'
          ? ' Das PDF wurde gespeichert.'
          : '';
    setMessage({ tone: 'success', text: `${how === 'pdf' ? 'PDF erstellt.' : 'Geöffnet.'}${where}${note}` });
  };

  const undo = async (f: Followup) => {
    const r = await remove(f.id);
    if (r.error) return setMessage({ tone: 'error', text: r.error });
    if (recorded?.id === f.id) setRecorded(null);
    setMessage({ tone: 'info', text: `${stageLabel(f.kind)} vom ${formatDay(f.sent_on)} zurückgenommen.` });
  };

  return (
    <View style={styles.panel} testID="dunning-panel">
      <Text style={styles.title}>Zahlung anmahnen</Text>
      {setupError === 'setup' && (
        <Notice tone="error">
          Das Datenbank-Skript fürs Mahnwesen fehlt noch (20261110090000_invoice_followups.sql). PDF und Texte gehen
          trotzdem – NEXORA kann sich die Stufen aber noch nicht merken.
        </Notice>
      )}

      {history.length > 0 && (
        <View style={styles.history}>
          {history.map((h, i) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={styles.historyText}>
                {stageLabel(h.kind)} vom {formatDay(h.sent_on)}
                {h.new_due_on ? ` · Frist bis ${formatDay(h.new_due_on)}` : ''}
                {Number(h.fee) > 0
                  ? ` · Gebühr ${Number(h.fee).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
                  : ''}
              </Text>
              {i === history.length - 1 && <TextLink label="Rückgängig" onPress={() => void undo(h)} />}
            </View>
          ))}
        </View>
      )}

      {state.step === 'waiting' && !recorded && (
        <Notice>
          Die Frist läuft noch bis {formatDay(state.until)}. Danach ist die{' '}
          {STAGES.find((s) => !done.has(s.kind))?.label ?? 'nächste Stufe'} dran – vorbereiten kannst du sie schon
          jetzt.
        </Notice>
      )}

      {!nextStage ? (
        <View style={styles.escalate}>
          <View style={styles.escalateHead}>
            <Gavel size={18} color={Colors.text} strokeWidth={1.8} />
            <Text style={styles.stageTitle}>Alle Mahnstufen sind durch</Text>
          </View>
          <Text style={styles.text}>
            Ist auch nach der letzten Mahnung nichts gekommen, bleibt das gerichtliche Mahnverfahren: Den Antrag stellst
            du online beim Mahngericht – ohne Anwalt. Die Kosten muss am Ende in der Regel der säumige Kunde tragen.
            Alternativ kann ein Inkasso-Büro übernehmen.
          </Text>
          <View style={styles.actions}>
            <ActionChip
              icon={Gavel}
              label="Online-Mahnantrag öffnen"
              onPress={() => void Linking.openURL(MAHNPORTAL)}
            />
          </View>
        </View>
      ) : (
        <View style={styles.stage}>
          <Text style={styles.stageTitle} testID="dunning-stage">
            {recorded ? `${nextStage.label} – verschickt` : `Als Nächstes: ${nextStage.label}`}
          </Text>
          <Text style={styles.text}>{ABOUT[nextStage.kind]}</Text>
          {!recorded && (
            <View style={styles.row}>
              <View style={styles.flex}>
                <DateField label="Neue Zahlungsfrist" value={newDue} onChange={setNewDue} />
              </View>
              {nextStage.kind !== 'reminder' && (
                <View style={styles.flex}>
                  <TextField
                    label="Mahngebühr in € (optional)"
                    value={feeText}
                    onChangeText={setFeeText}
                    placeholder="z. B. 2,50"
                    keyboardType="decimal-pad"
                    error={fee === null ? 'Bitte eine Zahl wie 2,50 eingeben.' : undefined}
                  />
                </View>
              )}
            </View>
          )}
          {nextStage.kind !== 'reminder' && !recorded && (
            <Text style={styles.hint}>
              Mahngebühren dürfen nur echte Kosten decken (z. B. Porto, meist 1–3 €). Viele verzichten darauf.
            </Text>
          )}
          {text && (
            <Pressable onPress={() => setPreview((v) => !v)} accessibilityRole="button" style={styles.previewToggle}>
              <Text style={styles.link}>{preview ? 'Text ausblenden' : 'Text ansehen'}</Text>
            </Pressable>
          )}
          {preview && text && (
            <View style={styles.preview} testID="dunning-preview">
              <Text style={styles.previewSubject}>{text.subject}</Text>
              <Text style={styles.previewBody}>{text.body}</Text>
            </View>
          )}
          <View style={styles.actions}>
            <ActionChip
              icon={Download}
              label="PDF"
              accessibilityLabel={`${nextStage.label} als PDF`}
              onPress={() => void run('pdf')}
              disabled={busy}
            />
            <ActionChip
              icon={Mail}
              label="E-Mail"
              accessibilityLabel={`${nextStage.label} per E-Mail`}
              onPress={() => void run('mail')}
              disabled={busy}
            />
            <ActionChip
              icon={MessageCircle}
              label="WhatsApp"
              accessibilityLabel={`${nextStage.label} per WhatsApp`}
              onPress={() => void run('whatsapp')}
              disabled={busy}
            />
            {canShareFile({ bytes: new Uint8Array([37]), fileName: 'x.pdf' }) && (
              <ActionChip icon={Share} label="Teilen …" onPress={() => void run('share')} disabled={busy} />
            )}
            <ActionChip
              icon={Send}
              label="Direkt senden"
              accessibilityLabel={`${nextStage.label} direkt senden`}
              onPress={() => setDirect((v) => !v)}
              active={direct}
              disabled={busy || !input}
            />
          </View>
          {direct && input && text && (
            <DirectMail
              key={`${nextStage.kind}-${input.fee}-${input.newDueOn}`}
              defaultTo={customer.email}
              subject={text.subject}
              body={text.body}
              attachment={async () => {
                const { renderReminderPdf } = await import('./dunning-pdf');
                return { bytes: await renderReminderPdf({ ...input, logo }), fileName: reminderFileName(nextStage.kind, doc) };
              }}
              attachmentName={reminderFileName(nextStage.kind, doc)}
              kind="reminder"
              documentId={doc.id}
              onSent={async () => {
                if (recorded) return;
                const r = await record({ document_id: doc.id, kind: nextStage.kind, fee: input.fee, new_due_on: newDue });
                if (r.error) return setMessage({ tone: 'error', text: r.error });
                setRecorded(r.data!);
                setMessage({
                  tone: 'success',
                  text: `Vermerkt: ${nextStage.label} vom ${formatDay(today)}, neue Frist bis ${formatDay(newDue)}.`,
                });
              }}
            />
          )}
          <Text style={styles.hint}>
            {recorded
              ? 'Schon vermerkt – du kannst sie hier noch über einen anderen Weg schicken.'
              : 'Sobald du das Schreiben erstellst oder verschickst, merkt sich NEXORA die Stufe und die neue Frist.'}
          </Text>
        </View>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </View>
  );
}

/** Nach der Zahlung: Kunden um eine Bewertung bitten (E-Mail oder WhatsApp mit Link) */
export function ReviewPanel({ doc, customer }: { doc: StoredDocument; customer: Customer }) {
  const { followups, record } = useFollowups();
  const { seller } = useDocuments();
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const earlier = followups.filter((f) => f.document_id === doc.id && f.kind === 'review');
  const url = seller.review_url ?? null;

  if (!validReviewUrl(url)) {
    return (
      <View style={styles.panel} testID="review-panel">
        <Text style={styles.title}>Um eine Bewertung bitten</Text>
        <Text style={styles.text}>
          Trag zuerst deinen Link für Bewertungen ein (z. B. vom Google-Unternehmensprofil) – dann schickst du ihn hier
          mit einem Klick an {customer.name}.
        </Text>
        <TextLink label="Link unter „Firma“ eintragen →" emphasis onPress={() => router.push('/firma')} />
      </View>
    );
  }
  const text = reviewText({ doc, reviewUrl: url!, customerName: customer.name, seller });
  const go = async (target: string) => {
    await Linking.openURL(target);
    if (sent) return;
    const r = await record({ document_id: doc.id, kind: 'review' });
    if (r.error) return setMessage({ tone: 'error', text: r.error });
    setSent(true);
    setMessage({ tone: 'success', text: `Geöffnet – vermerkt: Bewertung angefragt am ${formatDay(todayIso())}.` });
  };
  return (
    <View style={styles.panel} testID="review-panel">
      <Text style={styles.title}>Um eine Bewertung bitten</Text>
      {earlier.length > 0 && (
        <Text style={styles.text}>Schon angefragt am {earlier.map((f) => formatDay(f.sent_on)).join(', ')}.</Text>
      )}
      <View style={styles.actions}>
        <ActionChip
          icon={Mail}
          label="E-Mail"
          accessibilityLabel="Bewertungsbitte per E-Mail"
          onPress={() => void go(mailtoUrl(customer.email, text.subject, text.body))}
        />
        <ActionChip
          icon={MessageCircle}
          label="WhatsApp"
          accessibilityLabel="Bewertungsbitte per WhatsApp"
          onPress={() => void go(whatsappUrl(customer.phone, text.chat))}
        />
        <ActionChip icon={Star} label="Link testen" onPress={() => void Linking.openURL(url!)} />
      </View>
      <Text style={styles.hint}>Der Text ist fertig und enthält deinen Bewertungs-Link – du schickst selbst ab.</Text>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  title: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  text: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  hint: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  link: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  history: { gap: 6 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  historyText: { color: Colors.text, fontSize: 13, flexShrink: 1 },
  stage: { gap: Spacing.sm },
  stageTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  flex: { flex: 1, minWidth: 180 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  previewToggle: { alignSelf: 'flex-start' },
  preview: {
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
  },
  previewSubject: { color: Colors.text, fontSize: 13.5, fontWeight: '700' },
  previewBody: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  escalate: { gap: Spacing.sm },
  escalateHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
