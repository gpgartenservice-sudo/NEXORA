import { Stack } from 'expo-router';

import { useStackBackground } from '@/features/design/backgrounds';

// Zurück-Wischen übernimmt edge-swipe.tsx (sonst ginge es doppelt zurück)
export default function TeamLayout() {
  const background = useStackBackground();
  return <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: background } }} />;
}

/** Fehler in diesem Bereich: Fehlerseite statt Absturz */
export { AppError as ErrorBoundary } from '@/components/app-error';
