import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';

import { AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { LEGAL_URLS, type LegalPage, termsAcceptance } from '@/features/legal/legal-logic';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword } from '@/lib/validation';
import { claimThisDevice } from '@/lib/device';

type Errors = { email?: string; password?: string; terms?: string };

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // AGB + AV-Vertrag: ohne Häkchen kein Konto (Fassung und Zeitpunkt landen am Konto)
  const [accepted, setAccepted] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const next: Errors = {
      email: validateEmail(email),
      password: validateNewPassword(password),
      terms: accepted ? undefined : 'Bitte stimme den AGB und dem AV-Vertrag zu.',
    };
    setErrors(next);
    setFailure(null);
    if (next.email || next.password || next.terms) return;

    setLoading(true);
    const address = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { data: termsAcceptance(new Date()) },
    });
    setLoading(false);

    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }
    if (data.session) {
      // E-Mail-Bestätigung ist in Supabase ausgeschaltet -> direkt angemeldet
      void claimThisDevice();
      router.replace('/home');
      return;
    }
    router.push({ pathname: '/verify', params: { email: address } });
  };

  const clear = (field: keyof Errors) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };
  const toggleTerms = () => {
    setAccepted((v) => !v);
    clear('terms');
  };
  const open = (page: LegalPage) => void Linking.openURL(LEGAL_URLS[page]);

  return (
    <AuthShell
      title="Konto erstellen"
      subtitle="In einer Minute startklar."
      footer={
        <AuthFooter text="Schon ein Konto?">
          <TextLink label="Anmelden" emphasis onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </AuthFooter>
      }>
      <View style={styles.form}>
        <TextField
          label="E-Mail"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            clear('email');
          }}
          error={errors.email}
          placeholder="du@beispiel.de"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <PasswordField
          ref={passwordRef}
          label="Passwort"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clear('password');
          }}
          error={errors.password}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <View style={styles.terms}>
          <Pressable
            onPress={toggleTerms}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            aria-checked={accepted}
            accessibilityLabel="Ich stimme den AGB und dem AV-Vertrag zu"
            hitSlop={8}
            style={[styles.box, accepted && styles.boxOn, !!errors.terms && styles.boxError]}
            testID="register-terms">
            {accepted && <Check size={15} color={Colors.onAccent} strokeWidth={3} />}
          </Pressable>
          <Text style={styles.termsText} onPress={toggleTerms}>
            Ich stimme den{' '}
            <Text style={styles.link} onPress={() => open('agb')} accessibilityRole="link">
              AGB
            </Text>{' '}
            und dem{' '}
            <Text style={styles.link} onPress={() => open('avv')} accessibilityRole="link">
              AV-Vertrag
            </Text>{' '}
            zu. Wie wir mit deinen Daten umgehen, steht in der{' '}
            <Text style={styles.link} onPress={() => open('datenschutz')} accessibilityRole="link">
              Datenschutzerklärung
            </Text>
            .
          </Text>
        </View>
        {!!errors.terms && <Text style={styles.termsError}>{errors.terms}</Text>}

        {failure && <Notice tone="error">{failure}</Notice>}

        <Button label="Konto erstellen" onPress={submit} loading={loading} style={styles.submit} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  submit: { marginTop: Spacing.sm },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  box: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  boxError: { borderColor: Colors.danger },
  termsText: { flex: 1, color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  link: { color: Colors.text, textDecorationLine: 'underline' },
  termsError: { color: Colors.danger, fontSize: 13, marginTop: -Spacing.sm },
});
