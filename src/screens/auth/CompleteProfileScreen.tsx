import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { haptics } from '../../lib/haptics';
import { signOutOfSocialProviders } from '../../lib/socialAuth';
import { INTEREST_CATEGORIES, MAX_REGIONS, SA_REGIONS } from '../../lib/profileOptions';
import { colors, fontFamily } from '../../theme';
import Button from '../../components/ui/Button';

type Props = {
  session: Session;
  initialUsername: string;
  onComplete: () => void;
};

// Shown once after a Google/Apple sign-up. Email sign-up collects username,
// regions, and interests in its wizard before the account exists; social
// sign-in creates the account first (with a username generated from the
// provider's name/email — see migration 20261016000000_social_sign_in.sql),
// so the same details are collected here instead.
export default function CompleteProfileScreen({ session, initialUsername, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(initialUsername);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleRegion = (city: string) => {
    haptics.selection();
    if (selectedRegions.includes(city)) {
      setSelectedRegions(prev => prev.filter(r => r !== city));
    } else if (selectedRegions.length >= MAX_REGIONS) {
      Alert.alert("Limit Reached", `You can only select up to ${MAX_REGIONS} regions. Tap an active region to remove it first.`);
    } else {
      setSelectedRegions(prev => [...prev, city]);
    }
  };

  const toggleInterest = (topic: string) => {
    haptics.selection();
    setSelectedInterests(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    );
  };

  async function handleSave() {
    if (!username.trim()) {
      Alert.alert("Missing Info", "Please choose a username.");
      return;
    }
    if (selectedRegions.length === 0) {
      Alert.alert("Select Region", "Please select at least one region.");
      return;
    }
    if (selectedInterests.length === 0) {
      Alert.alert("Almost there!", "Please select at least one interest to personalize your feed.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('users')
      .update({
        username: username.trim(),
        regions: selectedRegions,
        interests: selectedInterests,
      })
      .eq('id', session.user.id);
    setSaving(false);

    if (error) {
      Alert.alert("Couldn't save profile", error.message);
      return;
    }
    haptics.success();
    onComplete();
  }

  async function handleSignOut() {
    await signOutOfSocialProviders();
    await supabase.auth.signOut();
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.header}>Finish Setting Up</Text>
        <Text style={styles.subtitle}>A few details to personalize your marketplace, events, and forums.</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. ThaboM"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>Your Locations</Text>
          <Text style={styles.selectionCountText}>{selectedRegions.length} / {MAX_REGIONS}</Text>
        </View>
        {Object.entries(SA_REGIONS).map(([province, cities]) => (
          <View key={province} style={{ marginBottom: 16 }}>
            <Text style={styles.provinceHeader}>{province}</Text>
            <View style={styles.pillContainer}>
              {cities.map((city) => {
                const isActive = selectedRegions.includes(city);
                return (
                  <TouchableOpacity key={city} style={[styles.pill, isActive && styles.pillActive]} onPress={() => toggleRegion(city)}>
                    <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{city}</Text>
                    {isActive && <Ionicons name="close" size={14} color={colors.white} style={{ marginLeft: 6 }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[styles.sectionHeader, { marginTop: 8, marginBottom: 12 }]}>Your Interests</Text>
        <View style={[styles.pillContainer, { marginBottom: 24 }]}>
          {INTEREST_CATEGORIES.map((topic) => {
            const isActive = selectedInterests.includes(topic);
            return (
              <TouchableOpacity key={topic} style={[styles.pill, isActive && styles.pillActive]} onPress={() => toggleInterest(topic)}>
                <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{topic}</Text>
                {isActive && <Ionicons name="checkmark" size={14} color={colors.white} style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <Button label="Continue to Sizana" onPress={handleSave} loading={saving} fullWidth size="lg" />

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutLink}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 24 },

  header: { fontSize: 28, fontFamily: fontFamily.extrabold, color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: 24, lineHeight: 22 },

  label: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.slate[600], marginBottom: 8, marginLeft: 4 },
  input: { backgroundColor: colors.backgroundMuted, borderWidth: 1, borderColor: colors.border, padding: 16, borderRadius: 12, fontSize: 15, fontFamily: fontFamily.regular, color: colors.textPrimary, marginBottom: 24 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionHeader: { fontSize: 18, fontFamily: fontFamily.extrabold, color: colors.textPrimary },
  selectionCountText: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.brand },
  provinceHeader: { fontSize: 14, fontFamily: fontFamily.extrabold, color: colors.textPrimary, textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 },

  pillContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.slate[100], paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginRight: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { fontSize: 14, fontFamily: fontFamily.semibold, color: colors.slate[600] },
  pillTextActive: { color: colors.white },

  signOutLink: { alignItems: 'center', marginTop: 20 },
  signOutText: { fontSize: 14, fontFamily: fontFamily.medium, color: colors.textSecondary },
});
