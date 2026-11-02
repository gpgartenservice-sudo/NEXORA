import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthFooter, AuthShell } from '@/components/auth/auth-shell';
import { CodeField } from '@/components/auth/code-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Spacing } from '@/constants/theme';
import { useCooldown } from '@/hooks/use-cooldown';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { validateCode } from '@/lib/validation';

const RESEND_SECONDS = 60;

/** E-Mail-Adresse nach der Registrierung mit dem Code aus der E-Mail bestätigen. */
export default function VerifyScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cooldown = useCooldown(RESEND_SECONDS);

  const submit = async () => {
    const invalid = validateCode(code);
    setError(invalid);
    setFailure(null);
    if (invalid) return;

    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
    setLoading(false);
    if (verifyError) {
      setFailure(authErrorMessage(verifyError));
      return;
    }
    router.replace('/home');
  };

  const resend = async () => {
    setFailure(null);
    setInfo(null);
    const { error: resendError } = await supabase.auth.resend({ type: 'signup', email });
    if (resendError) {
      setFailure(authErrorMessage(resendError));
      return;
    }
    cooldown.start(RESEND_SECONDS);
    setInfo('Wir haben dir einen neuen Code geschickt.');
  };

  return (
    <AuthShell
      title="E-Mail bestätigen"
      subtitle={`Wir haben dir einen Code an ${email || 'deine E-Mail-Adresse'} geschickt. Gib ihn hier ein.`}
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
            if (error) setError(undefined);
          }}
          error={error}
          autoFocus
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        {failure && <Notice tone="error">{failure}</Notice>}
        {info && !failure && <Notice tone="success">{info}</Notice>}

        <Button label="Bestätigen" onPress={submit} loading={loading} style={styles.submit} />

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
