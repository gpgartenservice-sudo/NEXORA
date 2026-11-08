import { useFocusEffect } from 'expo-router';
import { ArrowUp, Mic, Sparkles, Volume2, VolumeX, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { ActionChip } from '@/components/ui/action-chip';
import { Card } from '@/components/ui/card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { quotaText } from '@/features/plan/plan-logic';
import { openPlanScreen, usePlan } from '@/features/plan/plan-provider';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';
import { useHover } from '@/hooks/use-hover';

import { NexyAvatar, type NexyMood } from './nexy-avatar';
import { NexyProposals } from './nexy-proposals';
import { runnableNow } from './assistant-logic';
import { useGuide, useRunProposals } from './nexy-guide';
import { useNexy, type NexyMessage } from './nexy-provider';
import { useVoiceMode, type VoiceMode, type VoicePhase } from './use-voice-mode';
import { spokenReply } from './voice-logic';

const MAX = 2000;
const READ_ALOUD_KEY = 'nexora.nexy.readAloud';

function loadReadAloud(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(READ_ALOUD_KEY) === '1';
  } catch {
    return false;
  }
}

function saveReadAloud(on: boolean) {
  try {
    localStorage.setItem(READ_ALOUD_KEY, on ? '1' : '0');
  } catch {
    // nicht schlimm – gilt dann nur bis zum Neuladen
  }
}

/** Wie Luna im Sprachmodus aussieht */
function voiceMood(phase: VoicePhase): NexyMood | null {
  if (phase === 'listening') return 'listening';
  if (phase === 'speaking') return 'talking';
  if (phase === 'off') return null;
  return 'thinking';
}

const VOICE_STATUS: Record<VoicePhase, string> = {
  off: '',
  starting: 'Mikrofon startet …',
  listening: 'Ich höre zu …',
  transcribing: 'Ich höre genau hin …',
  thinking: 'Ich denke nach …',
  working: 'Ich erledige das …',
  speaking: 'Luna spricht …',
};

const STARTERS = [
  'Neuer Kunde Lisa Wagner, 0171 2345678 – will eine Website für 1.500 €. Erstgespräch Donnerstag 10 Uhr.',
  'Schreib eine Rechnung für meinen letzten Auftrag.',
  'Welche Rechnungen sind noch offen?',
  'Erstell mir einen Einkommensnachweis für die letzten 3 Monate.',
  'Ich hab gestern 49,90 € für Flyer bezahlt.',
  'Trag mir Freitag 14 Uhr Steuerberatung ein.',
  'Mein Canva-Abo kostet jetzt 14,99 € im Monat – ändere das bitte.',
  'Gib mir 3 TikTok-Ideen für mein Business.',
];

/** Luna – Chat mit der KI-Assistentin. */
export function NexyScreen() {
  const { messages, thinking, send, reset, blockers, executing } = useNexy();
  const runProposals = useRunProposals();
  const runLatest = useRef(runProposals);
  // Führt Luna gerade etwas vor, verlässt sie den Chat nur kurz – der Sprachmodus bleibt an
  const guide = useGuide();
  const guiding = useRef(false);
  useEffect(() => {
    runLatest.current = runProposals;
    guiding.current = !!guide?.running;
  });
  const { info } = usePlan();
  // Starter: ab 5 übrigen Nachrichten anzeigen, wie viele noch gehen
  const left = info && info.plan === 'free' ? info.usage.nexy.limit - info.usage.nexy.used : null;
  const quotaHint = left !== null && left <= 5 && info ? quotaText(info, 'nexy') : null;
  const voice = useVoiceMode();
  const { stop: stopVoice, stopReading, read } = voice;
  const [readAloud, setReadAloud] = useState(loadReadAloud);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const top = wide ? (Platform.OS === 'web' ? 56 : insets.top + Spacing.xxl) : insets.top + Spacing.xl;
  const pad = wide ? Spacing.xxxl : Spacing.lg;
  const scroll = useRef<ScrollViewInstance>(null);
  const [text, setText] = useState('');
  useAreaTutorial('nexy');
  // Neue Nachrichten von Luna tippen sich ein; ältere stehen sofort da
  const [seen] = useState(() => new Set(messages.map((m) => m.id)));
  const [readIds] = useState(() => new Set(messages.map((m) => m.id)));
  const [autoIds] = useState(() => new Set(messages.map((m) => m.id)));

  // Bereich verlassen: Zuhören und Vorlesen aus (nicht, während Luna etwas vorführt)
  useFocusEffect(
    useCallback(
      () => () => {
        if (guiding.current) return;
        stopVoice();
        stopReading();
      },
      [stopVoice, stopReading],
    ),
  );

  const submit = (value = text) => {
    const v = value.trim();
    if (!v || thinking) return;
    setText('');
    void send(v);
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
    if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const lastNexy = [...messages].reverse().find((m) => m.role === 'nexy');
  const heroMood: NexyMood = voiceMood(voice.phase) ?? (voice.reading ? 'talking' : thinking ? 'thinking' : 'idle');

  // Luna legt sofort los, sobald sie weiß, was zu tun ist – ohne „Ausführen“.
  // Fehlt noch etwas, wartet sie, bis es in der Karte geklärt ist (Kunde/Auftrag
  // gewählt, Firmendaten ergänzt), und legt dann los. Im Sprachmodus übernimmt
  // das der Sprachmodus.
  const autoRun =
    !!lastNexy &&
    lastNexy.status === 'open' &&
    !!lastNexy.proposals?.length &&
    runnableNow(lastNexy.proposals, lastNexy.doneIds ?? [], blockers);
  useEffect(() => {
    if (!lastNexy || autoIds.has(lastNexy.id) || !autoRun || executing) return;
    if (voice.active) {
      // die neue Antwort führt der Sprachmodus selbst aus
      autoIds.add(lastNexy.id);
      return;
    }
    const id = lastNexy.id;
    // kurz die Antwort lesen lassen, dann geht es los
    const timer = setTimeout(() => {
      if (autoIds.has(id)) return;
      autoIds.add(id);
      void runLatest.current(id);
    }, 800);
    return () => clearTimeout(timer);
  }, [lastNexy, autoIds, autoRun, executing, voice.active]);

  // "Vorlesen" an: neue Antworten werden vorgelesen (im Sprachmodus übernimmt das der Sprachmodus;
  // legt Luna gleich los, erzählt sie es bei der Vorführung)
  useEffect(() => {
    if (!lastNexy || readIds.has(lastNexy.id)) return;
    readIds.add(lastNexy.id);
    if (readAloud && !autoRun && !voice.active && voice.canSpeak) {
      read(lastNexy.error ? spokenReply(lastNexy) : lastNexy.text);
    }
  }, [lastNexy, readIds, readAloud, autoRun, voice.active, voice.canSpeak, read]);

  const toggleReadAloud = () => {
    const on = !readAloud;
    setReadAloud(on);
    saveReadAloud(on);
    if (!on) stopReading();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: top, paddingBottom: Spacing.xl }}
        // Begrüßung bleibt oben (Luna im Blick), im Gespräch zur neuesten Nachricht
        onContentSizeChange={() => messages.length > 0 && scroll.current?.scrollToEnd({ animated: true })}>
        <View style={[styles.inner, { paddingHorizontal: pad }]}>
          {messages.length === 0 ? (
            <View style={styles.hero}>
              <View style={styles.heroHelp}>
                <TutorialButton id="nexy" />
              </View>
              <Reveal style={styles.heroFigure}>
                <TourTarget id="guide.nexy">
                  <NexyAvatar size={wide ? 140 : 112} mood={heroMood} interactive talk level={voice.level} />
                </TourTarget>
              </Reveal>
              <AnimatedTitle text="Hey, ich bin Luna." style={styles.heroTitle} delay={150} />
              <Reveal delay={350}>
                <Text style={styles.heroText}>
                  Erzähl mir, was ansteht – schreibend oder per Sprache. Ich lege Kunden, Aufträge und Ausgaben an,
                  ändere oder lösche sie, schreibe Angebote und Rechnungen als PDF, öffne jede Seite und beantworte
                  deine Fragen. Was ich mache, erledige ich direkt – du siehst mir dabei zu.
                </Text>
              </Reveal>
              <TourTarget id="nexy.ideen">
                <Reveal delay={480}>
                  <View style={styles.starters}>
                    {STARTERS.map((s) => (
                      <Starter key={s} text={s} onPress={() => submit(s)} />
                    ))}
                  </View>
                </Reveal>
              </TourTarget>
            </View>
          ) : (
            <View style={styles.head}>
              <TourTarget id="guide.nexy">
                <NexyAvatar size={34} mood={heroMood} interactive level={voice.level} />
              </TourTarget>
              <View style={styles.headTexts}>
                <Text style={styles.headTitle}>Luna</Text>
                <Text style={styles.headSub}>Deine KI-Assistentin</Text>
              </View>
              {voice.canSpeak && (
                <Pressable
                  onPress={toggleReadAloud}
                  accessibilityRole="switch"
                  aria-checked={readAloud}
                  accessibilityLabel="Antworten vorlesen"
                  style={[styles.readToggle, readAloud && styles.readToggleOn]}>
                  {readAloud ? (
                    <Volume2 size={15} color={Colors.accent} strokeWidth={2} />
                  ) : (
                    <VolumeX size={15} color={Colors.textMuted} strokeWidth={2} />
                  )}
                  <Text style={[styles.readText, readAloud && styles.readTextOn]}>Vorlesen</Text>
                </Pressable>
              )}
              <TutorialButton id="nexy" />
              <Pressable
                onPress={() => {
                  stopVoice();
                  stopReading();
                  reset();
                }}
                accessibilityRole="button"
                disabled={thinking}>
                <Text style={styles.reset}>Neues Gespräch</Text>
              </Pressable>
            </View>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <Animated.View key={m.id} entering={FadeInDown.duration(260)} style={styles.userRow}>
                <View style={styles.userBubble}>
                  {m.voice && (
                    <View style={styles.voiceTag} accessibilityLabel="per Sprache">
                      <Mic size={12} color={Colors.textFaint} strokeWidth={2.2} />
                    </View>
                  )}
                  <Text style={styles.userText}>{m.text}</Text>
                </View>
              </Animated.View>
            ) : (
              <NexyRow
                key={m.id}
                message={m}
                latest={m.id === lastNexy?.id}
                typing={!seen.has(m.id) && m.id === lastNexy?.id}
                onQuickReply={submit}
                disabled={thinking}
              />
            ),
          )}

          {thinking && (
            <Animated.View
              entering={FadeInDown.duration(220)}
              style={styles.nexyRow}
              accessibilityLabel="Luna denkt nach">
              <NexyAvatar size={30} mood="thinking" />
              <View style={styles.thinkingBubble}>
                <Text style={styles.thinkingText}>Luna denkt nach</Text>
                <Dots />
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingHorizontal: pad }]}>
        {voice.error && !voice.active && (
          <Animated.View entering={FadeInDown.duration(220)} style={styles.voiceError} accessibilityRole="alert">
            <Text style={styles.voiceErrorText}>{voice.error.text}</Text>
            <Pressable
              onPress={voice.clearError}
              accessibilityRole="button"
              accessibilityLabel="Hinweis schließen"
              hitSlop={8}>
              <X size={16} color={Colors.textMuted} strokeWidth={2} />
            </Pressable>
          </Animated.View>
        )}
        {voice.active ? (
          <VoicePanel voice={voice} />
        ) : (
          <TourTarget id="nexy.eingabe" style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={(v) => setText(v.slice(0, MAX))}
              placeholder="Schreib Luna …"
              placeholderTextColor={Colors.textFaint}
              multiline
              onKeyPress={onKeyPress}
              accessibilityLabel="Nachricht an Luna"
              style={styles.input}
              selectionColor={Colors.text}
            />
            {voice.supported && !text.trim() ? (
              <MicButton onPress={() => void voice.start()} disabled={thinking} />
            ) : (
              <Pressable
                onPress={() => submit()}
                disabled={!text.trim() || thinking}
                accessibilityRole="button"
                accessibilityLabel="Senden"
                style={[styles.send, (!text.trim() || thinking) && styles.sendOff]}>
                <ArrowUp size={18} color={Colors.onAccent} strokeWidth={2.6} />
              </Pressable>
            )}
          </TourTarget>
        )}
        {!!quotaHint && (
          <Text style={styles.quota} testID="nexy-quota">
            {quotaHint} ·{' '}
            <Text style={styles.quotaLink} onPress={() => openPlanScreen()} accessibilityRole="link">
              Pro ansehen
            </Text>
          </Text>
        )}
        <Text style={styles.foot}>
          {voice.active
            ? 'Sag „Ja“ oder „Nein“ zu Vorschlägen und „Stopp“ zum Beenden. Deine Aufnahme wird nur in Text umgewandelt (Groq) und nicht gespeichert.'
            : `${Platform.OS === 'web' && wide ? 'Enter zum Senden · Shift + Enter für neue Zeile · ' : ''}Luna nutzt Claude (Anthropic): Deine Nachricht und eine Übersicht deiner Kunden, Aufträge und Zahlen werden dafür übertragen.`}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function NexyRow({
  message: m,
  latest,
  typing,
  onQuickReply,
  disabled,
}: {
  message: NexyMessage;
  latest: boolean;
  typing: boolean;
  onQuickReply: (text: string) => void;
  disabled: boolean;
}) {
  const shown = useTypewriter(m.text, typing);
  const finished = shown.length >= m.text.length;
  const mood: NexyMood = latest && m.status === 'done' ? 'happy' : 'idle';
  return (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.nexyRow}>
      <NexyAvatar size={30} mood={mood} animate={latest} interactive={latest} />
      <View style={styles.nexyColumn}>
        <View style={[styles.nexyBubble, !!m.error && !m.proposals && styles.errorBubble]}>
          <Text style={[styles.nexyText, !!m.error && !m.proposals && styles.errorText]}>{shown}</Text>
        </View>
        {m.quota && (
          <View style={styles.quotaAction}>
            <ActionChip icon={Sparkles} label="Lunaxora Pro ansehen" onPress={() => openPlanScreen()} />
          </View>
        )}
        {m.notSetUp && (
          <Card>
            <Text style={styles.setupTitle}>Luna einrichten (einmalig)</Text>
            <Text style={styles.setupText}>
              1. API-Schlüssel bei console.anthropic.com erstellen.{'\n'}2. In Supabase die Server-Funktion „assistant“
              anlegen (Code: supabase/functions/assistant/index.ts).{'\n'}3. Den Schlüssel dort als Geheimnis
              ANTHROPIC_API_KEY speichern.
            </Text>
            <Text style={styles.foot}>Die genaue Anleitung steht in supabase/README.md.</Text>
          </Card>
        )}
        {finished && !!m.proposals?.length && <NexyProposals message={m} />}
        {finished && latest && !!m.quickReplies?.length && (
          <View style={styles.quick}>
            {m.quickReplies.map((q) => (
              <QuickReply key={q} text={q} onPress={() => onQuickReply(q)} disabled={disabled} />
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

/** Text erscheint zügig Stück für Stück (bei "Bewegung reduzieren" sofort). */
function useTypewriter(text: string, enabled: boolean): string {
  const reduce = useReducedMotion();
  const animate = enabled && !reduce;
  const [count, setCount] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) return;
    const step = Math.max(2, Math.ceil(text.length / 45));
    const timer = setInterval(() => {
      setCount((c) => {
        const next = Math.min(text.length, c + step);
        if (next >= text.length) clearInterval(timer);
        return next;
      });
    }, 16);
    return () => clearInterval(timer);
  }, [animate, text]);
  return animate ? text.slice(0, count) : text;
}

/** Mikrofon-Knopf im Eingabefeld: startet den Sprachmodus */
function MicButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Mit Luna sprechen"
      {...hoverProps}
      style={[styles.send, styles.mic, hovered && styles.micHover, disabled && styles.sendOff]}>
      <Mic size={18} color={Colors.onAccent} strokeWidth={2.4} />
    </Pressable>
  );
}

/** Sprachmodus: Luna hört zu / denkt / spricht – ersetzt das Eingabefeld */
function VoicePanel({ voice }: { voice: VoiceMode }) {
  const { phase } = voice;
  const mood = voiceMood(phase) ?? 'idle';
  const canSkip = phase === 'listening' || phase === 'speaking';
  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      style={styles.voicePanel}
      accessibilityLabel="Sprachmodus"
      testID="nexy-voice-panel">
      {/* Platz für die Schallringe */}
      <View style={styles.voiceFigure}>
        <NexyAvatar size={50} mood={mood} level={voice.level} />
      </View>
      <View style={styles.voiceTexts}>
        <View style={styles.voiceStatusRow}>
          <Text style={styles.voiceStatus} accessibilityLiveRegion="polite" testID="nexy-voice-status">
            {VOICE_STATUS[phase]}
          </Text>
          {phase === 'listening' && <LevelBars level={voice.level} />}
          {(phase === 'transcribing' || phase === 'thinking' || phase === 'working' || phase === 'starting') && (
            <Dots />
          )}
        </View>
        {voice.heard ? (
          <Text style={styles.voiceHeard} numberOfLines={2}>
            „{voice.heard}“
          </Text>
        ) : (
          <Text style={styles.voiceHint} numberOfLines={2}>
            Sprich einfach los – ich merke, wenn du fertig bist.
          </Text>
        )}
      </View>
      <View style={styles.voiceButtons}>
        {canSkip && (
          <Pressable
            onPress={voice.next}
            accessibilityRole="button"
            style={styles.voiceSkip}
            accessibilityLabel={phase === 'listening' ? 'Fertig, jetzt senden' : 'Luna unterbrechen'}>
            <Text style={styles.voiceSkipText}>{phase === 'listening' ? 'Fertig' : 'Unterbrechen'}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={voice.stop}
          accessibilityRole="button"
          accessibilityLabel="Sprachmodus beenden"
          style={styles.voiceStop}>
          <X size={18} color={Colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const BAR_WEIGHTS = [0.45, 0.8, 1, 0.7, 0.4];

/** Kleine Pegelanzeige: zeigt, dass Luna dich hört */
function LevelBars({ level }: { level: SharedValue<number> }) {
  return (
    <View style={styles.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BAR_WEIGHTS.map((w, i) => (
        <LevelBar key={i} weight={w} level={level} />
      ))}
    </View>
  );
}

function LevelBar({ weight, level }: { weight: number; level: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ height: 4 + Math.min(1, level.get() * weight * 1.4) * 14 }));
  return <Animated.View style={[styles.bar, style]} />;
}

function Dots() {
  const reduce = useReducedMotion();
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 160} still={reduce} />
      ))}
    </View>
  );
}

function Dot({ delay, still }: { delay: number; still: boolean }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    if (still) return;
    v.set(
      withDelay(
        delay,
        withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.3, { duration: 380 })), -1),
      ),
    );
  }, [delay, still, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.get(), transform: [{ translateY: (1 - v.get()) * 2 }] }));
  return <Animated.View style={[styles.dot, style]} />;
}

function Starter({ text, onPress }: { text: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...hoverProps}
      style={[styles.starter, hovered && styles.starterHover]}>
      <Text style={styles.starterText}>{text}</Text>
    </Pressable>
  );
}

function QuickReply({ text, onPress, disabled }: { text: string; onPress: () => void; disabled: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Antworten: ${text}`}
      {...hoverProps}
      style={[styles.quickChip, hovered && styles.quickHover]}>
      <Text style={styles.quickText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  inner: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: Spacing.lg },
  hero: { alignItems: 'center', gap: Spacing.lg, marginTop: Spacing.xxl },
  heroHelp: { alignSelf: 'flex-end', marginTop: -Spacing.xxl, marginBottom: -Spacing.md },
  // Platz für Antenne oben und Schatten unten
  heroFigure: { paddingTop: Spacing.lg, paddingBottom: Spacing.xl },
  heroTitle: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.6, textAlign: 'center' },
  heroText: { color: Colors.textMuted, fontSize: 15.5, lineHeight: 23, textAlign: 'center', maxWidth: 560 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center', maxWidth: 720 },
  starter: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    maxWidth: 340,
  },
  starterHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  starterText: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  headTexts: { flex: 1 },
  headTitle: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  headSub: { color: Colors.textFaint, fontSize: 12.5 },
  reset: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  userText: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  nexyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  nexyColumn: { flex: 1, gap: Spacing.sm, minWidth: 0 },
  nexyBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderRadius: 18,
    borderTopLeftRadius: 6,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.28)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  nexyText: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  errorBubble: { backgroundColor: 'rgba(255,107,107,0.08)', borderColor: 'rgba(255,107,107,0.35)' },
  errorText: { color: Colors.danger },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderTopLeftRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
  thinkingText: { color: Colors.textMuted, fontSize: 14 },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  quotaAction: { flexDirection: 'row' },
  quota: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center' },
  quotaLink: { color: Colors.accent, fontWeight: '600' },
  quickChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  quickHover: { backgroundColor: Colors.accentSoft },
  quickText: { color: Colors.text, fontSize: 13.5, fontWeight: '500' },
  setupTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  setupText: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  composerWrap: {
    width: '100%',
    maxWidth: 860 + 2 * Spacing.xxxl,
    alignSelf: 'center',
    gap: 6,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderFocus,
    backgroundColor: Colors.surface,
    paddingLeft: Spacing.lg,
    paddingRight: 6,
    paddingVertical: 6,
    boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
  },
  input: { flex: 1, minHeight: 38, maxHeight: 140, color: Colors.text, fontSize: 15.5, paddingVertical: 9 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOff: { opacity: 0.35 },
  mic: { boxShadow: '0 0 0 0 rgba(47,227,154,0)' },
  micHover: { boxShadow: '0 0 0 5px rgba(47,227,154,0.18)' },
  voiceTag: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  readToggleOn: { borderColor: 'rgba(47,227,154,0.45)', backgroundColor: Colors.accentSoft },
  readText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  readTextOn: { color: Colors.text },
  voicePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.45)',
    backgroundColor: Colors.surface,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
    paddingVertical: Spacing.xs,
    boxShadow: '0 10px 30px rgba(0,0,0,0.45), 0 0 24px rgba(47,227,154,0.12)',
  },
  voiceFigure: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  voiceTexts: { flex: 1, minWidth: 0, gap: 3 },
  voiceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  voiceStatus: { color: Colors.text, fontSize: 15.5, fontWeight: '700' },
  voiceHeard: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19, fontStyle: 'italic' },
  voiceHint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  voiceButtons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voiceSkip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.borderFocus,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  voiceSkipText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  voiceStop: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 18 },
  bar: { width: 3.5, borderRadius: 2, backgroundColor: Colors.accent },
  voiceError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.08)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  voiceErrorText: { flex: 1, color: Colors.text, fontSize: 13.5, lineHeight: 19 },
  foot: { color: Colors.textFaint, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
});
