import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function AuftraegeLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: Colors.background } }} />;
}
