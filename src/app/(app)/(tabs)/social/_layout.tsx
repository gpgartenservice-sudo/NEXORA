import { Stack } from 'expo-router';

import { useStackBackground } from '@/features/design/backgrounds';
import { AreaGate } from '@/features/team/area-gate';

// Zurück-Wischen übernimmt edge-swipe.tsx (sonst ginge es doppelt zurück)
// Im Team: ohne Recht für diesen Bereich ein Hinweis statt der Seiten (Profil → Team)
export default function SocialLayout() {
  const background = useStackBackground();
  return (
    <AreaGate area="social">
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: background } }} />
    </AreaGate>
  );
}

/** Fehler in diesem Bereich: Fehlerseite statt Absturz */
export { AppError as ErrorBoundary } from '@/components/app-error';
