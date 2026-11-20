import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { PasswordField } from '@/components/auth/password-field';
import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Spacing } from '@/constants/theme';
import { addAccount } from '@/lib/accounts';
import { authErrorMessage } from '@/lib/auth-errors';
import { validateEmail } from '@/lib/validation';
import { useAuth } from '@/providers/auth-provider';

type Errors = { email?: string; password?: string };

/**
 * Profil → „Weiteres Konto anmelden“: ein zweites Konto auf diesem Gerät anmelden. Das bisherige
 * bleibt angemeldet; im Profil wechselt man über „Konto wechseln“ zurück.
 */
export function AddAccountScreen() {
  const params = useLocalSearchParams<{ email?: string; abgelaufen?: string }>();
  const { user } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/profil'));

  const submit = async () => {
    const next: Errors = {
      email: validateEmail(email),
      password: password.length === 0 ? 'Bitte gib dein Passwort ein.' : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (next.email || next.password) return;

    setLoading(true);
    const result = await addAccount(email.trim(), password, user?.id);
    setLoading(false);
    if (result.ok) {
      router.replace('/home');
      return;
    }
    if (result.same) {
      setFailure('Mit diesem Konto bist du hier gerade angemeldet.');
    } else if (result.error?.code === 'email_not_confirmed') {
      setFailure('Dieses Konto ist noch nicht bestätigt. Melde dich dafür einmal ab und mit diesem Konto an.');
    } else {
      setFailure(result.error ? authErrorMessage(result.error) : 'Anmelden hat nicht geklappt. Versuch es noch einmal.');
    }
  };

  return (
    <Screen maxWidth={520}>
      <PageHeader
        title="Weiteres Konto anmelden"
        subtitle="Dein jetziges Konto bleibt angemeldet. Im Profil wechselst du über „Konto wechseln“ zwischen beiden."
        back={{ label: 'Profil', onPress: back }}
      />
      {params.abgelaufen === '1' && (
        <Notice tone="info">Die Anmeldung dieses Kontos ist abgelaufen – bitte gib das Passwort noch einmal ein.</Notice>
      )}
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
        {failure && <Notice tone="error">{failure}</Notice>}
        <Button label="Anmelden" onPress={submit} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
});
