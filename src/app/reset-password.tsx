import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { CodeField } from '@/components/auth/code-field';
import { PasswordField } from '@/components/auth/password-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Spacing } from '@/constants/theme';
import { useCooldown } from '@/hooks/use-cooldown';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { MIN_PASSWORD_LENGTH, validateCode, validateNewPassword } from '@/lib/validation';

const RESEND_SECONDS = 60;

type Errors = { code?: string; password?: string };

/** Schritt 2 beim Zurücksetzen: Code eingeben und neues Passwort festlegen. */
export default function ResetPasswordScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Ein Code gilt nur einmal: ist er schon bestätigt, beim nächsten Versuch nur noch das Passwort setzen
  const [verified, setVerified] = useState(false);
  const cooldown = useCooldown(RESEND_SECONDS);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    const next: Errors = {
      code: verified ? undefined : validateCode(code),
      password: validateNewPassword(password),
    };
    setErrors(next);
    setFailure(null);
    setInfo(null);
    if (next.code || next.password) return;

    setLoading(true);
    // 1. Code prüfen – danach ist man vorübergehend angemeldet
    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (verifyError) {
        setLoading(false);
        setFailure(authErrorMessage(verifyError));
        return;
      }
      setVerified(true);
    }
    // 2. neues Passwort setzen
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setFailure(authErrorMessage(updateError));
      return;
    }
    router.replace('/home');
  };

  const resend = async () => {
    setFailure(null);
    setInfo(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setFailure(authErrorMessage(error));
      return;
    }
    cooldown.start(RESEND_SECONDS);
    setInfo('Wir haben dir einen neuen Code geschickt.');
  };

  return (
    <AuthShell
      title="Neues Passwort"
      subtitle={`Gib den Code ein, den wir an ${email || 'deine E-Mail-Adresse'} geschickt haben, und wähle ein neues Passwort.`}
      footer={
        <AuthFooter>
          <TextLink label="Zurück zur Anmeldung" onPress={() => router.replace('/')} />
        </AuthFooter>
      }>
      <View style={styles.form}>
        <CodeField
          value={code}
          onChangeText={(v) => {
            setCode(v);
            if (errors.code) setErrors((e) => ({ ...e, code: undefined }));
          }}
          error={errors.code}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          submitBehavior="submit"
        />
        <PasswordField
          ref={passwordRef}
          label="Neues Passwort"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          error={errors.password}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {failure && <Notice tone="error">{failure}</Notice>}
        {info && !failure && <Notice tone="success">{info}</Notice>}

        <Button label="Passwort speichern" onPress={submit} loading={loading} style={styles.submit} />

        <View style={styles.resendRow}>
          <TextLink
            label={cooldown.active ? `Neuen Code anfordern (${cooldown.seconds} s)` : 'Keinen Code bekommen? Neu anfordern'}
            onPress={resend}
            disabled={cooldown.active}
          />
        </View>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  submit: { marginTop: Spacing.sm },
  resendRow: { alignItems: 'center' },
});
