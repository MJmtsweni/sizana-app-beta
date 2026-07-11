import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

export default function EditBusinessModal({ visible, onClose, business, onUpdate }: any) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: business.name,
    description: business.description,
    location: business.location,
    contact_phone: business.contact_phone,
    whatsapp_number: business.whatsapp_number,
    contact_email: business.contact_email,
    website_url: business.website_url,
  });

  const uploadImage = async (type: 'logo' | 'cover') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: type === 'logo' ? [1, 1] : [16, 9],
      quality: 0.7,
    });

    if (result.canceled || !result.assets[0].uri) return;

    setLoading(true);
    try {
      const uri = result.assets[0].uri;
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${type}-${business.id}-${Date.now()}.${fileExt}`;
      
      // CRITICAL FIX: Use FormData instead of fetch().blob() to prevent 0-byte uploads
      const formData = new FormData();
      formData.append('file', { 
        uri: uri, 
        name: fileName, 
        type: `image/${fileExt === 'png' ? 'png' : 'jpeg'}` 
      } as any);
      
      const { error: uploadError } = await supabase.storage
        .from('Listings')
        .upload(fileName, formData);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('Listings').getPublicUrl(fileName);
      
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
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Business</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close-circle" size={28} color="#64748B" /></TouchableOpacity>
          </View>
          
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Branding Upload Section */}
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
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end' 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    padding: 24, 
    maxHeight: '90%' 
  },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 20 
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  label: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 8, marginTop: 12 },
  input: { 
    borderWidth: 1, 
    borderColor: '#E2E8F0', 
    borderRadius: 12, 
    padding: 12, 
    fontSize: 15, 
    color: '#1E293B',
    backgroundColor: '#F8FAFC'
  },
  brandingSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  uploadBtn: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, flex: 0.48, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  uploadBtnText: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  saveButton: { 
    backgroundColor: '#34C759', 
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginTop: 24 
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});