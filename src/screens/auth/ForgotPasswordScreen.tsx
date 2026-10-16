import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform 
} from 'react-native';
import { supabase } from '../../lib/supabase';

import { colors, fontFamily } from '../../theme';
export default function ForgotPasswordScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleResetPassword() {
    if (!email) {
      Alert.alert("Error", "Please enter your email address.");
      return;
    }

    setLoading(true);
    // Note: redirectTo should match your deep link configuration if using universal links
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'sizana://auth/callback', 
    });

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Success", "Password reset instructions sent to your email!");
      navigation.goBack();
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.innerContainer}>
        <Text style={styles.header}>Reset Password</Text>
        <Text style={styles.subtitle}>Enter your email to receive reset instructions.</Text>

        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity style={styles.button} onPress={handleResetPassword} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Send Reset Link</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  innerContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { fontSize: 28, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 16, color: colors.textSecondary, marginBottom: 32, textAlign: 'center' },
  label: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.slate[600], marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 12, fontFamily: fontFamily.regular, fontSize: 16, marginBottom: 20 },
  button: { backgroundColor: colors.brand, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },
  backButton: { marginTop: 24, alignItems: 'center' },
  backButtonText: { color: colors.textSecondary, fontFamily: fontFamily.semibold }
});