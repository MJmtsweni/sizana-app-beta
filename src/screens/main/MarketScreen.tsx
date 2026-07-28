import React, { useCallback, useState } from 'react';
import { 
  StyleSheet, Text, View, FlatList, Image, 
  TouchableOpacity, TextInput, ActivityIndicator, 
  Dimensions, RefreshControl, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import ListingDetailsModal from './ListingDetailsModal';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 40) / 2;

// --- LISTING TYPE TABS ---
const LISTING_TYPES: { key: string; label: string; icon: any }[] = [
  { key: 'product', label: 'Products', icon: 'cube' },
  { key: 'service', label: 'Services', icon: 'construct' },
  { key: 'property', label: 'Property', icon: 'home' },
  { key: 'vehicle', label: 'Vehicles', icon: 'car' },
  { key: 'job', label: 'Jobs', icon: 'briefcase' },
];

// Sub-categories differ per listing type
const CATEGORY_MAP: Record<string, string[]> = {
  product: ['All', 'Farming', 'Electronics', 'Household', 'Fashion', 'Other'],
  service: ['All', 'Home Services', 'Tutoring', 'Repairs', 'Beauty & Wellness', 'Other'],
  property: ['All', 'For Sale', 'To Rent', 'Land', 'Commercial'],
  vehicle: ['All', 'Cars', 'Bakkies & Trucks', 'Motorcycles', 'Parts & Accessories'],
  job: ['All', 'Farm Work', 'Retail', 'Trades', 'Admin & Office', 'General Labour'],
};

const FAB_LABEL: Record<string, string> = {
  product: 'Sell',
  service: 'Offer',
  property: 'List',
  vehicle: 'Sell',
  job: 'Post Job',
};

const PRICE_LABEL: Record<string, string> = {
  product: 'Price (ZAR)',
  service: 'Rate (ZAR)',
  property: 'Price (ZAR)',
  vehicle: 'Price (ZAR)',
  job: 'Salary / Wage (ZAR)',
};

export default function MarketScreen({ route, session: directSession, navigation }: any) {
  const session = route?.params?.session || directSession;

  const [listings, setListings] = useState<any[]>([]);
  const [filteredListings, setFilteredListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Type + category filter state
  const [listingType, setListingType] = useState('product');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');

  // Creation / Edit Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_MAP.product[1]);
  const [newLocation, setNewLocation] = useState('Schweizer-Reneke');
  const [newDescription, setNewDescription] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [creatingListingType, setCreatingListingType] = useState('product');

  // Edit mode — holds the ID of the listing being edited, null when creating
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Business identity — only relevant when creatingListingType === 'job'
  const [ownedBusinesses, setOwnedBusinesses] = useState<any[]>([]);
  const [postingAsBusinessId, setPostingAsBusinessId] = useState<string | null>(null);

  // Details Sheet Modal States
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  // useFocusEffect (not a mount-only useEffect) so that ownedBusinesses stays
  // current — e.g. if the user creates a business elsewhere and comes back to
  // Market to post a job, this refetches instead of showing stale data.
  useFocusEffect(
    useCallback(() => {
      fetchListings();
      fetchUserBusinesses();
    }, [session?.user?.id])
  );

  async function fetchListings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('market_items')
        .select(`
          id, title, description, price, category, image_url, location, created_at, seller_id, listing_type, business_id,
          users!market_items_seller_id_fkey ( username, avatar_url, rating, is_verified ),
          business:business_id ( id, name, logo_url, creator_id )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setListings(data);
        applyFilters(data, searchQuery, locationQuery, selectedCategory, listingType);
      }
    } catch (error: any) {
      Alert.alert('Marketplace Load Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function fetchUserBusinesses() {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, logo_url')
        .eq('creator_id', session.user.id);
      if (error) throw error;
      if (data) setOwnedBusinesses(data);
    } catch (e: any) {
      console.warn('Failed to fetch owned businesses:', e.message);
    }
  }

  const applyFilters = (allData: any[], search: string, location: string, cat: string, type: string) => {
    let temp = allData.filter(item => item.listing_type === type);
    if (cat !== 'All') temp = temp.filter(item => item.category === cat);
    if (search.trim() !== '') {
      temp = temp.filter(item => 
        item.title.toLowerCase().includes(search.toLowerCase()) || 
        item.description?.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (location.trim() !== '') {
      temp = temp.filter(item => item.location?.toLowerCase().includes(location.toLowerCase()));
    }
    setFilteredListings(temp);
  };

  const handleSelectListingType = (type: string) => {
    setListingType(type);
    setSelectedCategory('All');
    applyFilters(listings, searchQuery, locationQuery, 'All', type);
  };

  async function handlePickProductImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sizana needs camera roll access to add photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0].uri) {
      uploadProductImage(result.assets[0].uri);
    }
  }

  async function uploadProductImage(localUri: string) {
    try {
      setUploading(true);
      const fileExt = localUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;

      const formData = new FormData();
      formData.append('file', {
        uri: localUri,
        name: fileName,
        type: `image/${fileExt === 'png' ? 'png' : 'jpeg'}`
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('Listings') 
        .upload(fileName, formData, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('Listings')
        .getPublicUrl(fileName);

      setNewImageUrl(publicUrl);
      Alert.alert('Image Uploaded', 'Photo staged successfully!');
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateListing() {
    if (!newTitle || !newPrice) {
      Alert.alert('Missing Fields', 'Please fill in a title and price.');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        title: newTitle,
        price: parseFloat(newPrice),
        category: newCategory,
        location: newLocation,
        description: newDescription,
        image_url: newImageUrl,
        listing_type: creatingListingType,
        business_id: creatingListingType === 'job' ? postingAsBusinessId : null,
      };

      if (editingItemId) {
        const { error } = await supabase
          .from('market_items')
          .update(payload)
          .eq('id', editingItemId);

        if (error) throw error;
        Alert.alert('Updated', 'Your listing has been updated successfully!');
      } else {
        const { error } = await supabase
          .from('market_items')
          .insert({ ...payload, seller_id: session.user.id });

        if (error) throw error;
        Alert.alert('Success', 'Your listing is now live!');
      }

      setModalVisible(false);
      clearForm();
      fetchListings();
    } catch (error: any) {
      Alert.alert('Listing Error', error.message);
      setLoading(false);
    }
  }

  const clearForm = () => {
    setNewTitle('');
    setNewPrice('');
    setNewDescription('');
    setNewImageUrl('');
    setNewLocation('Schweizer-Reneke');
    setEditingItemId(null);
    setPostingAsBusinessId(null);
  };

  const openCreateModal = () => {
    setCreatingListingType(listingType);
    setNewCategory(CATEGORY_MAP[listingType][1]);
    setModalVisible(true);
  };

  const handleManageListing = (item: any) => {
    Alert.alert('Manage Listing', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit',
        onPress: () => {
          setNewTitle(item.title);
          setNewPrice(String(item.price));
          setNewDescription(item.description || '');
          setNewLocation(item.location || 'Schweizer-Reneke');
          setNewCategory(item.category);
          setNewImageUrl(item.image_url || '');
          setEditingItemId(item.id);
          setCreatingListingType(item.listing_type);
          setPostingAsBusinessId(item.business_id || null);

          setDetailsModalVisible(false);
          setModalVisible(true);
        }
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('market_items')
            .delete()
            .eq('id', item.id);

          if (error) {
            Alert.alert('Delete Failed', error.message);
          } else {
            setDetailsModalVisible(false);
            fetchListings();
          }
        }
      }
    ]);
  };

  const formatCurrency = (amount: number) => `R ${Number(amount).toLocaleString('en-ZA')}`;

  const renderMarketItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => {
        setSelectedItem(item);
        setDetailsModalVisible(true);
      }}
    >
      <View style={styles.imageContainer}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImage} />
        ) : (
          <View style={styles.placeholderImage}>
            <Ionicons name="image-outline" size={40} color="#CBD5E1" />
          </View>
        )}
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{item.category}</Text>
        </View>
        {item.business_id && (
          <View style={styles.businessBadge}>
            <Ionicons name="briefcase" size={10} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.cardDetails}>
        <Text style={styles.cardPrice}>
          {formatCurrency(item.price)}{item.listing_type === 'job' ? ' /mo' : ''}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.locationContainer}>
          <Ionicons name="location" size={12} color="#34C759" />
          <Text style={styles.cardLocation} numberOfLines={1}>{item.location}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  function handleRefresh(): void {
    setRefreshing(true);
    fetchListings();
  }

  return (
    <View style={styles.mainContainer}>
      {/* --- LISTING TYPE TABS --- */}
      <View style={{ maxHeight: 54, marginTop: 10 }}>
        <FlatList
          data={LISTING_TYPES}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.typeTabsContainer}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => {
            const active = listingType === item.key;
            return (
              <TouchableOpacity
                style={[styles.typeTab, active && styles.typeTabActive]}
                onPress={() => handleSelectListingType(item.key)}
              >
                <Ionicons name={item.icon} size={16} color={active ? '#fff' : '#475569'} style={{ marginRight: 6 }} />
                <Text style={[styles.typeTabText, active && styles.typeTabTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <View style={styles.filterHeaderLayout}>
        <View style={[styles.searchBarContainer, { flex: 1, marginRight: 6 }]}>
          <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${LISTING_TYPES.find(t => t.key === listingType)?.label.toLowerCase()}...`}
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); applyFilters(listings, t, locationQuery, selectedCategory, listingType); }}
          />
        </View>
        <View style={[styles.searchBarContainer, { width: '38%', marginLeft: 6 }]}>
          <Ionicons name="location" size={18} color="#34C759" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Location..."
            value={locationQuery}
            onChangeText={(t) => { setLocationQuery(t); applyFilters(listings, searchQuery, t, selectedCategory, listingType); }}
          />
        </View>
      </View>

      <View style={{ maxHeight: 50, marginBottom: 6 }}>
        <FlatList
          data={CATEGORY_MAP[listingType]}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === item && styles.categoryPillActive]}
              onPress={() => { setSelectedCategory(item); applyFilters(listings, searchQuery, locationQuery, item, listingType); }}
            >
              <Text style={[styles.categoryText, selectedCategory === item && styles.categoryTextActive]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={filteredListings}
          numColumns={2}
          key={listingType}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMarketItem}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridColumnWrapper}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#34C759']} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No {LISTING_TYPES.find(t => t.key === listingType)?.label.toLowerCase()} found here.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={openCreateModal}>
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.fabText}>{FAB_LABEL[listingType]}</Text>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => { setModalVisible(false); clearForm(); }}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItemId ? 'Edit Listing' : `New ${LISTING_TYPES.find(t => t.key === creatingListingType)?.label.slice(0, -1)}`}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); clearForm(); }}>
                <Ionicons name="close-circle" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              {/* --- POST AS: only for Jobs, only if the user owns a business --- */}
              {creatingListingType === 'job' && ownedBusinesses.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Post As</Text>
                  <View style={styles.identityRow}>
                    <TouchableOpacity
                      style={[styles.identityPill, postingAsBusinessId === null && styles.identityPillActive]}
                      onPress={() => setPostingAsBusinessId(null)}
                    >
                      <Ionicons name="person" size={14} color={postingAsBusinessId === null ? '#34C759' : '#64748B'} />
                      <Text style={[styles.identityText, postingAsBusinessId === null && styles.identityTextActive]}>Myself</Text>
                    </TouchableOpacity>
                    {ownedBusinesses.map((biz) => (
                      <TouchableOpacity
                        key={biz.id}
                        style={[styles.identityPill, postingAsBusinessId === biz.id && styles.identityPillActive]}
                        onPress={() => setPostingAsBusinessId(biz.id)}
                      >
                        <Ionicons name="briefcase" size={14} color={postingAsBusinessId === biz.id ? '#34C759' : '#64748B'} />
                        <Text style={[styles.identityText, postingAsBusinessId === biz.id && styles.identityTextActive]}>{biz.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.modalImageSelector} onPress={handlePickProductImage}>
                {newImageUrl ? (
                  <Image source={{ uri: newImageUrl }} style={styles.selectedProductImage} />
                ) : uploading ? (
                  <ActivityIndicator color="#34C759" />
                ) : (
                  <>
                    <Ionicons name="camera" size={36} color="#94A3B8" />
                    <Text style={styles.imageSelectorText}>Add Photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput style={styles.modalInput} value={newTitle} onChangeText={setNewTitle} placeholder="e.g., Yellow Maize Bags" />

              <Text style={styles.fieldLabel}>{PRICE_LABEL[creatingListingType]}</Text>
              <TextInput style={styles.modalInput} keyboardType="numeric" value={newPrice} onChangeText={setNewPrice} placeholder="e.g., 450" />

              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput style={styles.modalInput} value={newLocation} onChangeText={setNewLocation} placeholder="e.g., Schweizer-Reneke" />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.modalCategoryRow}>
                {CATEGORY_MAP[creatingListingType].slice(1).map((cat) => (
                  <TouchableOpacity key={cat} style={[styles.modalCatPill, newCategory === cat && styles.modalCatPillActive]} onPress={() => setNewCategory(cat)}>
                    <Text style={[styles.modalCatText, newCategory === cat && styles.modalCatTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput style={[styles.modalInput, styles.modalTextArea]} value={newDescription} onChangeText={setNewDescription} multiline numberOfLines={3} placeholder="Provide details..." />

              <TouchableOpacity style={styles.submitListingButton} onPress={handleCreateListing}>
                <Text style={styles.submitButtonText}>{editingItemId ? 'Save Changes' : 'Publish Listing'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ListingDetailsModal
        visible={detailsModalVisible}
        item={selectedItem}
        session={session}
        navigation={navigation}
        onClose={() => setDetailsModalVisible(false)}
        onChanged={fetchListings}
        onManage={handleManageListing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  typeTabsContainer: { paddingHorizontal: 14, alignItems: 'center' },
  typeTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, marginRight: 8 },
  typeTabActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  typeTabText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  typeTabTextActive: { color: '#fff' },

  filterHeaderLayout: { flexDirection: 'row', paddingHorizontal: 14, marginTop: 10, marginBottom: 4, alignItems: 'center' },
  searchBarContainer: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', height: 46 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, height: '100%', fontSize: 14, color: '#334155', fontWeight: '500' },
  categoriesContainer: { paddingHorizontal: 14, paddingVertical: 4 },
  categoryPill: { backgroundColor: '#E2E8F0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, height: 36, justifyContent: 'center' },
  categoryPillActive: { backgroundColor: '#34C759' },
  categoryText: { fontSize: 13, color: '#475569', fontWeight: '700' },
  categoryTextActive: { color: '#fff' },
  gridContainer: { padding: 14, paddingBottom: 100 },
  gridColumnWrapper: { justifyContent: 'space-between' },
  card: { backgroundColor: '#fff', width: COLUMN_WIDTH, borderRadius: 20, marginBottom: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 8 },
  imageContainer: { width: '100%', height: COLUMN_WIDTH * 1.1, backgroundColor: '#F1F5F9' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  categoryBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  categoryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  businessBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#8B5CF6', width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  cardDetails: { padding: 12 },
  cardPrice: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  cardTitle: { fontSize: 14, color: '#475569', fontWeight: '600', marginTop: 2 },
  locationContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  cardLocation: { fontSize: 12, color: '#94A3B8', marginLeft: 4, fontWeight: '500', flex: 1 },
  fab: { position: 'absolute', bottom: 24, right: 24, backgroundColor: '#34C759', flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 30, alignItems: 'center', elevation: 5, shadowColor: '#34C759', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10 },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 6 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 15, fontWeight: '600', marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  modalImageSelector: { height: 150, backgroundColor: '#F1F5F9', borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginBottom: 16, overflow: 'hidden' },
  selectedProductImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imageSelectorText: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6, marginLeft: 2 },
  modalInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#334155', marginBottom: 14, fontWeight: '500' },
  modalTextArea: { height: 70, textAlignVertical: 'top' },
  modalCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  modalCatPill: { backgroundColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, marginRight: 6, marginBottom: 6 },
  modalCatPillActive: { backgroundColor: '#34C759' },
  modalCatText: { fontSize: 12, color: '#475569', fontWeight: '700' },
  modalCatTextActive: { color: '#fff' },
  submitListingButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 10 },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  identityRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  identityPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#F8FAFC', borderRadius: 20, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  identityPillActive: { backgroundColor: '#F0FDF4', borderColor: '#34C759' },
  identityText: { fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 6 },
  identityTextActive: { color: '#34C759' },
});