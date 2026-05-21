import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  ScrollView, ActivityIndicator, KeyboardAvoidingView, 
  Platform, Image, Alert 
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ route, session: directSession }: any) {
  const session = route?.params?.session || directSession;

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false); // Controls View vs Edit UX State
  const [profileFetched, setProfileFetched] = useState(false);

  // Form Fields matching your 'users' table columns
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (session?.user?.id && !profileFetched) {
      getProfile();
    }
  }, [session, profileFetched]);

  async function getProfile() {
    try {
      setLoading(true);
      const { data, error, status } = await supabase
        .from('users')
        .select('username, bio, interests, bank_details, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (error && status !== 406) throw error;

      if (data) {
        setUsername(data.username || '');
        setBio(data.bio || '');
        setInterests(data.interests || '');
        setBankDetails(data.bank_details || '');
        setAvatarUrl(data.avatar_url || '');
        setProfileFetched(true);
      }
    } catch (error: any) {
      Alert.alert('Error loading profile', error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- NEW: NATIVE GALLERY PERMISSION & PICKER ---
  async function pickImage() {
    // Request device permission dynamically
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sizana needs access to your gallery to update your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5, // Compress image to reduce cloud payload weight
    });

    if (!result.canceled && result.assets[0].uri) {
      uploadAvatar(result.assets[0].uri);
    }
  }

async function uploadAvatar(localUri: string) {
  try {
    setUpdating(true);
    console.log("Staging network payload for URI:", localUri);

    const fileExt = localUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${session.user.id}-${Math.floor(Date.now() / 1000)}.${fileExt}`;

    // 1. Convert local asset path to blob binary chunks
    const blob: any = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        resolve(xhr.response);
      };
      xhr.onerror = function (e) {
        console.error("XHR Binary Conversion Failed:", e);
        reject(new TypeError("Local storage device read failed"));
      };
      xhr.responseType = "blob";
      xhr.open("GET", localUri, true);
      xhr.send(null);
    });

    // 2. FIXED: Wrap binary inside a clean FormData multi-part structure 
    // This provides the specific network headers Android needs to send images.
    const formData = new FormData();
    formData.append('file', {
      uri: localUri,
      name: fileName,
      type: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
    } as any);

    console.log("Deploying multi-part binary payload to Supabase Storage container...");

    // 3. Upload using your verified public bucket reference name
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, formData, {
        cacheControl: '3600',
        upsert: true
      });

    if (typeof blob.close === 'function') blob.close(); // Clean hardware memory track
    if (uploadError) throw uploadError;

    // 4. Resolve the clean cloud public url endpoint address link
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    setAvatarUrl(publicUrl);
    Alert.alert('Success', 'Image uploaded to cloud container storage! Click Save to apply changes.');
  } catch (error: any) {
    console.error("Upload Pipeline Error:", error.message);
    Alert.alert('Upload Failed', 'Network or bucket rule restriction: ' + error.message);
  } finally {
    setUpdating(false);
  }
}

  async function updateProfile() {
    try {
      setUpdating(true);
      if (!session?.user?.id) return;

      const updates = {
        id: session.user.id,
        username,
        bio,
        interests,
        bank_details: bankDetails, // Aligned to database underscores
        avatar_url: avatarUrl,
        // REMOVED 'updated_at' to clear schema cache errors
      };

      const { error } = await supabase.from('users').upsert(updates);
      if (error) throw error;
      
      Alert.alert('Success', 'Profile updated successfully!');
      setIsEditing(false); // Return smoothly to clean View state
      setProfileFetched(false); // Force refresh top bar
    } catch (error: any) {
      Alert.alert('Update Error', error.message);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Syncing Profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        
        {/* --- HEADER IMAGE LAYER --- */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={isEditing ? pickImage : undefined} activeOpacity={0.7}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-circle" size={110} color="#CBD5E1" />
            )}
            {isEditing && (
              <View style={styles.avatarOverlay}>
                <Ionicons name="camera" size={24} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.profileName}>{username || 'Sizana Member'}</Text>
          <Text style={styles.profileEmail}>{session?.user?.email}</Text>
        </View>

        {/* --- VIEW STATE VS EDIT STATE UX RENDER --- */}
        {!isEditing ? (
          <View style={styles.infoCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Bio</Text>
              <Text style={styles.detailValue}>{bio || 'No bio description set yet.'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Interests & Focus</Text>
              <Text style={styles.detailValue}>{interests || 'None specified.'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Banking (Settlement Layout)</Text>
              <Text style={[styles.detailValue, styles.bankValue]}>{bankDetails || 'No settlement routing configured.'}</Text>
            </View>

            <TouchableOpacity style={styles.editToggleButton} onPress={() => setIsEditing(true)}>
              <Ionicons name="create" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.editToggleText}>Edit Profile Layout</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Your Name" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Bio Description</Text>
              <TextInput style={[styles.input, styles.textArea]} value={bio} onChangeText={setBio} multiline numberOfLines={3} placeholder="Tell us about your business..." />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Interests & Focus</Text>
              <TextInput style={styles.input} value={interests} onChangeText={setInterests} placeholder="Farming, Tech, Trading" />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Banking Details</Text>
              <TextInput style={[styles.input, styles.bankInput]} value={bankDetails} onChangeText={setBankDetails} placeholder="Bank, Account Number, Branch" />
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setIsEditing(false); getProfile(); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.saveButton, updating && styles.disabledButton]} onPress={updateProfile} disabled={updating}>
                {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.logoutButton} onPress={() => supabase.auth.signOut()}>
          <Ionicons name="log-out" size={18} color="#EF4444" style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>Sign Out Account</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748B', fontWeight: '600' },
  avatarSection: { alignItems: 'center', marginVertical: 15 },
  avatarWrapper: {
    width: 110, height: 110, borderRadius: 35, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    borderWidth: 3, borderColor: '#fff', elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  profileName: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginTop: 12, letterSpacing: -0.5 },
  profileEmail: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 2 },
  infoCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, marginTop: 20, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8 },
  detailRow: { marginBottom: 20 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  detailValue: { fontSize: 15, color: '#334155', fontWeight: '600', lineHeight: 22 },
  bankValue: { color: '#16A34A', backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  editToggleButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  editToggleText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  formSection: { marginTop: 10 },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6, marginLeft: 4 },
  input: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, fontSize: 15, color: '#334155', borderWidth: 1, borderColor: '#E2E8F0', fontWeight: '500' },
  textArea: { height: 80, textAlignVertical: 'top' },
  bankInput: { borderColor: '#BBF7D0', backgroundColor: '#F6FDF9' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  cancelButton: { width: '48%', backgroundColor: '#E2E8F0', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  cancelButtonText: { color: '#475569', fontSize: 15, fontWeight: '700' },
  saveButton: { width: '48%', backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabledButton: { backgroundColor: '#A7F3D0' },
  logoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 32, paddingVertical: 12 },
  logoutText: { color: '#EF4444', fontSize: 14, fontWeight: '700' }
});