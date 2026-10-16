import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, 
  ScrollView, LayoutAnimation, Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '../../theme';
import { haptics } from '../../lib/haptics';
import { compressImage } from '../../lib/mediaCompression';
import { INTEREST_CATEGORIES, SA_REGIONS } from '../../lib/profileOptions';
import SocialSignInButtons from '../../components/SocialSignInButtons';

export default function SignUpScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  
  // Wizard State
  const [step, setStep] = useState(1);
  
  // Form State
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const nextStep = () => {
    if (step === 1 && (!username || !email || !password)) {
      Alert.alert("Missing Info", "Please fill out all account details.");
      return;
    }
    if (step === 2 && selectedRegions.length === 0) {
      Alert.alert("Select Region", "Please select at least one region.");
      return;
    }
    haptics.tap();
    animateLayout();
    setStep(step + 1);
  };

  const prevStep = () => {
    haptics.tap();
    animateLayout();
    setStep(step - 1);
  };

  const toggleRegion = (city: string) => {
    haptics.selection();
    animateLayout();
    if (selectedRegions.includes(city)) {
      setSelectedRegions(prev => prev.filter(r => r !== city));
    } else {
      if (selectedRegions.length >= 3) {
        Alert.alert("Limit Reached", "You can only select up to 3 regions. Please tap an active region to remove it first.");
        return;
      }
      setSelectedRegions(prev => [...prev, city]);
    }
  };

  const toggleInterest = (topic: string) => {
    haptics.selection();
    animateLayout();
    if (selectedInterests.includes(topic)) {
      setSelectedInterests(prev => prev.filter(t => t !== topic));
    } else {
      setSelectedInterests(prev => [...prev, topic]);
    }
  };

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });
    if (!result.canceled && result.assets[0].uri) {
      setAvatarUri(result.assets[0].uri);
    }
  }

  async function handleSignUp() {
    if (selectedInterests.length === 0) {
      Alert.alert("Almost there!", "Please select at least one interest to personalize your feed.");
      return;
    }

    setLoading(true);
    
    try {
      // 1. Create the Auth Account & pass arrays to user_metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            username: username,
            regions: selectedRegions,
            interests: selectedInterests,
          }
        }
      });

      if (authError) throw authError;

      // 2. If a session is returned and an avatar was picked, upload it instantly
      if (authData.session && avatarUri) {
        const compressed = await compressImage(avatarUri, { maxDimension: 800 });
        const fileExt = 'jpg';
        const fileName = `${authData.user?.id}-${Date.now()}.${fileExt}`;

        const formData = new FormData();
        formData.append('file', { uri: compressed.uri, name: fileName, type: `image/${fileExt}` } as any);
        
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, formData);
        
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
          // Update the user record with the new avatar
          await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', authData.user?.id);
        }
      }

      Alert.alert("Welcome to Sizana!", "Your account has been created successfully.");
      navigation.navigate('Login');

    } catch (e: any) {
      Alert.alert("Sign Up Failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  // --- STEP RENDERERS ---
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.header}>Create Account</Text>
      <Text style={styles.subtitle}>Set up your digital identity.</Text>

      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={32} color="#94A3B8" />
            </View>
          )}
          <View style={styles.avatarBadge}>
            <Ionicons name="add" size={16} color="#fff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarText}>Add Profile Photo</Text>
      </View>

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. ThaboM"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <Text style={styles.label}>Email Address</Text>
      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="Create a secure password"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        secureTextEntry
      />

      <TouchableOpacity style={styles.primaryButton} onPress={nextStep}>
        <Text style={styles.primaryButtonText}>Continue</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
      </TouchableOpacity>

      {/* Social sign-ups skip steps 2-3 here; CompleteProfileScreen collects
          regions and interests right after the account is created. */}
      <SocialSignInButtons mode="signUp" />

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Login')}>
          <Text style={styles.loginLink}>Log in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity style={styles.backNav} onPress={prevStep}>
        <Ionicons name="arrow-back" size={24} color="#1E293B" />
      </TouchableOpacity>
      <Text style={styles.header}>Your Locations</Text>
      <Text style={styles.subtitle}>Select up to 3 regions to customize your marketplace and events.</Text>

      <View style={styles.selectionCountRow}>
        <Text style={styles.selectionCountText}>{selectedRegions.length} / 3 Selected</Text>
      </View>

      {Object.entries(SA_REGIONS).map(([province, cities]) => (
        <View key={province} style={{ marginBottom: 20 }}>
          <Text style={styles.provinceHeader}>{province}</Text>
          <View style={styles.pillContainer}>
            {cities.map((city) => {
              const isActive = selectedRegions.includes(city);
              return (
                <TouchableOpacity 
                  key={city} 
                  style={[styles.pill, isActive && styles.pillActive]}
                  onPress={() => toggleRegion(city)}
                >
                  <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{city}</Text>
                  {isActive && <Ionicons name="close" size={14} color="#fff" style={{ marginLeft: 6 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.primaryButton} onPress={nextStep}>
        <Text style={styles.primaryButtonText}>Next</Text>
        <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <TouchableOpacity style={styles.backNav} onPress={prevStep}>
        <Ionicons name="arrow-back" size={24} color="#1E293B" />
      </TouchableOpacity>
      <Text style={styles.header}>Your Interests</Text>
      <Text style={styles.subtitle}>What do you want to see in your forums and feed?</Text>

      <View style={[styles.pillContainer, { marginBottom: 30 }]}>
        {INTEREST_CATEGORIES.map((topic) => {
          const isActive = selectedInterests.includes(topic);
          return (
            <TouchableOpacity 
              key={topic} 
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => toggleInterest(topic)}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{topic}</Text>
              {isActive && <Ionicons name="checkmark" size={14} color="#fff" style={{ marginLeft: 6 }} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : (
          <>
            <Text style={styles.primaryButtonText}>Complete Sign Up</Text>
            <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      {/* Progress Dots */}
      <View style={[styles.progressDock, { top: Math.max(insets.top, 20) }]}>
        {[1, 2, 3].map(i => (
          <View key={i} style={[styles.progressDot, step >= i && styles.progressDotActive]} />
        ))}
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top + 40 }]} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.innerContainer}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContainer: { flexGrow: 1, paddingBottom: 40 },
  innerContainer: { flex: 1, padding: 24, paddingTop: 20 },

  progressDock: { flexDirection: 'row', justifyContent: 'center', position: 'absolute', left: 0, right: 0, zIndex: 10 },
  progressDot: { width: 30, height: 4, borderRadius: 2, backgroundColor: colors.border, marginHorizontal: 4 },
  progressDotActive: { backgroundColor: colors.brand },

  stepContainer: { flex: 1 },
  backNav: { marginBottom: 16, alignSelf: 'flex-start', padding: 4 },
  header: { fontSize: 28, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: 24, lineHeight: 22 },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrapper: { position: 'relative' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.slate[100], borderWidth: 2, borderStyle: 'dashed', borderColor: colors.borderStrong, justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 100, height: 100, borderRadius: 50 },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white },
  avatarText: { fontSize: 13, fontFamily: fontFamily.semibold, color: colors.textSecondary, marginTop: 10 },

  label: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.slate[600], marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 12, fontSize: 15, fontFamily: fontFamily.regular, color: colors.textPrimary, marginBottom: 20 },

  primaryButton: { flexDirection: 'row', backgroundColor: colors.brand, padding: 16, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 12, shadowColor: colors.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },

  footerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 32 },
  footerText: { color: colors.textSecondary, fontSize: 14, fontFamily: fontFamily.medium },
  loginLink: { color: colors.brand, fontSize: 14, fontFamily: fontFamily.bold },

  selectionCountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.slate[100] },
  selectionCountText: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.accent },
  provinceHeader: { fontSize: 14, fontFamily: fontFamily.extrabold, color: colors.textPrimary, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },

  pillContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate[100], paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillText: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.slate[600] },
  pillTextActive: { color: colors.white }
});