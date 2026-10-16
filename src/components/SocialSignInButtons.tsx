import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, radii, spacing, typography } from '../theme';
import Button from './ui/Button';
import {
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
  SocialSignInResult,
} from '../lib/socialAuth';

type Props = {
  // "Sign in" on the login screen, "Sign up" on the sign-up screen — Apple's
  // button has matching built-in labels, so both buttons stay consistent.
  mode: 'signIn' | 'signUp';
};

// "or" divider + Continue with Google (Android & iOS) + Sign in with Apple
// (iOS only). On success the Supabase session listener in App.tsx swaps the
// navigator over, so there's nothing to navigate to from here.
export default function SocialSignInButtons({ mode }: Props) {
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function run(provider: 'google' | 'apple', fn: () => Promise<SocialSignInResult>) {
    if (busy) return;
    setBusy(provider);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert(
        provider === 'google' ? 'Google sign-in failed' : 'Apple sign-in failed',
        e?.message || 'Please try again.'
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Button
        label={mode === 'signIn' ? 'Continue with Google' : 'Sign up with Google'}
        icon="logo-google"
        variant="outline"
        size="lg"
        fullWidth
        loading={busy === 'google'}
        disabled={busy !== null}
        onPress={() => run('google', signInWithGoogle)}
      />

      {appleAvailable && (
        // Apple's own button — Human Interface Guidelines require their
        // styling for Sign in with Apple, so it isn't re-skinned to match.
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            mode === 'signIn'
              ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.md}
          style={styles.appleButton}
          onPress={() => run('apple', signInWithApple)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.xl },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dividerText: { ...typography.body, color: colors.textSecondary, marginHorizontal: spacing.md },
  appleButton: { width: '100%', height: 56, marginTop: spacing.md },
});
