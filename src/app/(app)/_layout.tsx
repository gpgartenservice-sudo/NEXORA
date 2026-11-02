import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

/** Alles in (app)/ ist nur für angemeldete Nutzer sichtbar. */
export default function AppLayout() {
  const { session, initializing } = useAuth();

  if (initializing) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }
  if (!session) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }} />;
}
