import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useCrm } from '@/features/crm/crm-provider';
import { useDocuments } from '@/features/documents/documents-provider';
import { useWorkspaceId } from '@/features/team/team-provider';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

import { offerReplyNotes, replyTime, type OfferReply } from './notify-logic';
import { notifyNow } from './notify-platform';
import { loadNotifyPrefs, useNotifyPrefs } from './notify-prefs';
import { onPushOpen, pushActive, registerPush, unregisterPush } from './push';

/** So oft wird nachgesehen, solange Lunaxora offen ist */
const CHECK_EVERY = 60_000;

/**
 * Antworten auf Angebote: Nimmt ein Kunde ein Angebot über den Link an oder lehnt es ab, kommt eine
 * Mitteilung – solange Lunaxora läuft (Mac auch im Hintergrund), sonst beim nächsten Öffnen.
 * Nachgesehen wird jede Minute und beim Zurückkehren in die App; jede Antwort wird pro Gerät
 * nur einmal gemeldet. Ein- und ausschalten: Profil → Benachrichtigungen → Angebote.
 */
export function OfferReplyWatcher() {
  const ws = useWorkspaceId();
  const { reload } = useDocuments();
  const { customerById } = useCrm();
  const latest = useRef({ reload, customerById });
  useEffect(() => {
    latest.current = { reload, customerById };
  });

  useEffect(() => {
    if (!ws) return;
    const key = `nexora.offer-replies.${ws}`;
    let alive = true;
    let busy = false;

    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const stored = Number(await AsyncStorage.getItem(key));
        if (!stored) {
          // erstes Mal auf diesem Gerät: ältere Antworten nicht nachträglich melden
          await AsyncStorage.setItem(key, String(Date.now()));
          return;
        }
        const since = new Date(stored).toISOString();
        const { data, error } = await supabase
          .from('documents')
          .select('id, number, total, customer_id, accepted_at, accepted_name, declined_at, decline_note, withdrawn_at')
          .eq('kind', 'offer')
          .or(`accepted_at.gt."${since}",declined_at.gt."${since}",withdrawn_at.gt."${since}"`);
        if (error || !alive || !data?.length) return;
        const offers: OfferReply[] = data.map((d) => ({
          ...d,
          total: Number(d.total) || 0,
          customerName: d.customer_id ? (latest.current.customerById(d.customer_id)?.name ?? null) : null,
        }));
        const notes = offerReplyNotes(offers, stored);
        if (!notes.length) return;
        await AsyncStorage.setItem(key, String(Math.max(...offers.map(replyTime)) + 1));
        // in der App gleich als angenommen/abgelehnt zeigen
        void latest.current.reload();
        const prefs = await loadNotifyPrefs();
        // iPhone mit Push: die Mitteilung kam schon vom Server
        if (!prefs.offers || !alive || (await pushActive())) return;
        for (const n of notes) await notifyNow(n.title, n.body);
      } catch (e) {
        console.warn('[Angebote]', e);
      } finally {
        busy = false;
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void check();
    });
    return () => {
      alive = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [ws]);

  return null;
}

/**
 * iPhone: für Push-Mitteilungen anmelden (Angebote auch bei geschlossener App) – nur solange
 * „Angebote“ unter Profil → Benachrichtigungen an ist. Tippen auf die Mitteilung öffnet den Auftrag.
 */
export function PushRegistrar() {
  const { user } = useAuth();
  const { prefs } = useNotifyPrefs();
  const userId = user?.id;
  const wanted = prefs.offers;

  useEffect(() => {
    if (!userId) return;
    if (!wanted) {
      void unregisterPush();
      return;
    }
    void registerPush();
    // z. B. nach dem Erlauben der Mitteilungen
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void registerPush();
    });
    return () => sub.remove();
  }, [userId, wanted]);

  useEffect(
    () =>
      onPushOpen((data) => {
        if (data.kind !== 'offers') return;
        if (typeof data.order_id === 'string' && data.order_id) router.push(`/auftraege/${data.order_id}`);
        else router.push('/auftraege');
      }),
    [],
  );

  return null;
}
