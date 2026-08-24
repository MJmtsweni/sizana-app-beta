import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { compressImage } from '../../lib/mediaCompression';
import { withRetry } from '../../lib/network';
import { PAGE_SIZE, pageRange } from '../../lib/pagination';
import { CategoryPicker, EmptyState } from '../../components/ui';

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

  const [filteredListings, setFilteredListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Skips the redundant fetch the search/filter debounce effect would
  // otherwise fire on mount, right on top of useFocusEffect's own fetch.
  const isFirstFilterRun = useRef(true);

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
  const [newImageUrls, setNewImageUrls] = useState<string[]>([]);
  const MAX_PHOTOS = 6;
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

  // Search/category/location/type filters are all applied server-side now
  // (not client-side over a fully-fetched table), so pagination and
  // filtering compose correctly instead of a page boundary silently
  // hiding matches that were never fetched.
  function buildListingsQuery() {
    let query = supabase
      .from('market_items')
      .select(`
        id, title, description, price, category, image_url, image_urls, location, created_at, seller_id, listing_type, business_id,
        users!market_items_seller_id_fkey ( username, avatar_url, rating, is_verified ),
        business:business_id ( id, name, logo_url, creator_id )
      `)
      .eq('listing_type', listingType);

    if (selectedCategory !== 'All') query = query.eq('category', selectedCategory);
    if (searchQuery.trim()) query = query.ilike('title', `%${searchQuery.trim()}%`);
    if (locationQuery.trim()) query = query.ilike('location', `%${locationQuery.trim()}%`);

    return query.order('created_at', { ascending: false });
  }

  async function fetchListings() {
    try {
      if (filteredListings.length === 0) setLoading(true);
      const [from, to] = pageRange(0);
      const { data, error } = await withRetry(() => buildListingsQuery().range(from, to));

      if (error) throw error;
      if (data) {
        setFilteredListings(data);
        setPage(0);
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (error: any) {
      Alert.alert('Marketplace Load Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadMoreListings() {
    if (loadingMore || !hasMore || loading) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const [from, to] = pageRange(nextPage);
      const { data, error } = await withRetry(() => buildListingsQuery().range(from, to));

      if (error) throw error;
      if (data) {
        setFilteredListings(prev => [...prev, ...data]);
        setPage(nextPage);
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (error: any) {
      console.error('Marketplace load-more error:', error.message);
    } finally {
      setLoadingMore(false);
    }
  }

  // Re-fetches page 0 whenever a filter changes, debounced so search-as-you-type
  // doesn't fire a request per keystroke.
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const handle = setTimeout(() => { fetchListings(); }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, locationQuery, selectedCategory, listingType]);

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

  const handleSelectListingType = (type: string) => {
    setListingType(type);
    setSelectedCategory('All');
  };

  async function handlePickProductImage() {
    if (newImageUrls.length >= MAX_PHOTOS) {
      Alert.alert('Photo Limit Reached', `You can add up to ${MAX_PHOTOS} photos per listing.`);
      return;
    }

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
      const compressed = await compressImage(localUri, { maxDimension: 1600 });
      const fileExt = 'jpg';
      const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;

      const formData = new FormData();
      formData.append('file', {
        uri: compressed.uri,
        name: fileName,
        type: 'image/jpeg'
      } as any);

      const { error: uploadError } = await supabase.storage
        .from('Listings') 
        .upload(fileName, formData, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('Listings')
        .getPublicUrl(fileName);

      setNewImageUrls(prev => [...prev, publicUrl]);
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message);
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage(index: number) {
    setNewImageUrls(prev => prev.filter((_, i) => i !== index));
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
        image_url: newImageUrls[0] || null,
        image_urls: newImageUrls,
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
    setNewImageUrls([]);
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
          setNewImageUrls(item.image_urls?.length ? item.image_urls : (item.image_url ? [item.image_url] : []));
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
        {(item.image_urls?.[0] || item.image_url) ? (
          <Image source={{ uri: item.image_urls?.[0] || item.image_url }} style={styles.cardImage} />
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
        {item.image_urls?.length > 1 && (
          <View style={styles.photoCountBadge}>
            <Ionicons name="images" size={10} color="#fff" />
            <Text style={styles.photoCountText}>{item.image_urls.length}</Text>
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
            onChangeText={setSearchQuery}
          />
        </View>
        <View style={[styles.searchBarContainer, { width: '38%', marginLeft: 6 }]}>
          <Ionicons name="location" size={18} color="#34C759" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Location..."
            value={locationQuery}
            onChangeText={setLocationQuery}
          />
        </View>
      </View>

      <View style={{ maxHeight: 50, marginBottom: 6 }}>
        <CategoryPicker
          categories={CATEGORY_MAP[listingType]}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
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
          onEndReached={loadMoreListings}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#34C759" style={{ marginVertical: 20 }} /> : null}
          ListEmptyComponent={
            <EmptyState
              icon="alert-circle-outline"
              title={`No ${LISTING_TYPES.find(t => t.key === listingType)?.label.toLowerCase()} found here.`}
            />
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

              <Text style={styles.fieldLabel}>
                Photos ({newImageUrls.length}/{MAX_PHOTOS}) — first photo is the cover
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {newImageUrls.map((uri, index) => (
                  <View key={uri + index} style={styles.photoThumbWrap}>
                    <Image source={{ uri }} style={styles.photoThumb} />
                    {index === 0 && (
                      <View style={styles.coverBadge}>
                        <Text style={styles.coverBadgeText}>Cover</Text>
                      </View>
                    )}
                    <TouchableOpacity style={styles.removePhotoButton} onPress={() => handleRemoveImage(index)}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {newImageUrls.length < MAX_PHOTOS && (
                  <TouchableOpacity style={styles.addPhotoTile} onPress={handlePickProductImage} disabled={uploading}>
                    {uploading ? (
                      <ActivityIndicator color="#34C759" />
                    ) : (
                      <>
                        <Ionicons name="camera" size={28} color="#94A3B8" />
                        <Text style={styles.imageSelectorText}>Add Photo</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </ScrollView>

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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  imageSelectorText: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 4 },
  photoThumbWrap: { width: 100, height: 100, borderRadius: 14, marginRight: 10, overflow: 'hidden', position: 'relative', backgroundColor: '#F1F5F9' },
  photoThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(52,199,89,0.9)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  coverBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  removePhotoButton: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  addPhotoTile: { width: 100, height: 100, borderRadius: 14, backgroundColor: '#F1F5F9', borderStyle: 'dashed', borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  photoCountBadge: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  photoCountText: { color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 4 },
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