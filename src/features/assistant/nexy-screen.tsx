import { ArrowUp } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
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
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { useHover } from '@/hooks/use-hover';

import { NexyAvatar, type NexyMood } from './nexy-avatar';
import { NexyProposals } from './nexy-proposals';
import { useNexy, type NexyMessage } from './nexy-provider';

const MAX = 2000;

const STARTERS = [
  'Neuer Kunde Lisa Wagner, 0171 2345678 – will eine Website für 1.500 €. Erstgespräch Donnerstag 10 Uhr.',
  'Schreib eine Rechnung für meinen letzten Auftrag.',
  'Welche Rechnungen sind noch offen?',
  'Erstell mir einen Einkommensnachweis für die letzten 3 Monate.',
  'Ich hab gestern 49,90 € für Flyer bezahlt.',
  'Gib mir 3 TikTok-Ideen für mein Business.',
];

/** Nexy – Chat mit dem KI-Assistenten. */
export function NexyScreen() {
  const { messages, thinking, send, reset } = useNexy();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const top = wide ? (Platform.OS === 'web' ? 56 : insets.top + Spacing.xxl) : insets.top + Spacing.xl;
  const pad = wide ? Spacing.xxxl : Spacing.lg;
  const scroll = useRef<ScrollViewInstance>(null);
  const [text, setText] = useState('');
  // Neue Nachrichten von Nexy tippen sich ein; ältere stehen sofort da
  const [seen] = useState(() => new Set(messages.map((m) => m.id)));

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
  const heroMood: NexyMood = thinking ? 'thinking' : 'idle';

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: top, paddingBottom: Spacing.xl }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <View style={[styles.inner, { paddingHorizontal: pad }]}>
          {messages.length === 0 ? (
            <View style={styles.hero}>
              <Reveal style={styles.heroFigure}>
                <NexyAvatar size={wide ? 140 : 112} mood={heroMood} interactive talk />
              </Reveal>
              <AnimatedTitle text="Hey, ich bin Nexy." style={styles.heroTitle} delay={150} />
              <Reveal delay={350}>
                <Text style={styles.heroText}>
                  Erzähl mir, was ansteht. Ich lege Kunden, Aufträge und Ausgaben an, schreibe Angebote und Rechnungen
                  als PDF und beantworte deine Fragen – du bestätigst, bevor etwas passiert.
                </Text>
              </Reveal>
              <Reveal delay={480}>
                <View style={styles.starters}>
                  {STARTERS.map((s) => (
                    <Starter key={s} text={s} onPress={() => submit(s)} />
                  ))}
                </View>
              </Reveal>
            </View>
          ) : (
            <View style={styles.head}>
              <NexyAvatar size={34} mood={thinking ? 'thinking' : 'idle'} interactive />
              <View style={styles.headTexts}>
                <Text style={styles.headTitle}>Nexy</Text>
                <Text style={styles.headSub}>Dein KI-Assistent</Text>
              </View>
              <Pressable onPress={reset} accessibilityRole="button" disabled={thinking}>
                <Text style={styles.reset}>Neues Gespräch</Text>
              </Pressable>
            </View>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <Animated.View key={m.id} entering={FadeInDown.duration(260)} style={styles.userRow}>
                <View style={styles.userBubble}>
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
              accessibilityLabel="Nexy denkt nach">
              <NexyAvatar size={30} mood="thinking" />
              <View style={styles.thinkingBubble}>
                <Text style={styles.thinkingText}>Nexy denkt nach</Text>
                <Dots />
              </View>
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingHorizontal: pad }]}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX))}
            placeholder="Schreib Nexy …"
            placeholderTextColor={Colors.textFaint}
            multiline
            onKeyPress={onKeyPress}
            accessibilityLabel="Nachricht an Nexy"
            style={styles.input}
            selectionColor={Colors.text}
          />
          <Pressable
            onPress={() => submit()}
            disabled={!text.trim() || thinking}
            accessibilityRole="button"
            accessibilityLabel="Senden"
            style={[styles.send, (!text.trim() || thinking) && styles.sendOff]}>
            <ArrowUp size={18} color={Colors.onAccent} strokeWidth={2.6} />
          </Pressable>
        </View>
        <Text style={styles.foot}>
          {Platform.OS === 'web' && wide ? 'Enter zum Senden · Shift + Enter für neue Zeile · ' : ''}Nexy nutzt Claude (Anthropic): Deine
          Nachricht und eine Übersicht deiner Kunden, Aufträge und Zahlen werden dafür übertragen.
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
        {m.notSetUp && (
          <Card>
            <Text style={styles.setupTitle}>Nexy einrichten (einmalig)</Text>
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
  foot: { color: Colors.textFaint, fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
});
