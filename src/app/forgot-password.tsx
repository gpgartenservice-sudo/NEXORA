import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';

/** Schritt 1 beim Zurücksetzen: Code an die E-Mail-Adresse schicken. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const invalid = validateEmail(email);
    setError(invalid);
    setFailure(null);
    if (invalid) return;

    setLoading(true);
    const address = email.trim();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address);
    setLoading(false);
    if (resetError) {
      setFailure(authErrorMessage(resetError));
      return;
    }
    router.push({ pathname: '/reset-password', params: { email: address } });
  };

  return (
    <AuthShell
      title="Passwort vergessen?"
      subtitle="Kein Problem. Wir schicken dir einen Code, mit dem du ein neues Passwort festlegst."
      footer={
        <AuthFooter>
          <TextLink label="Zurück zur Anmeldung" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </AuthFooter>
      }>
      <View style={styles.form}>
        <TextField
          label="E-Mail"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (error) setError(undefined);
          }}
          error={error}
          placeholder="du@beispiel.de"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {failure && <Notice tone="error">{failure}</Notice>}

        <Button label="Code senden" onPress={submit} loading={loading} style={styles.submit} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  submit: { marginTop: Spacing.sm },
});
