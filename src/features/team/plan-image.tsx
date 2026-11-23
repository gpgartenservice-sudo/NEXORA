import { X } from 'lucide-react-native';
import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Image as SvgImage, Line, Rect, Text as SvgText } from 'react-native-svg';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { sellerName, type Seller } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { base64ToBytes, type LogoImage } from '@/features/documents/logo-logic';
import { playSound } from '@/features/sound/ui-sound';
import { saveFile, savesViaShareSheet } from '@/lib/files';

import { layoutPlanImage, PLAN_PAPER, workPlanImageName, type PlanDrawing } from './plan-image-logic';
import { isoWeek, rangeLabel, type PlanSnapshot } from './staff-logic';

/**
 * Fertiger Arbeitsplan als Bild – direkt in der App ansehen statt herunterladen.
 * Gezeichnet als SVG (scharf bei jeder Größe); „Als Bild sichern“ macht daraus ein PNG.
 */

export type PlanImageSource = { plan: PlanSnapshot; version: number; publishedAt: string };

// iOS kennt nur einzelne Schriftnamen, der Browser eine Liste
const FONT = Platform.OS === 'web' ? 'Helvetica, Arial, sans-serif' : 'Helvetica';
/** PNG in dreifacher Größe (A4-Breite ≈ 1785 px) – gut lesbar, auch beim Vergrößern */
const PNG_SCALE = 3;
const IMAGE_SHARED = 'Bild erstellt – im Teilen-Menü sichern oder verschicken.';

function senderLines(s: Seller): string[] {
  return [s.owner_name && s.company_name ? s.owner_name : null, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(
    (l): l is string => !!l,
  );
}

/** Das Bild selbst (Breite in Punkten, Höhe ergibt sich) */
export function WorkPlanImage({
  drawing,
  width,
  logo,
  svgRef,
}: {
  drawing: PlanDrawing;
  width: number;
  logo?: LogoImage | null;
  svgRef?: Ref<Svg>;
}) {
  const height = (drawing.height / drawing.width) * width;
  return (
    <Svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${drawing.width} ${drawing.height}`}>
      <Rect x={0} y={0} width={drawing.width} height={drawing.height} fill={PLAN_PAPER} />
      {drawing.items.map((it, i) => {
        switch (it.t) {
          case 'rect':
            return <Rect key={i} x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fill} opacity={it.opacity ?? 1} />;
          case 'line':
            return <Line key={i} x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.color} strokeWidth={it.width} />;
          case 'logo':
            return logo ? (
              <SvgImage
                key={i}
                x={it.x}
                y={it.y}
                width={it.w}
                height={it.h}
                href={`data:${logo.mime};base64,${logo.data}`}
                preserveAspectRatio="xMinYMin meet"
              />
            ) : null;
          case 'text':
            return (
              <SvgText
                key={i}
                x={it.x}
                y={it.y}
                fontSize={it.size}
                fontFamily={FONT}
                fontWeight={it.bold ? 'bold' : 'normal'}
                fontStyle={it.italic ? 'italic' : 'normal'}
                fill={it.color}
                textAnchor={it.end ? 'end' : 'start'}>
                {it.text}
              </SvgText>
            );
        }
      })}
    </Svg>
  );
}

/** Fenster mit dem Plan als Bild – „Als Bild sichern“ und Platz für weitere Knöpfe (PDF) */
export function PlanImageViewer({
  source,
  visible,
  onClose,
  extra,
}: {
  source: PlanImageSource;
  visible: boolean;
  onClose: () => void;
  /** weitere Knöpfe unten (z. B. PDF) */
  extra?: ReactNode;
}) {
  const { seller, logo } = useDocuments();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const svg = useRef<Svg>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const logoSize = logo ? { width: logo.width, height: logo.height } : null;
  const drawing = useMemo(
    () =>
      layoutPlanImage({
        plan: source.plan,
        company: { name: sellerName(seller), lines: senderLines(seller) },
        version: source.version,
        publishedAt: source.publishedAt,
        accent: Colors.accent,
        logo: logoSize,
      }),
    // nur neu rechnen, wenn sich Plan, Firma oder Logo-Größe ändern
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, seller, logoSize?.width, logoSize?.height],
  );
  const imageWidth = Math.min(windowWidth - 2 * Spacing.lg - 2 * Spacing.md, 820);
  const sunday = source.plan.days.at(-1)?.day ?? source.plan.week;

  const saveImage = () => {
    const current = svg.current;
    if (!current || busy) return;
    setBusy(true);
    setMessage(null);
    let done = false;
    const fail = (e: unknown) => {
      if (done) return;
      done = true;
      setBusy(false);
      setMessage({ tone: 'error', text: `Das Bild konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` });
    };
    // falls das Zeichnen nie fertig meldet (z. B. kaputtes Logo), nicht ewig drehen
    const timer = setTimeout(() => fail('Zeitüberschreitung'), 15_000);
    try {
      current.toDataURL(
        (base64: string) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          void (async () => {
            try {
              await saveFile(base64ToBytes(base64), workPlanImageName(source.plan), 'image/png');
              playSound('check');
              setMessage({ tone: 'success', text: savesViaShareSheet ? IMAGE_SHARED : 'Bild gespeichert (PNG).' });
            } catch (e) {
              console.warn('[Arbeitsplan-Bild]', e);
              setMessage({ tone: 'error', text: `Das Bild konnte nicht gespeichert werden.\n\nTechnische Details: ${String(e)}` });
            }
            setBusy(false);
          })();
        },
        { width: drawing.width * PNG_SCALE, height: drawing.height * PNG_SCALE },
      );
    } catch (e) {
      clearTimeout(timer);
      console.warn('[Arbeitsplan-Bild]', e);
      fail(e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onClose} accessibilityLabel="Schließen" />
        <View style={styles.panel} accessibilityViewIsModal testID="plan-image">
          <View style={styles.head}>
            <View style={styles.flex}>
              <Text style={styles.title}>Arbeitsplan KW {isoWeek(source.plan.week)}</Text>
              <Text style={styles.sub}>{rangeLabel(source.plan.week, sunday)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Schließen" style={styles.close}>
              <X size={18} color={Colors.textMuted} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.paper} accessibilityRole="image" accessibilityLabel={`Arbeitsplan KW ${isoWeek(source.plan.week)} als Bild`}>
              <WorkPlanImage drawing={drawing} width={imageWidth} logo={logo} svgRef={svg} />
            </View>
          </ScrollView>
          {!!message && <Notice tone={message.tone}>{message.text}</Notice>}
          <View style={styles.actions}>
            <Button label={savesViaShareSheet ? 'Bild teilen' : 'Als Bild sichern'} onPress={saveImage} loading={busy} />
            {extra}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  dim: { backgroundColor: 'rgba(0,0,0,0.72)' },
  panel: {
    width: '100%',
    maxWidth: 860,
    maxHeight: '100%',
    flexShrink: 1,
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xs },
  flex: { flex: 1 },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceRaised },
  scroll: { flexShrink: 1 },
  scrollContent: { alignItems: 'center' },
  paper: { borderRadius: 6, overflow: 'hidden', backgroundColor: PLAN_PAPER },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
});
