import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useCrm } from '@/features/crm/crm-provider';

import { transcribe } from './assistant-api';
import { runnableNow } from './assistant-logic';
import { useRunProposals } from './nexy-guide';
import { useNexy } from './nexy-provider';
import {
  blobToBase64,
  openMic,
  speak,
  speechSupported,
  voiceSupported,
  type Mic,
  type Recording,
  type Speech,
} from './voice';
import { cleanTranscript, executedText, pendingConfirmation, spokenReply, voiceIntent } from './voice-logic';

export type VoicePhase = 'off' | 'starting' | 'listening' | 'transcribing' | 'thinking' | 'working' | 'speaking';

export type VoiceError = { text: string; setup?: boolean };

type Session = { alive: boolean; mic: Mic | null; recording: Recording | null; speech: Speech | null };

const BYES = ['Alles klar, bis gleich!', 'Okay, ich bin da, wenn du mich brauchst.', 'Bis später!'];
// so oft hintereinander niemand gesprochen -> Sprachmodus geht aus
const MAX_QUIET_ROUNDS = 2;

/**
 * Sprachmodus: zuhören -> verstehen -> Nexy fragen -> vorlesen -> wieder zuhören.
 * Vorschläge führt Nexy sofort aus und macht es dabei in der App vor (danach
 * hört sie weiter zu); fehlte noch etwas, bestätigt bzw. verwirft "Ja"/"Nein"
 * sie später. "Stopp" beendet.
 */
export function useVoiceMode() {
  const nexy = useNexy();
  const crm = useCrm();
  const runProposals = useRunProposals();
  const [phase, setPhase] = useState<VoicePhase>('off');
  const [heard, setHeard] = useState<string | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);
  const [reading, setReading] = useState(false);
  const level = useSharedValue(0);
  const session = useRef<Session | null>(null);
  const readSpeech = useRef<Speech | null>(null);

  // immer aktuelle Werte für den laufenden Ablauf
  const live = useRef({ nexy, crm, runProposals });
  useEffect(() => {
    live.current = { nexy, crm, runProposals };
  }, [nexy, crm, runProposals]);

  const end = useCallback(
    (s: Session) => {
      s.alive = false;
      s.recording?.cancel();
      s.speech?.cancel();
      s.mic?.close();
      if (session.current === s) {
        session.current = null;
        setPhase('off');
        level.set(withTiming(0, { duration: 150 }));
      }
    },
    [level],
  );

  const stop = useCallback(() => {
    if (session.current) end(session.current);
  }, [end]);

  // Nexys Stimme ging nicht (z. B. ElevenLabs nicht eingerichtet) – Grund im Nexy-Bereich zeigen
  const speechFailed = useCallback((text: string, setup: boolean) => {
    setError({ text: `Nexy kann gerade nicht sprechen: ${text}`, setup });
  }, []);

  const say = useCallback(async (s: Session, text: string) => {
    if (!s.alive || !text) return;
    setPhase('speaking');
    const speech = speak(text, { onError: speechFailed });
    s.speech = speech;
    await speech.done;
    s.speech = null;
  }, [speechFailed]);

  const loop = useCallback(
    async (s: Session) => {
      let quiet = 0;
      while (s.alive && s.mic) {
        setPhase('listening');
        await s.mic.chime('listen');
        if (!s.alive) break;
        const recording = s.mic.record({ onLevel: (l) => level.set(withTiming(l, { duration: 70 })) });
        s.recording = recording;
        const result = await recording.result;
        s.recording = null;
        if (!s.alive) break;

        if (!result.blob) {
          if (result.reason === 'cancelled') break;
          quiet++;
          if (quiet >= MAX_QUIET_ROUNDS) {
            await say(s, 'Ich mach mal Pause. Tipp aufs Mikro, wenn du mich wieder brauchst.');
            break;
          }
          continue;
        }
        quiet = 0;
        void s.mic.chime('heard');

        setPhase('transcribing');
        const audio = await blobToBase64(result.blob);
        const hints = live.current.crm.customers.flatMap((c) => [c.name, c.company ?? '']).filter(Boolean);
        const t = await transcribe(audio, result.mime, hints);
        if (!s.alive) break;
        if (t.error) {
          setError({ text: t.error, setup: t.notSetUp });
          await say(s, t.notSetUp ? 'Der Sprachmodus ist noch nicht ganz eingerichtet.' : t.error.split(/\n\s*\n/)[0]);
          break;
        }
        const said = cleanTranscript(t.text ?? '');
        if (!said) continue; // nichts Verständliches – weiter zuhören
        setHeard(said);

        const pending = pendingConfirmation(live.current.nexy.messages);
        const intent = voiceIntent(said, !!pending);
        if (intent === 'stop') {
          await say(s, BYES[Math.floor(Math.random() * BYES.length)]);
          break;
        }
        if (intent === 'confirm' && pending) {
          setPhase('working');
          const outcome = await live.current.runProposals(pending.id);
          // nach der Vorführung hat Nexy schon „Erledigt!“ gesagt
          if (!outcome.ok || !outcome.shown) await say(s, executedText(outcome));
          continue;
        }
        if (intent === 'cancel' && pending) {
          live.current.nexy.dismiss(pending.id);
          await say(s, 'Okay, hab ich verworfen.');
          continue;
        }

        setPhase('thinking');
        const reply = await live.current.nexy.send(said, { voice: true });
        if (!s.alive) break;
        if (!reply) continue;
        // Nexy legt sofort los, wenn nichts fehlt – sonst fragt sie wie bisher nach
        const nexy = live.current.nexy;
        const ready =
          !reply.error &&
          reply.status === 'open' &&
          !!reply.proposals?.length &&
          runnableNow(reply.proposals, reply.doneIds ?? [], nexy.blockers);
        await say(s, spokenReply(reply, !ready));
        // Fehler (z. B. nicht eingerichtet): nicht endlos weiterfragen
        if (reply.error) break;
        if (ready && s.alive) {
          setPhase('working');
          const outcome = await live.current.runProposals(reply.id);
          if (!outcome.ok || !outcome.shown) await say(s, executedText(outcome));
        }
      }
      end(s);
    },
    [end, level, say],
  );

  const start = useCallback(async () => {
    if (session.current) return;
    readSpeech.current?.cancel();
    const s: Session = { alive: true, mic: null, recording: null, speech: null };
    session.current = s;
    setError(null);
    setHeard(null);
    setPhase('starting');
    const opened = await openMic();
    if (!s.alive) {
      opened.mic?.close();
      return;
    }
    if (!opened.mic) {
      end(s);
      setError({ text: opened.error ?? 'Das Mikrofon ließ sich nicht starten.' });
      return;
    }
    s.mic = opened.mic;
    void loop(s);
  }, [end, loop]);

  /** Beim Zuhören: jetzt abschicken. Beim Sprechen: unterbrechen. */
  const next = useCallback(() => {
    const s = session.current;
    if (!s) return;
    if (s.recording) s.recording.finish();
    else if (s.speech) s.speech.cancel();
  }, []);

  /** Text vorlesen (außerhalb des Sprachmodus) */
  const read = useCallback((text: string) => {
    if (session.current) return;
    readSpeech.current?.cancel();
    const speech = speak(text, { onError: speechFailed });
    readSpeech.current = speech;
    setReading(true);
    void speech.done.then(() => {
      if (readSpeech.current === speech) {
        readSpeech.current = null;
        setReading(false);
      }
    });
  }, [speechFailed]);

  const stopReading = useCallback(() => {
    readSpeech.current?.cancel();
    readSpeech.current = null;
    setReading(false);
  }, []);

  // Seite verlassen: alles aus
  useEffect(
    () => () => {
      if (session.current) end(session.current);
      readSpeech.current?.cancel();
    },
    [end],
  );

  return {
    /** Zuhören möglich (Mikrofon-APIs vorhanden) */
    supported: voiceSupported(),
    /** Vorlesen möglich */
    canSpeak: speechSupported(),
    phase,
    active: phase !== 'off',
    heard,
    error,
    clearError: () => setError(null),
    level: level as SharedValue<number>,
    reading,
    start,
    stop,
    next,
    read,
    stopReading,
  };
}

export type VoiceMode = ReturnType<typeof useVoiceMode>;
