import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { pickAndUploadImage } from '../../lib/imageUpload';
import { BUSINESS_CATEGORIES } from '../../lib/businessCategories';
import { ModalSheet, CategoryPicker } from '../../components/ui';
import { colors, radii, spacing, typography, fontFamily } from '../../theme';

export default function EditBusinessModal({ visible, onClose, business, onUpdate }: any) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: business.name,
    category: business.category,
    description: business.description,
    location: business.location,
    contact_phone: business.contact_phone,
    whatsapp_number: business.whatsapp_number,
    contact_email: business.contact_email,
    website_url: business.website_url,
  });

  const uploadImage = async (type: 'logo' | 'cover') => {
    setLoading(true);
    try {
      const publicUrl = await pickAndUploadImage(
        { aspect: type === 'logo' ? [1, 1] : [16, 9] },
        { fileNamePrefix: `${type}-${business.id}`, maxDimension: type === 'logo' ? 800 : 1600 }
      );
      if (!publicUrl) return;

      const { error: dbError } = await supabase
        .from('businesses')
        .update({ [type === 'logo' ? 'logo_url' : 'cover_photo_url']: publicUrl })
        .eq('id', business.id);

      if (dbError) throw dbError;

      onUpdate();
      Alert.alert("Success", `${type === 'logo' ? 'Logo' : 'Cover'} updated!`);
    } catch (e: any) {
      Alert.alert("Upload Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- VALIDATION LOGIC ---
  const validateForm = () => {
    if (!formData.name || !formData.location) {
      Alert.alert('Missing Info', 'Business name and location are required.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[0-9]{9,15}$/;

    if (formData.contact_email && !emailRegex.test(formData.contact_email)) {
      Alert.alert("Invalid Email", "Please enter a valid business email address.");
      return false;
    }

    if (formData.whatsapp_number && !phoneRegex.test(formData.whatsapp_number.replace(/\s/g, ''))) {
      Alert.alert("Invalid WhatsApp", "Please enter a valid WhatsApp number (e.g. 0821234567).");
      return false;
    }

    if (formData.contact_phone && !phoneRegex.test(formData.contact_phone.replace(/\s/g, ''))) {
      Alert.alert("Invalid Phone", "Please enter a valid phone number.");
      return false;
    }

    return true;
  };

  const handleUpdate = async () => {
    if (!validateForm()) return; // Stop execution if validation fails

    setLoading(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update(formData)
        .eq('id', business.id);

      if (error) throw error;
      onUpdate();
      onClose();
      Alert.alert("Success", "Business updated!");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalSheet visible={visible} onClose={onClose} title="Edit Business">
      <View style={styles.brandingSection}>
        <TouchableOpacity style={styles.uploadBtn} onPress={() => uploadImage('logo')}>
          <Text style={styles.uploadBtnText}>Update Logo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.uploadBtn} onPress={() => uploadImage('cover')}>
          <Text style={styles.uploadBtnText}>Update Cover</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Business Name</Text>
      <TextInput style={styles.input} value={formData.name} onChangeText={(t) => setFormData({...formData, name: t})} />

      <Text style={styles.label}>Category</Text>
      <CategoryPicker
        categories={BUSINESS_CATEGORIES}
        selected={formData.category}
        onSelect={(cat) => setFormData({...formData, category: cat})}
        style={{ paddingHorizontal: 0 }}
      />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={formData.location} onChangeText={(t) => setFormData({...formData, location: t})} />

      <Text style={styles.label}>Description</Text>
      <TextInput style={[styles.input, {height: 80, textAlignVertical: 'top'}]} multiline value={formData.description} onChangeText={(t) => setFormData({...formData, description: t})} />

      <Text style={styles.label}>Contact Phone</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" value={formData.contact_phone} onChangeText={(t) => setFormData({...formData, contact_phone: t})} />

      <Text style={styles.label}>WhatsApp Number</Text>
      <TextInput style={styles.input} keyboardType="phone-pad" value={formData.whatsapp_number} onChangeText={(t) => setFormData({...formData, whatsapp_number: t})} />

      <Text style={styles.label}>Contact Email</Text>
      <TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" value={formData.contact_email} onChangeText={(t) => setFormData({...formData, contact_email: t})} />

      <Text style={styles.label}>Website URL</Text>
      <TextInput style={styles.input} keyboardType="url" autoCapitalize="none" value={formData.website_url} onChangeText={(t) => setFormData({...formData, website_url: t})} />

      <TouchableOpacity style={styles.saveButton} onPress={handleUpdate} disabled={loading}>
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
      </TouchableOpacity>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.bodyMedium, color: colors.slate[700], marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.md,
    fontFamily: fontFamily.regular, fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundMuted,
  },
  brandingSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  uploadBtn: { backgroundColor: colors.backgroundMuted, padding: spacing.md + 2, borderRadius: radii.md, flex: 0.48, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  uploadBtnText: { ...typography.bodyMedium, color: colors.textPrimary },
  saveButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  saveButtonText: { color: colors.white, fontSize: 16, fontFamily: fontFamily.bold },
});
