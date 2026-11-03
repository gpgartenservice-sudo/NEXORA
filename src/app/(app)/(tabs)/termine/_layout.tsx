import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';

export default function TermineLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: Colors.background } }}
    />
  );
}
