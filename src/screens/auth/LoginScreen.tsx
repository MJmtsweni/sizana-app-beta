import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform, 
  TouchableWithoutFeedback, Keyboard 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

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
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          <TouchableOpacity style={styles.button} onPress={signInWithEmail} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: '#fff' },
  innerContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  header: { fontSize: 32, fontWeight: '800', marginBottom: 40, textAlign: 'center', color: '#34C759' },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 16, borderRadius: 12, fontSize: 16 },
  inputError: { borderColor: '#EF4444' },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 4, marginLeft: 4 },
  errorBanner: { color: '#EF4444', textAlign: 'center', marginBottom: 16, fontWeight: '600' },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12 },
  passwordInput: { flex: 1, padding: 16, fontSize: 16, color: '#1E293B' },
  eyeIcon: { padding: 16 },
  button: { backgroundColor: '#34C759', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footerLink: { textAlign: 'center', marginTop: 24 },
  forgotPasswordButton: { alignItems: 'center', marginTop: 12 },
  forgotPasswordText: { color: '#64748B', fontSize: 15 },
  linkText: { color: '#64748B', fontSize: 15 },
  boldLink: { color: '#34C759', fontWeight: '700' }
});