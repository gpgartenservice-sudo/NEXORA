import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { LETTER_IMAGES, letterFrames, wordmarkHeight } from './letters';

type Props = {
  width: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Der Lunaxora-Schriftzug, zusammengesetzt aus den einzelnen Buchstaben –
 * dadurch sieht er Pixel für Pixel genauso aus wie am Ende der
 * Start-Animation.
 */
export function Wordmark({ width, style }: Props) {
  const height = wordmarkHeight(width);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Lunaxora"
      style={[{ width, height }, style]}>
      {letterFrames(width).map((f) => (
        <Image
          key={f.key}
          source={LETTER_IMAGES[f.key]}
          contentFit="fill"
          style={[styles.letter, { left: f.left, width: f.width, height }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  letter: { position: 'absolute', top: 0 },
});
