import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInputInstance,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { TextField } from './text-field';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Errors = { email?: string; password?: string };

/**
 * Anmeldeformular. Noch ohne Backend: Die Eingaben werden geprüft, die
 * eigentliche Anmeldung wird im nächsten Schritt an Supabase angebunden.
 */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const toggleHover = useHover();
  const forgotHover = useHover();
  const buttonHover = useHover();

  const submit = () => {
    const next: Errors = {};
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Bitte gib eine gültige E-Mail-Adresse ein.';
    if (password.length === 0) next.password = 'Bitte gib dein Passwort ein.';
    setErrors(next);
    setNotice(null);
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    // Platzhalter, bis die Anmeldung mit Supabase verbunden ist
    setTimeout(() => {
      setLoading(false);
      setNotice('Die Anmeldung wird im nächsten Schritt mit dem Server verbunden.');
    }, 700);
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

      <TextField
        ref={passwordRef}
        label="Passwort"
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        placeholder="••••••••"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        trailing={
          <Pressable
            onPress={() => setShowPassword((s) => !s)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            {...toggleHover.hoverProps}>
            <Text style={[styles.inlineAction, toggleHover.hovered && styles.linkHover]}>
              {showPassword ? 'Verbergen' : 'Anzeigen'}
            </Text>
          </Pressable>
        }
      />

      <View style={styles.forgotRow}>
        <Pressable
          onPress={() => setNotice('„Passwort vergessen“ folgt zusammen mit der Server-Anbindung.')}
          accessibilityRole="link"
          {...forgotHover.hoverProps}>
          <Text style={[styles.link, forgotHover.hovered && styles.linkHover]}>Passwort vergessen?</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={submit}
        disabled={loading}
        accessibilityRole="button"
        {...buttonHover.hoverProps}
        style={({ pressed }) => [
          styles.primaryButton,
          buttonHover.hovered && styles.primaryButtonHover,
          pressed && styles.primaryButtonPressed,
        ]}>
        {loading ? (
          <ActivityIndicator color={Colors.buttonPrimaryText} />
        ) : (
          <Text style={styles.primaryButtonText}>Anmelden</Text>
        )}
      </Pressable>

      {notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.lg },
  forgotRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: -Spacing.xs },
  link: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  linkHover: { color: Colors.text },
  inlineAction: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', paddingLeft: Spacing.md },
  primaryButton: {
    height: 52,
    borderRadius: Radius.md,
    backgroundColor: Colors.buttonPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  primaryButtonHover: { opacity: 0.92 },
  primaryButtonPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: Colors.buttonPrimaryText, fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  notice: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
  },
  noticeText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
