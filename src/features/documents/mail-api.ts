import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { proRequiredText } from '@/features/plan/plan-logic';
import { supabase } from '@/lib/supabase';

import { splitRecipients } from './mail-logic';
import { bytesToBase64 } from './offer-link';

export type MailKind = 'offer' | 'invoice' | 'reminder' | 'review' | 'other';

export type MailInput = {
  to: string;
  subject: string;
  text: string;
  /** Firmenname als Absender */
  fromName: string;
  /** Antworten an (z. B. E-Mail aus den Firmendaten) */
  replyTo: string | null;
  attachment?: { bytes: Uint8Array; fileName: string } | null;
  documentId?: string | null;
  kind: MailKind;
};

export type MailResult = { id?: string | null; error?: string; notSetUp?: boolean };

const SETUP =
  'Direkt verschicken ist noch nicht eingerichtet: Die Server-Funktion „mail“ fehlt in Supabase (Anleitung: supabase/README.md, Abschnitt 10).';

/** E-Mail mit PDF über die Server-Funktion "mail" verschicken. */
export async function sendMail(input: MailInput): Promise<MailResult> {
  const body = {
    to: splitRecipients(input.to),
    subject: input.subject,
    text: input.text,
    from_name: input.fromName,
    reply_to: input.replyTo,
    kind: input.kind,
    document_id: input.documentId ?? null,
    attachments: input.attachment
      ? [{ filename: input.attachment.fileName, content: bytesToBase64(input.attachment.bytes) }]
      : [],
  };
  const { data, error } = await supabase.functions.invoke('mail', { body });
  if (!error) return { id: (data?.id as string | null) ?? null };

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const b = await res.json();
      code = b?.error;
      detail = typeof b?.detail === 'string' ? b.detail : undefined;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 404) return { error: SETUP, notSetUp: true };
    const withDetail = (text: string) => `${text}${detail ? `\n\nTechnische Details: ${detail}` : ''}`;
    if (code === 'missing_resend_key')
      return {
        error:
          'Direkt verschicken ist fast eingerichtet: In Supabase fehlen noch die Zugangsdaten – entweder dein Postfach (SMTP_HOST, SMTP_USER, SMTP_PASS) oder RESEND_API_KEY (supabase/README.md, Abschnitt 10).',
        notSetUp: true,
      };
    if (code === 'missing_mail_from')
      return {
        error:
          'Direkt verschicken ist fast eingerichtet: In Supabase fehlt noch MAIL_FROM – die E-Mail-Adresse, von der aus verschickt wird (supabase/README.md, Abschnitt 10).',
        notSetUp: true,
      };
    if (code === 'missing_smtp_login')
      return {
        error:
          'Direkt verschicken ist fast eingerichtet: In Supabase fehlen noch SMTP_USER oder SMTP_PASS – Benutzername und Passwort deines Postfachs.',
        notSetUp: true,
      };
    if (code === 'smtp_port')
      return {
        error:
          'Dieser Port geht nicht: Supabase erlaubt zum Mailserver nur verschlüsselte Verbindungen über Port 465. Bitte in Supabase SMTP_PORT = 465 eintragen.',
        notSetUp: true,
      };
    if (code === 'smtp_auth_failed')
      return {
        error: withDetail(
          'Dein Postfach hat die Anmeldung abgelehnt: Benutzername oder Passwort stimmen nicht. Bitte SMTP_USER und SMTP_PASS in Supabase prüfen.',
        ),
        notSetUp: true,
      };
    if (code === 'smtp_connect_failed')
      return {
        error: withDetail(
          'Der Mailserver ist nicht erreichbar. Bitte SMTP_HOST genau so eintragen, wie er in den E-Mail-Einstellungen deines Anbieters steht, und SMTP_PORT = 465.',
        ),
        notSetUp: true,
      };
    if (code === 'smtp_timeout')
      return { error: 'Der Mailserver antwortet gerade nicht. Versuch es gleich noch einmal.' };
    if (code === 'smtp_rejected')
      return {
        error: withDetail(
          'Der Mailserver hat die E-Mail abgelehnt – oft ist die Empfänger-Adresse falsch oder MAIL_FROM gehört nicht zu deinem Postfach.',
        ),
      };
    if (code === 'invalid_resend_key')
      return {
        error: 'Der API-Schlüssel von Resend ist ungültig. Bitte prüfe RESEND_API_KEY in Supabase.',
        notSetUp: true,
      };
    if (code === 'domain_not_verified')
      return {
        error: `Deine Absender-Domain ist bei Resend noch nicht bestätigt. Bitte dort die DNS-Einträge setzen und prüfen lassen (supabase/README.md, Abschnitt 10).${detail ? `\n\nTechnische Details: ${detail}` : ''}`,
        notSetUp: true,
      };
    if (code === 'missing_log_table')
      return {
        error:
          'Direkt verschicken braucht noch das Datenbank-Skript 20261113090000_offer_links_mail.sql (siehe supabase/README.md).',
        notSetUp: true,
      };
    if (code === 'pro_required') return { error: proRequiredText('direct_mail') };
    if (code === 'too_many_this_hour')
      return { error: 'Du hast in der letzten Stunde schon 20 E-Mails verschickt. Bitte später noch einmal.' };
    if (code === 'too_many_today') return { error: 'Für heute ist die Grenze von 100 E-Mails erreicht.' };
    if (code === 'rate_limited')
      return { error: 'Der E-Mail-Dienst bremst gerade. Versuch es in einer Minute noch einmal.' };
    if (code === 'invalid_to' || code === 'missing_to')
      return { error: 'Bitte prüfe die E-Mail-Adresse des Empfängers.' };
    if (code === 'too_many_recipients') return { error: 'Höchstens 3 Empfänger auf einmal.' };
    if (code === 'attachment_too_large') return { error: 'Das PDF ist zu groß für eine E-Mail.' };
    if (res.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    return {
      error: `Die E-Mail konnte nicht verschickt werden.\n\nTechnische Details: ${res.status} ${code ?? ''}${detail ? ` – ${detail}` : ''}`,
    };
  }
  if (error instanceof FunctionsFetchError) {
    return { error: 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.' };
  }
  return {
    error: `Die E-Mail konnte nicht verschickt werden.\n\nTechnische Details: ${String(error.message ?? error)}`,
  };
}

export type MailLogEntry = {
  id: string;
  document_id: string | null;
  kind: MailKind;
  to_email: string;
  subject: string;
  created_at: string;
};

/** Versandprotokoll zu einem Dokument (neueste zuerst) */
export async function mailLogFor(documentId: string): Promise<MailLogEntry[]> {
  const { data, error } = await supabase
    .from('email_log')
    .select('id, document_id, kind, to_email, subject, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) return [];
  return (data ?? []) as MailLogEntry[];
}
