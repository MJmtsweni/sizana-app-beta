import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, Text, View, FlatList, Image, 
  TouchableOpacity, TextInput, ActivityIndicator, 
  Dimensions, RefreshControl, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform 
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import RatingModal from './RatingModal';

const { width, height } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 40) / 2;

export default function MarketScreen({ route, session: directSession, navigation }: any) {
  const session = route?.params?.session || directSession;

  const [listings, setListings] = useState<any[]>([]);
  const [filteredListings, setFilteredListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Creation / Edit Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('Farming');
  const [newLocation, setNewLocation] = useState('Schweizer-Reneke');
  const [newDescription, setNewDescription] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');

  // Edit mode — holds the ID of the listing being edited, null when creating
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Details Sheet Modal States
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const categories = ['All', 'Farming', 'Electronics', 'Vehicles', 'Business', 'Services'];
  const creationCategories = ['Farming', 'Electronics', 'Vehicles', 'Business', 'Services'];
  const [ratingModalVisible, setRatingModalVisible] = useState(false);

  useEffect(() => {
    fetchListings();
  }, []);

  async function fetchListings() {
    try {
      setLoading(true);
       const { data, error } = await supabase
      .from('market_items')
      .select(`
        id, title, description, price, category, image_url, location, created_at, seller_id,
        users!market_items_seller_id_fkey ( username, avatar_url, rating, is_verified )
      `)
      .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        setListings(data);
        applyFilters(data, searchQuery, locationQuery, selectedCategory);
      }
    } catch (error: any) {
      Alert.alert('Marketplace Load Error', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const applyFilters = (allData: any[], search: string, location: string, cat: string) => {
    let temp = [...allData];
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

  async function handlePickProductImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Sizana needs camera roll access to add product photos.');
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

      const response = await fetch(localUri);
      const blob = await response.blob();

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
      Alert.alert('Image Uploaded', 'Product photo staged successfully!');
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
        Alert.alert('Success', 'Your item is now live on the marketplace!');
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
    setNewCategory('Farming');
    setNewLocation('Schweizer-Reneke');
    setEditingItemId(null); 
  };

  const handleManageListing = () => {
    if (!selectedItem) return;

    Alert.alert('Manage Listing', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Edit',
        onPress: () => {
          setNewTitle(selectedItem.title);
          setNewPrice(String(selectedItem.price));
          setNewDescription(selectedItem.description || '');
          setNewLocation(selectedItem.location || 'Schweizer-Reneke');
          setNewCategory(selectedItem.category);
          setNewImageUrl(selectedItem.image_url || '');
          setEditingItemId(selectedItem.id); 

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
            .eq('id', selectedItem.id);

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

  const handleMessageSeller = () => {
    if (!selectedItem) return;

    if (selectedItem.seller_id === session?.user?.id) {
      Alert.alert('Marketplace Rule', 'You cannot message yourself about your own product listing.');
      return;
    }

    setDetailsModalVisible(false);
    
    // Pass the full selectedItem object as contextItem
    navigation.navigate('Inbox', {
      session: session,
      sellerId: selectedItem.seller_id,
      sellerName: selectedItem.users?.username || 'Sizana Member',
      contextItem: selectedItem, 
      itemId: selectedItem.id
    });
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
      </View>

      <View style={styles.cardDetails}>
        <Text style={styles.cardPrice}>{formatCurrency(item.price)}</Text>
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
      <View style={styles.filterHeaderLayout}>
        <View style={[styles.searchBarContainer, { flex: 1, marginRight: 6 }]}>
          <Ionicons name="search" size={18} color="#94A3B8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search marketplace..."
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); applyFilters(listings, t, locationQuery, selectedCategory); }}
          />
        </View>
        <View style={[styles.searchBarContainer, { width: '38%', marginLeft: 6 }]}>
          <Ionicons name="location" size={18} color="#34C759" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Location..."
            value={locationQuery}
            onChangeText={(t) => { setLocationQuery(t); applyFilters(listings, searchQuery, t, selectedCategory); }}
          />
        </View>
      </View>

      <View style={{ maxHeight: 50, marginBottom: 6 }}>
        <FlatList
          data={categories}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === item && styles.categoryPillActive]}
              onPress={() => { setSelectedCategory(item); applyFilters(listings, searchQuery, locationQuery, item); }}
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
          keyExtractor={(item) => item.id}
          renderItem={renderMarketItem}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridColumnWrapper}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#34C759']} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={50} color="#CBD5E1" />
              <Text style={styles.emptyText}>No listings found here.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.8} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={24} color="#fff" />
        <Text style={styles.fabText}>Sell</Text>
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
              <Text style={styles.modalTitle}>{editingItemId ? 'Edit Listing' : 'Create New Listing'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); clearForm(); }}>
                <Ionicons name="close-circle" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
              <TouchableOpacity style={styles.modalImageSelector} onPress={handlePickProductImage}>
                {newImageUrl ? (
                  <Image source={{ uri: newImageUrl }} style={styles.selectedProductImage} />
                ) : uploading ? (
                  <ActivityIndicator color="#34C759" />
                ) : (
                  <>
                    <Ionicons name="camera" size={36} color="#94A3B8" />
                    <Text style={styles.imageSelectorText}>Add Product Photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>Item Title</Text>
              <TextInput style={styles.modalInput} value={newTitle} onChangeText={setNewTitle} placeholder="e.g., Yellow Maize Bags" />

              <Text style={styles.fieldLabel}>Price (ZAR)</Text>
              <TextInput style={styles.modalInput} keyboardType="numeric" value={newPrice} onChangeText={setNewPrice} placeholder="e.g., 450" />

              <Text style={styles.fieldLabel}>Trading Location</Text>
              <TextInput style={styles.modalInput} value={newLocation} onChangeText={setNewLocation} placeholder="e.g., Schweizer-Reneke" />

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.modalCategoryRow}>
                {creationCategories.map((cat) => (
                  <TouchableOpacity key={cat} style={[styles.modalCatPill, newCategory === cat && styles.modalCatPillActive]} onPress={() => setNewCategory(cat)}>
                    <Text style={[styles.modalCatText, newCategory === cat && styles.modalCatTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Item Description</Text>
              <TextInput style={[styles.modalInput, styles.modalTextArea]} value={newDescription} onChangeText={setNewDescription} multiline numberOfLines={3} placeholder="Provide item details..." />

              <TouchableOpacity style={styles.submitListingButton} onPress={handleCreateListing}>
                <Text style={styles.submitButtonText}>{editingItemId ? 'Save Changes' : 'Publish Listing'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <RatingModal
        visible={ratingModalVisible}
        onClose={() => setRatingModalVisible(false)}
        raterId={session?.user?.id}
        rateeId={selectedItem?.seller_id}
        rateeName={selectedItem?.users?.username || 'this seller'}
        onSubmitted={fetchListings}
      />        
      
      <Modal animationType="fade" transparent={true} visible={detailsModalVisible} onRequestClose={() => setDetailsModalVisible(false)}>
        <View style={styles.detailsModalOverlay}>
          <View style={styles.detailsModalContent}>
            
            <View style={styles.detailsHeaderActions}>
              <TouchableOpacity style={styles.circularCloseButton} onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="arrow-back" size={24} color="#1E293B" />
              </TouchableOpacity>

              <Text style={styles.detailsHeaderTitle}>Market Item</Text>

              {selectedItem?.seller_id === session?.user?.id ? (
                <TouchableOpacity
                  style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}
                  onPress={handleManageListing}
                >
                  <Ionicons name="ellipsis-horizontal" size={24} color="#1E293B" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>

            {selectedItem && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                
                <View style={styles.fullSizeImageFrame}>
                  {selectedItem.image_url ? (
                    <Image source={{ uri: selectedItem.image_url }} style={styles.fullProductImage} />
                  ) : (
                    <View style={styles.fullPlaceholderImage}>
                      <Ionicons name="image-outline" size={80} color="#CBD5E1" />
                    </View>
                  )}
                </View>

                <View style={styles.detailsBodyTextWrapper}>
                  <Text style={styles.detailsPriceText}>{formatCurrency(selectedItem.price)}</Text>
                  <Text style={styles.detailsTitleText}>{selectedItem.title}</Text>
                  
                  <View style={styles.detailsMetaRow}>
                    <View style={styles.metaBadgePill}>
                      <Ionicons name="pricetag" size={12} color="#475569" style={{ marginRight: 4 }} />
                      <Text style={styles.metaBadgeText}>{selectedItem.category}</Text>
                    </View>
                    <View style={styles.metaBadgePill}>
                      <Ionicons name="location" size={12} color="#34C759" style={{ marginRight: 4 }} />
                      <Text style={styles.metaBadgeText}>{selectedItem.location}</Text>
                    </View>
                  </View>

                  <View style={styles.dividerLine} />

                  <Text style={styles.detailsSectionHeading}>Description</Text>
                  <Text style={styles.detailsDescriptionBody}>{selectedItem.description || 'The seller did not include an item description summary.'}</Text>

                  <View style={styles.dividerLine} />

                  <Text style={styles.detailsSectionHeading}>Seller Profile Information</Text>
                  <View style={styles.sellerProfileLayoutRow}>
                    <View style={styles.sellerAvatarWrapper}>
                      {selectedItem.users?.avatar_url ? (
                        <Image source={{ uri: selectedItem.users.avatar_url }} style={styles.sellerAvatarImage} />
                      ) : (
                        <Ionicons name="person-circle" size={44} color="#CBD5E1" />
                      )}
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.sellerNameLabel}>{selectedItem.users?.username || 'Sizana Community Member'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        {selectedItem.users?.rating != null ? (
                          <Text style={styles.sellerTierLabel}>⭐ {Number(selectedItem.users.rating).toFixed(1)}</Text>
                        ) : (
                          <Text style={styles.sellerTierLabelMuted}>New Member</Text>
                        )}
                        {selectedItem.users?.is_verified && (
                          <Text style={[styles.sellerTierLabel, { marginLeft: 8 }]}>✓ Verified</Text>
                        )}
                      </View>
                      {selectedItem.seller_id !== session?.user?.id && (
                        <TouchableOpacity 
                          style={{ marginTop: 4 }}
                          onPress={() => {
                            setDetailsModalVisible(false); 
                            setTimeout(() => {
                              setRatingModalVisible(true);
                            }, 350); 
                          }} 
                        >
                          <Text style={styles.rateSellerLink}>Rate this seller</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {selectedItem.seller_id !== session?.user?.id && (
                    <TouchableOpacity style={styles.messageSellerActionButton} onPress={handleMessageSeller}>
                      <Ionicons name="chatbubble-ellipses" size={20} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.messageSellerButtonText}>Message Seller</Text>
                    </TouchableOpacity>
                  )}

                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterHeaderLayout: { flexDirection: 'row', paddingHorizontal: 14, marginTop: 14, marginBottom: 4, alignItems: 'center' },
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
  
  detailsModalOverlay: { flex: 1, backgroundColor: '#fff' },
  detailsModalContent: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 20 },
  detailsHeaderActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 50, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  circularCloseButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  detailsHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
  fullSizeImageFrame: { width: width, height: height * 0.4, backgroundColor: '#F1F5F9' },
  fullProductImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  fullPlaceholderImage: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  detailsBodyTextWrapper: { padding: 24 },
  detailsPriceText: { fontSize: 26, fontWeight: '900', color: '#1E293B' },
  detailsTitleText: { fontSize: 20, fontWeight: '700', color: '#475569', marginTop: 4, lineHeight: 26 },
  detailsMetaRow: { flexDirection: 'row', marginTop: 12 },
  metaBadgePill: { flexDirection: 'row', backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, alignItems: 'center' },
  metaBadgeText: { fontSize: 12, color: '#475569', fontWeight: '700' },
  dividerLine: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 20 },
  detailsSectionHeading: { fontSize: 12, fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  detailsDescriptionBody: { fontSize: 15, color: '#334155', fontWeight: '500', lineHeight: 24 },
  sellerProfileLayoutRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sellerAvatarWrapper: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#F1F5F9', overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' },
  sellerAvatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  sellerNameLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  sellerTierLabel: { fontSize: 12, fontWeight: '600', color: '#34C759', marginTop: 1 },
  messageSellerActionButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 32, shadowColor: '#34C759', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 3 },
  messageSellerButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  sellerTierLabelMuted: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  rateSellerLink: { fontSize: 12, fontWeight: '700', color: '#3B82F6', marginTop: 4 },
});