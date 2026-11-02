import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';

import { PasswordField } from './password-field';
import { TextField } from './text-field';

type Errors = { email?: string; password?: string };

/** Anmeldung mit E-Mail und Passwort. */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const next: Errors = {
      email: validateEmail(email),
      password: password.length === 0 ? 'Bitte gib dein Passwort ein.' : undefined,
    };
    setErrors(next);
    setFailure(null);
    setUnconfirmed(false);
    if (next.email || next.password) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      setFailure(authErrorMessage(error));
      setUnconfirmed(error.code === 'email_not_confirmed');
      return;
    }
    router.replace('/home');
  };

  const confirmNow = async () => {
    // Neuen Bestätigungscode schicken und zur Code-Eingabe wechseln
    const address = email.trim();
    const { error } = await supabase.auth.resend({ type: 'signup', email: address });
    if (error && error.code !== 'over_email_send_rate_limit') {
      setFailure(authErrorMessage(error));
      return;
    }
    router.push({ pathname: '/verify', params: { email: address } });
  };

  return (
    <View style={styles.form}>
      <TextField
        label="E-Mail"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
        }}
        error={errors.email}
        placeholder="du@beispiel.de"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
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
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />

      <View style={styles.forgotRow}>
        <TextLink
          label="Passwort vergessen?"
          onPress={() => router.push({ pathname: '/forgot-password', params: { email: email.trim() } })}
        />
      </View>

      {failure && (
        <Notice
          tone="error"
          action={unconfirmed ? <Button label="Jetzt bestätigen" variant="secondary" onPress={confirmNow} /> : undefined}>
          {failure}
        </Notice>
      )}

      <Button label="Anmelden" onPress={submit} loading={loading} style={styles.submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  forgotRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -Spacing.xs },
  submit: { marginTop: Spacing.sm },
});
