import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/auth/password-field';
import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { MIN_PASSWORD_LENGTH, validateEmail, validateNewPassword } from '@/lib/validation';

type Errors = { email?: string; password?: string };

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const next: Errors = {
      email: validateEmail(email),
      password: validateNewPassword(password),
    };
    setErrors(next);
    setFailure(null);
    if (next.email || next.password) return;

    setLoading(true);
    const address = email.trim();
    const { data, error } = await supabase.auth.signUp({ email: address, password });
    setLoading(false);

    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }
    if (data.session) {
      // E-Mail-Bestätigung ist in Supabase ausgeschaltet -> direkt angemeldet
      router.replace('/home');
      return;
    }
    router.push({ pathname: '/verify', params: { email: address } });
  };

  const clear = (field: keyof Errors) => {
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  return (
    <AuthShell
      title="Konto erstellen"
      subtitle="In einer Minute startklar – danach richten wir NEXORA gemeinsam auf dich ein."
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

        {failure && <Notice tone="error">{failure}</Notice>}

        <Button label="Konto erstellen" onPress={submit} loading={loading} style={styles.submit} />
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  submit: { marginTop: Spacing.sm },
});
