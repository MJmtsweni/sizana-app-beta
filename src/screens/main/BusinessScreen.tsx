import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, ActivityIndicator, Platform, Alert, ScrollView, Modal, KeyboardAvoidingView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import * as ImagePicker from 'expo-image-picker';

export default function BusinessScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  const [businesses, setBusinesses] = useState<any[]>([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const categories = ['All', 'Agriculture', 'Technology', 'Retail', 'Services', 'Food & Dining'];

  const [modalVisible, setModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newBiz, setNewBiz] = useState({
    name: '', category: 'Services', description: '', location: '',
    contact_email: '', contact_phone: '', whatsapp_number: '', operating_hours: '', logoUri: null as string | null
  });

  // Gallery State
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [galleryImageUri, setGalleryImageUri] = useState<string | null>(null);
  const [galleryLabel, setGalleryLabel] = useState('');
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useFocusEffect(
    useCallback(() => { fetchBusinesses(); }, [])
  );

  React.useEffect(() => { applyFilters(); }, [searchQuery, activeCategory, businesses]);

  async function fetchBusinesses() {
    try {
      if (!refreshing) setLoading(true);
      const { data, error } = await supabase
        .from('businesses')
        .select('*, gallery:business_gallery(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setBusinesses(data);
        setFilteredBusinesses(data);
      }
    } catch (e: any) {
      console.error("Directory fetch error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const applyFilters = () => {
    let result = [...businesses];
    if (activeCategory !== 'All') result = result.filter(b => b.category === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => b.name.toLowerCase().includes(q) || b.location.toLowerCase().includes(q));
    }
    setFilteredBusinesses(result);
  };

  const handleOpenLink = async (url: string) => {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  };

  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    handleOpenLink(`whatsapp://send?phone=${cleanPhone}`);
  };

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (!result.canceled && result.assets[0].uri) setNewBiz({ ...newBiz, logoUri: result.assets[0].uri });
  }

  async function handleRegisterBusiness() {
    if (!newBiz.name || !newBiz.location) {
      Alert.alert('Missing Info', 'Business name and location are required.');
      return;
    }
    try {
      setUploading(true);
      let finalLogoUrl = null;

      if (newBiz.logoUri) {
        const fileExt = newBiz.logoUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `biz-${Date.now()}.${fileExt}`;
        const formData = new FormData();
        formData.append('file', { uri: newBiz.logoUri, name: fileName, type: `image/${fileExt}` } as any);
        const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('Listings').getPublicUrl(fileName);
        finalLogoUrl = data.publicUrl;
      }

      const { data: insertedBiz, error } = await supabase.from('businesses').insert({
        creator_id: session.user.id, name: newBiz.name, category: newBiz.category,
        description: newBiz.description, location: newBiz.location, contact_email: newBiz.contact_email,
        contact_phone: newBiz.contact_phone, whatsapp_number: newBiz.whatsapp_number,
        operating_hours: newBiz.operating_hours, logo_url: finalLogoUrl
      }).select().single();

      if (error) throw error;

      if (insertedBiz) {
        await supabase.from('business_roles').insert({ business_id: insertedBiz.id, user_id: session.user.id, role: 'owner' });
      }

      setModalVisible(false);
      fetchBusinesses();
      setNewBiz({ name: '', category: 'Services', description: '', location: '', contact_email: '', contact_phone: '', whatsapp_number: '', operating_hours: '', logoUri: null });
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  // GALLERY UPLOAD FUNCTION
  async function handleAddGalleryItem() {
    if (!galleryImageUri || !activeBusinessId) return;
    try {
      setUploadingGallery(true);
      const fileExt = galleryImageUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `gallery-${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append('file', { uri: galleryImageUri, name: fileName, type: `image/${fileExt}` } as any);
      
      const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
      if (uploadError) throw uploadError;
      
      const { data } = supabase.storage.from('Listings').getPublicUrl(fileName);
      
      await supabase.from('business_gallery').insert({
        business_id: activeBusinessId, media_url: data.publicUrl, label: galleryLabel
      });

      setGalleryModalVisible(false);
      setGalleryImageUri(null);
      setGalleryLabel('');
      fetchBusinesses(); 
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    } finally {
      setUploadingGallery(false);
    }
  }

  // DELETE FUNCTION
  const handleDeleteBusiness = (bizId: string) => {
    Alert.alert("Delete Business", "Are you sure? This will remove the listing and its gallery permanently.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          await supabase.from('businesses').delete().eq('id', bizId);
          fetchBusinesses();
      }}
    ]);
  };

  const renderBusinessCard = ({ item }: { item: any }) => (
    <View style={styles.bizCard}>
      <View style={styles.cardHeader}>
        {item.logo_url ? (
          <Image source={{ uri: item.logo_url }} style={styles.bizLogo} />
        ) : (
          <View style={[styles.bizLogo, styles.logoPlaceholder]}>
            <Ionicons name="briefcase" size={24} color="#94A3B8" />
          </View>
        )}
        <View style={styles.headerTextContainer}>
          <Text style={styles.categoryBadge}>{item.category}</Text>
          <Text style={styles.bizName}>{item.name}</Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={14} color="#64748B" />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
        </View>

        {/* OWNER ACTIONS MENU */}
        {session?.user?.id === item.creator_id && (
          <TouchableOpacity 
            style={{ padding: 4 }} 
            onPress={() => {
              Alert.alert("Manage Business", "What would you like to do?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete Listing", style: "destructive", onPress: () => handleDeleteBusiness(item.id) }
                // Note: Edit Screen can be added here as a separate navigation route later
              ]);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.descriptionText}>{item.description}</Text>
        {item.operating_hours && (
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#34C759" />
            <Text style={styles.detailText}><Text style={styles.boldText}>Hours:</Text> {item.operating_hours}</Text>
          </View>
        )}
      </View>

      {/* GALLERY SHOWCASE */}
      {item.gallery && item.gallery.length > 0 && (
        <View style={{ paddingBottom: 16 }}>
          <Text style={{ paddingHorizontal: 16, fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' }}>Products & Portfolio</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {item.gallery.map((media: any) => (
              <View key={media.id} style={{ marginRight: 12, width: 120 }}>
                <Image source={{ uri: media.media_url }} style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#F1F5F9' }} />
                {media.label && (
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E293B', marginTop: 6 }} numberOfLines={1}>{media.label}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ADD TO GALLERY BUTTON */}
      {session?.user?.id === item.creator_id && (
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4', marginHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginBottom: 16, borderWidth: 1, borderColor: '#DCFCE7' }}
          onPress={() => { setActiveBusinessId(item.id); setGalleryModalVisible(true); }}
        >
          <Ionicons name="camera" size={16} color="#34C759" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#34C759', marginLeft: 6 }}>Add to Portfolio</Text>
        </TouchableOpacity>
      )}

      <View style={styles.contactActionBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {item.contact_phone && (
            <TouchableOpacity style={styles.iconButton} onPress={() => handleOpenLink(`tel:${item.contact_phone}`)}>
              <Ionicons name="call" size={18} color="#475569" />
            </TouchableOpacity>
          )}
          {item.whatsapp_number && (
            <TouchableOpacity style={styles.iconButton} onPress={() => handleWhatsApp(item.whatsapp_number)}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          )}
          {item.contact_email && (
            <TouchableOpacity style={styles.iconButton} onPress={() => handleOpenLink(`mailto:${item.contact_email}`)}>
              <Ionicons name="mail" size={18} color="#475569" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {session?.user?.id !== item.creator_id && (
        <View style={styles.cardFooter}>
          <TouchableOpacity 
            style={styles.messageButton}
            onPress={() => navigation.navigate('Chat', { recipientId: item.creator_id, recipientName: item.name, session: session })}
          >
            <Ionicons name="chatbubbles" size={20} color="#fff" />
            <Text style={styles.messageButtonText}>Chat with Business</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.topPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.navTitle}>Local Directory</Text>
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.navIconButton}>
            <Ionicons name="add-circle" size={28} color="#34C759" />
          </TouchableOpacity>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
          <TextInput style={styles.searchInput} placeholder="Search businesses..." value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {categories.map(cat => (
            <TouchableOpacity key={cat} style={[styles.categoryPill, activeCategory === cat && styles.categoryPillActive]} onPress={() => setActiveCategory(cat)}>
              <Text style={[styles.categoryPillText, activeCategory === cat && styles.categoryPillTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={filteredBusinesses}
          keyExtractor={(item) => item.id}
          renderItem={renderBusinessCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={() => { setRefreshing(true); fetchBusinesses(); }}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="briefcase-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No businesses found.</Text>
            </View>
          }
        />
      )}

      {/* REGISTRATION MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Business</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={28} color="#64748B" /></TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.imagePickerRow}>
                <TouchableOpacity style={styles.imageSelector} onPress={pickImage}>
                  {newBiz.logoUri ? <Image source={{ uri: newBiz.logoUri }} style={styles.selectedLogo} /> : <><Ionicons name="image-outline" size={28} color="#94A3B8" /><Text style={styles.imagePlaceholderText}>Upload Logo</Text></>}
                </TouchableOpacity>
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <Text style={styles.inputLabel}>Business Name</Text>
                  <TextInput style={styles.inputField} placeholder="Company Name" value={newBiz.name} onChangeText={t => setNewBiz({...newBiz, name: t})} />
                </View>
              </View>
              <Text style={styles.inputLabel}>About</Text>
              <TextInput style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]} multiline value={newBiz.description} onChangeText={t => setNewBiz({...newBiz, description: t})} />
              <View style={styles.halfInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Location</Text><TextInput style={styles.inputField} value={newBiz.location} onChangeText={t => setNewBiz({...newBiz, location: t})} /></View>
                <View style={{ flex: 1, marginLeft: 8 }}><Text style={styles.inputLabel}>Hours</Text><TextInput style={styles.inputField} value={newBiz.operating_hours} onChangeText={t => setNewBiz({...newBiz, operating_hours: t})} /></View>
              </View>
              <Text style={styles.sectionHeader}>Contact</Text>
              <View style={styles.halfInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Phone</Text><TextInput style={styles.inputField} keyboardType="phone-pad" value={newBiz.contact_phone} onChangeText={t => setNewBiz({...newBiz, contact_phone: t})} /></View>
                <View style={{ flex: 1, marginLeft: 8 }}><Text style={styles.inputLabel}>WhatsApp</Text><TextInput style={styles.inputField} keyboardType="phone-pad" value={newBiz.whatsapp_number} onChangeText={t => setNewBiz({...newBiz, whatsapp_number: t})} /></View>
              </View>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.inputField} keyboardType="email-address" value={newBiz.contact_email} onChangeText={t => setNewBiz({...newBiz, contact_email: t})} />
              <TouchableOpacity style={styles.publishButton} onPress={handleRegisterBusiness} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Register</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* GALLERY UPLOAD MODAL (Moved outside of the lists!) */}
      <Modal animationType="fade" transparent={true} visible={galleryModalVisible} onRequestClose={() => setGalleryModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to Portfolio</Text>
              <TouchableOpacity onPress={() => { setGalleryModalVisible(false); setGalleryImageUri(null); }}><Ionicons name="close-circle" size={28} color="#64748B" /></TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={[styles.imageSelector, { height: 200, width: '100%', marginBottom: 16 }]} 
              onPress={async () => {
                const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
                if (!result.canceled) setGalleryImageUri(result.assets[0].uri);
              }}
            >
              {galleryImageUri ? <Image source={{ uri: galleryImageUri }} style={styles.selectedLogo} /> : <Text style={styles.imagePlaceholderText}>Tap to select image</Text>}
            </TouchableOpacity>
            <Text style={styles.inputLabel}>Product Label (Optional)</Text>
            <TextInput style={styles.inputField} placeholder="e.g. Summer Shoes" value={galleryLabel} onChangeText={setGalleryLabel} />
            <TouchableOpacity style={styles.publishButton} onPress={handleAddGalleryItem} disabled={uploadingGallery || !galleryImageUri}>
              {uploadingGallery ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Upload Image</Text>}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topPanel: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingBottom: 10 },
  headerTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  navTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
  navIconButton: { padding: 4 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', marginHorizontal: 20, borderRadius: 12, paddingHorizontal: 16, height: 44, marginBottom: 16 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B', fontWeight: '500' },
  categoryScroll: { paddingHorizontal: 20, paddingBottom: 6 },
  categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  categoryPillActive: { backgroundColor: '#1E293B', borderColor: '#1E293B' },
  categoryPillText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  categoryPillTextActive: { color: '#fff' },
  bizCard: { backgroundColor: '#fff', borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  cardHeader: { flexDirection: 'row', padding: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  bizLogo: { width: 60, height: 60, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  logoPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9' },
  headerTextContainer: { flex: 1, marginLeft: 16, justifyContent: 'center' },
  categoryBadge: { fontSize: 10, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bizName: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center' },
  locationText: { fontSize: 12, fontWeight: '600', color: '#64748B', marginLeft: 4 },
  cardBody: { padding: 16 },
  descriptionText: { fontSize: 14, color: '#475569', lineHeight: 22, marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, backgroundColor: '#F0FDF4', padding: 8, borderRadius: 8, alignSelf: 'flex-start' },
  detailText: { fontSize: 12, color: '#1E293B', marginLeft: 6 },
  boldText: { fontWeight: '700' },
  contactActionBar: { paddingHorizontal: 16, paddingBottom: 16 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardFooter: { padding: 16, paddingTop: 0 },
  messageButton: { flexDirection: 'row', backgroundColor: '#34C759', paddingVertical: 14, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  messageButtonText: { fontSize: 15, fontWeight: '700', color: '#fff', marginLeft: 8 },
  emptyLayout: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  sectionHeader: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginTop: 8, marginBottom: 12 },
  imagePickerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  imageSelector: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  selectedLogo: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholderText: { fontSize: 12, fontWeight: '700', color: '#94A3B8', marginTop: 4 },
  halfInputRow: { flexDirection: 'row', justifyContent: 'space-between' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 6, marginLeft: 4 },
  inputField: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: '#1E293B', marginBottom: 16 },
  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});