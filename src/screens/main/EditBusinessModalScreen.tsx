import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

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

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('businesses')
        .update(formData)
        .eq('id', business.id);

      if (error) throw error;
      onUpdate(); // Trigger a refresh in the parent screen
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
          
          <ScrollView>
            <Text style={styles.label}>Business Name</Text>
            <TextInput style={styles.input} value={formData.name} onChangeText={(t) => setFormData({...formData, name: t})} />
            
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, {height: 80}]} multiline value={formData.description} onChangeText={(t) => setFormData({...formData, description: t})} />
            
            <Text style={styles.label}>Location</Text>
            <TextInput style={styles.input} value={formData.location} onChangeText={(t) => setFormData({...formData, location: t})} />

            <Text style={styles.label}>Contact Phone</Text>
            <TextInput style={styles.input} keyboardType="phone-pad" value={formData.contact_phone} onChangeText={(t) => setFormData({...formData, contact_phone: t})} />

            <TouchableOpacity style={styles.saveButton} onPress={handleUpdate} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
            </TouchableOpacity>
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
    color: '#1E293B' 
  },
  saveButton: { 
    backgroundColor: '#34C759', 
    paddingVertical: 16, 
    borderRadius: 16, 
    alignItems: 'center', 
    marginTop: 24 
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});