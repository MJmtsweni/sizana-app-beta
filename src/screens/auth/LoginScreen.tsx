import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors, radii, spacing, typography } from '../../theme';
import Button from '../../components/ui/Button';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Inline Validation States
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalError, setGeneralError] = useState('');

  const validate = () => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');
    setGeneralError('');

    if (!email) { setEmailError('Email is required'); isValid = false; }
    else if (!/\S+@\S+\.\S+/.test(email)) { setEmailError('Invalid email format'); isValid = false; }

    if (!password) { setPasswordError('Password is required'); isValid = false; }

    return isValid;
  };

  async function signInWithEmail() {
    if (!validate()) return;
    
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) setGeneralError(error.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.innerContainer}>
          <Text style={styles.header}>Welcome Back</Text>
          
          {generalError ? <Text style={styles.errorBanner}>{generalError}</Text> : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput style={[styles.input, emailError && styles.inputError]} placeholder="you@example.com" value={email} onChangeText={(t) => { setEmail(t); setEmailError(''); }} autoCapitalize="none" keyboardType="email-address" />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
          </View>
          
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordContainer, passwordError && styles.inputError]}>
              <TextInput style={styles.passwordInput} placeholder="••••••••" value={password} onChangeText={(t) => { setPassword(t); setPasswordError(''); }} secureTextEntry={!showPassword} />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon} accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          <Button label="Sign In" onPress={signInWithEmail} loading={loading} fullWidth size="lg" style={styles.button} />
          <TouchableOpacity
  style={styles.forgotPasswordButton} 
  onPress={() => navigation.navigate('ForgotPassword')}
>
  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
</TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('SignUp')} style={styles.footerLink}>
            <Text style={styles.linkText}>Don't have an account? <Text style={styles.boldLink}>Sign Up</Text></Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  innerContainer: { flex: 1, justifyContent: 'center', padding: spacing.xxl },
  header: { ...typography.display, marginBottom: spacing.huge, textAlign: 'center', color: colors.brand },
  formGroup: { marginBottom: spacing.lg },
  label: { ...typography.bodyMedium, color: colors.slate[600], marginBottom: spacing.sm, marginLeft: spacing.xs },
  input: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, borderRadius: radii.md, fontSize: 16, fontFamily: typography.bodyLarge.fontFamily, color: colors.textPrimary },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 12, marginTop: spacing.xs, marginLeft: spacing.xs },
  errorBanner: { ...typography.bodyMedium, color: colors.danger, textAlign: 'center', marginBottom: spacing.lg },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  passwordInput: { flex: 1, padding: spacing.lg, fontSize: 16, fontFamily: typography.bodyLarge.fontFamily, color: colors.textPrimary },
  eyeIcon: { padding: spacing.lg },
  button: { marginTop: spacing.sm },
  footerLink: { textAlign: 'center', marginTop: spacing.xxl },
  forgotPasswordButton: { alignItems: 'center', marginTop: spacing.md },
  forgotPasswordText: { ...typography.body, color: colors.textSecondary },
  linkText: { ...typography.body, color: colors.textSecondary },
  boldLink: { color: colors.brand, fontFamily: typography.bodyMedium.fontFamily }
});