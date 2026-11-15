import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

import type { DayWeather, WeatherKind } from './weather-logic';

const ICON: Record<WeatherKind, typeof Sun> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

const COLOR: Record<WeatherKind, string> = {
  sun: '#FFC94A',
  partly: '#FFD978',
  cloud: '#A9B1BD',
  fog: '#A9B1BD',
  drizzle: '#7DB4FF',
  rain: '#5B9BFF',
  snow: '#E6F0FF',
  storm: '#C79BFF',
};

/** Kleines Wettersymbol mit Höchsttemperatur (z. B. unten rechts an einem Kalendertag) */
export function WeatherBadge({ weather, compact }: { weather: DayWeather | undefined; compact?: boolean }) {
  if (!weather) return null;
  const Icon = ICON[weather.kind];
  const text = [weather.label, weather.max !== null ? `bis ${weather.max} °C` : null, weather.rain !== null && weather.rain >= 20 ? `Regen ${weather.rain} %` : null]
    .filter(Boolean)
    .join(', ');
  return (
    <View style={styles.badge} accessibilityLabel={`Wetter: ${text}`} accessible>
      <Icon size={compact ? 15 : 17} color={COLOR[weather.kind]} strokeWidth={2} />
      {weather.max !== null && <Text style={styles.temp}>{weather.max}°</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  temp: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
