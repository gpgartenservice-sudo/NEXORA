import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/providers/auth-provider';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.background, card: Colors.background },
};

export default function RootLayout() {
  useEffect(() => {
    // Das native Startbild (N auf Schwarz) geht nahtlos in die Intro-Animation über
    SplashScreen.hideAsync();
    // Web/Mac: Seite als deutsch kennzeichnen (Vorlesefunktion, Silbentrennung, Datumsfelder)
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = 'de';
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        />
      </ThemeProvider>
    </AuthProvider>
  );
}
