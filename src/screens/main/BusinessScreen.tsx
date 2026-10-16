import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, ActivityIndicator, Platform, Alert,
  ScrollView, Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase'; // Adjust path if necessary
import { useUserLocation } from '../../hooks/useUserLocation';
import { useDeviceLocation } from '../../hooks/useDeviceLocation';
import { useLocationCapture } from '../../hooks/useLocationCapture';
import { formatDistance, NEARBY_RADIUS_KM } from '../../lib/distance';
import ScopeToggle, { Scope } from '../../components/ScopeToggle';
import { pickImage as pickImageHelper, uploadImageToStorage } from '../../lib/imageUpload';
import { BUSINESS_CATEGORIES } from '../../lib/businessCategories';
import { withRetry } from '../../lib/network';
import { PAGE_SIZE, pageRange } from '../../lib/pagination';
import { CategoryPicker, EmptyState, ModalSheet } from '../../components/ui';
import EditBusinessModalScreen from './EditBusinessModalScreen';

export default function BusinessScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();
  const [openTime, setOpenTime] = useState(new Date(new Date().setHours(8, 0, 0, 0))); // Defaults to 08:00
  const [closeTime, setCloseTime] = useState(new Date(new Date().setHours(17, 0, 0, 0))); // Defaults to 17:00

  // One paginated dataset serves all three scopes — which query builds each
  // page (see fetchBusinessesPage) is the only thing that changes.
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const isFirstFilterRun = useRef(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [scope, setScope] = useState<Scope>('explore');
  const { myLocation } = useUserLocation(session);
  const { coords: deviceCoords, status: deviceLocationStatus } = useDeviceLocation();
  const { capturing: capturingLocation, captureLocation } = useLocationCapture();
  
  // Excluded 'All' from the registration form choices to prevent users from creating an 'All' business
  const filterCategories = ['All', ...BUSINESS_CATEGORIES];
  const formCategories = BUSINESS_CATEGORIES;

  const [modalVisible, setModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newBiz, setNewBiz] = useState({
    name: '', 
    category: 'Services', 
    description: '', 
    location: '',
    contact_email: '', 
    contact_phone: '', 
    whatsapp_number: '', 
    website_url: '', 
    logoUri: null as string | null, 
    coverPhotoUri: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
  });

  // Track visibility for Android modals
  const [showOpenPicker, setShowOpenPicker] = useState(false);
  const [showClosePicker, setShowClosePicker] = useState(false);

  // Formatting helper for the UI and Database
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // Gallery State
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [galleryImageUri, setGalleryImageUri] = useState<string | null>(null);
  const [galleryLabel, setGalleryLabel] = useState('');
  const [uploadingGallery, setUploadingGallery] = useState(false);

  // Business being edited via the card's "Manage Business" menu
  const [editingBusiness, setEditingBusiness] = useState<any>(null);

  useFocusEffect(
    useCallback(() => { fetchBusinesses(); }, [scope])
  );

  // Location/GPS resolving asynchronously after mount (permission prompt,
  // profile fetch) needs its own trigger — Home/Nearby depend on it but it
  // isn't known yet when the focus effect above first runs.
  useEffect(() => {
    if (scope === 'explore') return;
    fetchBusinesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, deviceCoords, scope]);

  // Search/category filters are applied server-side for every scope now, so
  // a change re-fetches page 0 rather than re-filtering an in-memory array.
  // Debounced so search-as-you-type doesn't fire a request per keystroke.
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const handle = setTimeout(() => { fetchBusinesses(); }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeCategory]);

  // Shared category/search filters, reused by both the plain Explore query
  // and Home's location-matched one — Nearby uses the nearby_businesses RPC
  // instead (see fetchBusinessesPage) since it needs real distance ranking.
  function buildBusinessesQuery(locationFilter?: string) {
    let query = supabase.from('businesses').select('*, gallery:business_gallery(*)');
    if (activeCategory !== 'All') query = query.eq('category', activeCategory);
    if (searchQuery.trim()) query = query.ilike('name', `%${searchQuery.trim()}%`);
    if (locationFilter) query = query.ilike('location', `%${locationFilter}%`);
    return query.order('created_at', { ascending: false });
  }

  // Hydrates the (distance-ranked) ids the RPC returned into full business
  // rows, preserving rank order and attaching _distanceKm for display.
  async function hydrateNearbyIds(ranked: { id: string; distance_km: number }[]) {
    if (ranked.length === 0) return [];
    const ids = ranked.map(r => r.id);
    const distanceById = new Map(ranked.map(r => [r.id, r.distance_km]));
    const { data, error } = await supabase.from('businesses').select('*, gallery:business_gallery(*)').in('id', ids);
    if (error) throw error;
    return ids
      .map(id => {
        const biz = data?.find((b: any) => b.id === id);
        return biz ? { ...biz, _distanceKm: distanceById.get(id) } : null;
      })
      .filter(Boolean);
  }

  async function fetchBusinessesPage(pageNum: number): Promise<any[]> {
    const [from, to] = pageRange(pageNum);

    if (scope === 'home') {
      if (!myLocation) return [];
      const { data, error } = await withRetry(() => buildBusinessesQuery(myLocation).range(from, to));
      if (error) throw error;
      return data || [];
    }

    if (scope === 'nearby') {
      if (deviceCoords) {
        const { data, error } = await withRetry(() => supabase.rpc('nearby_businesses', {
          p_lat: deviceCoords.latitude,
          p_lng: deviceCoords.longitude,
          p_radius_km: NEARBY_RADIUS_KM,
          p_category: activeCategory !== 'All' ? activeCategory : null,
          p_search: searchQuery.trim() || null,
          p_limit: PAGE_SIZE,
          p_offset: from,
        }));
        if (error) throw error;
        return hydrateNearbyIds(data || []);
      }
      // GPS denied/unavailable — fall back to the Home-style text match.
      if (myLocation) {
        const { data, error } = await withRetry(() => buildBusinessesQuery(myLocation).range(from, to));
        if (error) throw error;
        return data || [];
      }
      return [];
    }

    // explore
    const { data, error } = await withRetry(() => buildBusinessesQuery().range(from, to));
    if (error) throw error;
    return data || [];
  }

  async function fetchBusinesses() {
    try {
      if (businesses.length === 0) setLoading(true);
      const data = await fetchBusinessesPage(0);
      setBusinesses(data);
      setPage(0);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('Businesses fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadMoreBusinesses() {
    if (loadingMore || !hasMore || loading) return;
    try {
      setLoadingMore(true);
      const nextPage = page + 1;
      const data = await fetchBusinessesPage(nextPage);
      setBusinesses(prev => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e: any) {
      console.error('Businesses load-more error:', e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const handleOpenLink = async (url: string) => {
    if (!url) return;
    const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    const supported = await Linking.canOpenURL(formattedUrl);
    if (supported) await Linking.openURL(formattedUrl);
  };

  const handleWhatsApp = (phone: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    handleOpenLink(`whatsapp://send?phone=${cleanPhone}`);
  };

  async function pickLogoImage() {
    const uri = await pickImageHelper({ aspect: [1, 1], quality: 0.6 });
    if (uri) setNewBiz({ ...newBiz, logoUri: uri });
  }

  async function pickCoverPhoto() {
    const uri = await pickImageHelper({ aspect: [16, 9], quality: 0.8 });
    if (uri) setNewBiz({ ...newBiz, coverPhotoUri: uri });
  }

  // --- REGISTRATION VALIDATION ---
  const validateForm = () => {
    if (!newBiz.name || !newBiz.location) {
      Alert.alert('Missing Info', 'Business name and location are required.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\+?[0-9]{9,15}$/;

    if (newBiz.contact_email && !emailRegex.test(newBiz.contact_email)) {
      Alert.alert("Invalid Email", "Please enter a valid business email address.");
      return false;
    }
    
    if (newBiz.whatsapp_number && !phoneRegex.test(newBiz.whatsapp_number.replace(/\s/g, ''))) {
      Alert.alert("Invalid WhatsApp", "Please enter a valid WhatsApp number (e.g. 0821234567).");
      return false;
    }
    
    if (newBiz.contact_phone && !phoneRegex.test(newBiz.contact_phone.replace(/\s/g, ''))) {
      Alert.alert("Invalid Phone", "Please enter a valid phone number.");
      return false;
    }

    return true;
  };

  async function handleRegisterBusiness() {
    if (!validateForm()) return; // Stop if invalid

    try {
      setUploading(true);
      let finalLogoUrl = null;
      let finalCoverUrl = null;

      // 1. Upload Logo if exists
      if (newBiz.logoUri) {
        finalLogoUrl = await uploadImageToStorage(newBiz.logoUri, { fileNamePrefix: 'biz', maxDimension: 800 });
      }

      // 2. Upload Cover Photo if exists
      if (newBiz.coverPhotoUri) {
        finalCoverUrl = await uploadImageToStorage(newBiz.coverPhotoUri, { fileNamePrefix: 'cover', maxDimension: 1600 });
      }

      // 3. Insert Database Record
      const { data: insertedBiz, error } = await supabase.from('businesses').insert({
        creator_id: session.user.id, 
        name: newBiz.name, 
        category: newBiz.category,
        description: newBiz.description, 
        location: newBiz.location, 
        contact_email: newBiz.contact_email,
        contact_phone: newBiz.contact_phone, 
        whatsapp_number: newBiz.whatsapp_number,
        website_url: newBiz.website_url,
        operating_hours: `${formatTime(openTime)} - ${formatTime(closeTime)}`,
        logo_url: finalLogoUrl,
        cover_photo_url: finalCoverUrl,
        latitude: newBiz.latitude,
        longitude: newBiz.longitude,
      }).select().single();

      if (error) throw error;

      if (insertedBiz) {
        await supabase.from('business_roles').insert({ business_id: insertedBiz.id, user_id: session.user.id, role: 'owner' });
      }

      setModalVisible(false);
      fetchBusinesses();

      // Full Form Reset
      setNewBiz({ name: '', category: 'Services', description: '', location: '', contact_email: '', contact_phone: '', whatsapp_number: '', website_url: '', logoUri: null, coverPhotoUri: null, latitude: null, longitude: null });
      setOpenTime(new Date(new Date().setHours(8, 0, 0, 0)));
      setCloseTime(new Date(new Date().setHours(17, 0, 0, 0)));

    } catch (e: any) {
      Alert.alert('Registration Failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleAddGalleryItem() {
    if (!galleryImageUri || !activeBusinessId) return;
    try {
      setUploadingGallery(true);
      const publicUrl = await uploadImageToStorage(galleryImageUri, { fileNamePrefix: 'gallery', maxDimension: 1600 });

      await supabase.from('business_gallery').insert({
        business_id: activeBusinessId, media_url: publicUrl, label: galleryLabel
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
    <TouchableOpacity 
      style={styles.bizCard}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('BusinessProfile', { business: item, session: session })}
    >
      {/* 1. NEW COVER PHOTO TOP SECTION */}
      {item.cover_photo_url && (
         <Image source={{ uri: item.cover_photo_url }} style={styles.cardCoverImage} />
      )}
      
      {/* 2. CARD HEADER OVERLAPPING */}
      <View style={[styles.cardHeader, item.cover_photo_url && styles.cardHeaderWithCover]}>
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
            {item._distanceKm != null && (
              <Text style={styles.distanceBadge}>· {formatDistance(item._distanceKm)}</Text>
            )}
          </View>
        </View>

        {session?.user?.id === item.creator_id && (
          <TouchableOpacity 
            style={{ padding: 4 }} 
            onPress={() => {
              Alert.alert("Manage Business", "What would you like to do?", [
                { text: "Cancel", style: "cancel" },
                { text: "Edit", onPress: () => setEditingBusiness(item) },
                { text: "Delete Listing", style: "destructive", onPress: () => handleDeleteBusiness(item.id) }
              ]);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.descriptionText} numberOfLines={3}>{item.description}</Text>
        {item.operating_hours && (
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#34C759" />
            <Text style={styles.detailText}><Text style={styles.boldText}>Hours:</Text> {item.operating_hours}</Text>
          </View>
        )}
      </View>

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
          {item.website_url && (
            <TouchableOpacity style={styles.iconButton} onPress={() => handleOpenLink(item.website_url.startsWith('http') ? item.website_url : `https://${item.website_url}`)}>
              <Ionicons name="globe-outline" size={18} color="#475569" />
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {session?.user?.id !== item.creator_id && (
        <View style={styles.cardFooter}>
          <TouchableOpacity 
            style={styles.messageButton}
            onPress={() => navigation.navigate('Inbox', {
              sellerId: item.creator_id,
              sellerName: item.name,
              sellerAvatar: item.logo_url || null,
              itemId: item.id,          // business id stored as item_id on the message
              itemTitle: item.name,     // shown as pre-fill text in the chat
              businessName: item.name,  // shown as the Biz context tag in the list
              session: session,
            })}
          >
            <Ionicons name="chatbubbles" size={20} color="#fff" />
            <Text style={styles.messageButtonText}>Chat with Business</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
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
        <ScopeToggle
          scope={scope}
          onChange={setScope}
          nearbyModeLabel={
            deviceLocationStatus === 'granted'
              ? 'Ranked by live distance'
              : myLocation
                ? `Showing results near ${myLocation} (enable location for live distance)`
                : 'Enable location access, or set your profile location'
          }
        />
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#94A3B8" style={styles.searchIcon} />
          <TextInput style={styles.searchInput} placeholder="Search businesses..." value={searchQuery} onChangeText={setSearchQuery} />
        </View>
        <CategoryPicker categories={filterCategories} selected={activeCategory} onSelect={setActiveCategory} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={businesses}
          keyExtractor={(item) => item.id}
          renderItem={renderBusinessCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={() => { setRefreshing(true); fetchBusinesses(); }}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMoreBusinesses}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator color="#34C759" style={{ marginVertical: 20 }} /> : undefined}
          ListEmptyComponent={
            scope === 'home' && !myLocation ? (
              <EmptyState
                icon="location-outline"
                title="Set your location on your profile to see businesses at home."
                actionLabel="Go to Profile"
                onAction={() => navigation.navigate('Profile', { session })}
              />
            ) : scope === 'nearby' && !deviceCoords && !myLocation ? (
              <EmptyState
                icon="navigate-outline"
                title="Enable location access, or set your profile location, to see nearby businesses."
              />
            ) : (
              <EmptyState
                icon="briefcase-outline"
                title={scope === 'home' ? `No businesses found at home in ${myLocation}.` : scope === 'nearby' ? 'No businesses found nearby.' : 'No businesses found.'}
              />
            )
          }
        />
      )}

      {/* REGISTRATION MODAL */}
      <ModalSheet visible={modalVisible} onClose={() => setModalVisible(false)} title="Register Business">
              {/* COVER PHOTO UPLOAD */}
              <TouchableOpacity 
                style={[styles.imageSelector, { width: '100%', height: 120, marginBottom: 16, borderRadius: 12 }]} 
                onPress={pickCoverPhoto}
              >
                {newBiz.coverPhotoUri ? (
                  <Image source={{ uri: newBiz.coverPhotoUri }} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={32} color="#94A3B8" />
                    <Text style={styles.imagePlaceholderText}>Upload Cover Photo</Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.imagePickerRow}>
                <TouchableOpacity style={styles.imageSelector} onPress={pickLogoImage}>
                  {newBiz.logoUri ? <Image source={{ uri: newBiz.logoUri }} style={styles.selectedLogo} /> : <><Ionicons name="image-outline" size={28} color="#94A3B8" /><Text style={styles.imagePlaceholderText}>Upload Logo</Text></>}
                </TouchableOpacity>
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <Text style={styles.inputLabel}>Business Name</Text>
                  <TextInput style={styles.inputField} placeholder="Company Name" value={newBiz.name} onChangeText={t => setNewBiz({...newBiz, name: t})} />
                </View>
              </View>

              {/* INTERACTIVE CATEGORY SELECTOR UX */}
              <Text style={styles.inputLabel}>Category</Text>
              <CategoryPicker
                categories={formCategories}
                selected={newBiz.category}
                onSelect={(cat) => setNewBiz({...newBiz, category: cat})}
                style={{ paddingHorizontal: 0, marginBottom: 16 }}
              />

              <Text style={styles.inputLabel}>Website (Optional)</Text>
              <TextInput style={styles.inputField} placeholder="www.example.com" keyboardType="url" autoCapitalize="none" value={newBiz.website_url} onChangeText={t => setNewBiz({...newBiz, website_url: t})} />

              <Text style={styles.inputLabel}>About</Text>
              <TextInput style={[styles.inputField, { height: 80, textAlignVertical: 'top' }]} multiline value={newBiz.description} onChangeText={t => setNewBiz({...newBiz, description: t})} />
              
              <View style={styles.halfInputRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Location</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput style={[styles.inputField, { flex: 1, marginRight: 8 }]} placeholder="e.g. Schweizer-Reneke" value={newBiz.location} onChangeText={t => setNewBiz({...newBiz, location: t})} />
                      <TouchableOpacity
                        style={styles.useLocationButton}
                        disabled={capturingLocation}
                        onPress={async () => {
                          const captured = await captureLocation();
                          if (captured) {
                            setNewBiz({ ...newBiz, location: captured.label, latitude: captured.latitude, longitude: captured.longitude });
                          }
                        }}
                      >
                        {capturingLocation ? <ActivityIndicator size="small" color="#34C759" /> : <Ionicons name="navigate" size={20} color="#34C759" />}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* NATIVE TIME PICKERS */}
                <Text style={styles.inputLabel}>Operating Hours</Text>
                <View style={styles.halfInputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Opening Time</Text>
                    {Platform.OS === 'ios' ? (
                      <View style={[styles.inputField, { justifyContent: 'center', alignItems: 'flex-start' }]}>
                         <DateTimePicker value={openTime} mode="time" display="default" onChange={(e, d) => d && setOpenTime(d)} />
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.inputField, { justifyContent: 'center' }]} onPress={() => setShowOpenPicker(true)}>
                        <Text style={{ color: '#1E293B' }}>{formatTime(openTime)}</Text>
                      </TouchableOpacity>
                    )}
                    {showOpenPicker && Platform.OS === 'android' && (
                      <DateTimePicker value={openTime} mode="time" display="default" onChange={(e, d) => { setShowOpenPicker(false); if (d) setOpenTime(d); }} />
                    )}
                  </View>

                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Closing Time</Text>
                    {Platform.OS === 'ios' ? (
                      <View style={[styles.inputField, { justifyContent: 'center', alignItems: 'flex-start' }]}>
                        <DateTimePicker value={closeTime} mode="time" display="default" onChange={(e, d) => d && setCloseTime(d)} />
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.inputField, { justifyContent: 'center' }]} onPress={() => setShowClosePicker(true)}>
                        <Text style={{ color: '#1E293B' }}>{formatTime(closeTime)}</Text>
                      </TouchableOpacity>
                    )}
                    {showClosePicker && Platform.OS === 'android' && (
                      <DateTimePicker value={closeTime} mode="time" display="default" onChange={(e, d) => { setShowClosePicker(false); if (d) setCloseTime(d); }} />
                    )}
                  </View>
                </View>
              <Text style={styles.sectionHeader}>Contact Details</Text>
              <View style={styles.halfInputRow}>
                <View style={{ flex: 1, marginRight: 8 }}><Text style={styles.inputLabel}>Phone</Text><TextInput style={styles.inputField} keyboardType="phone-pad" value={newBiz.contact_phone} onChangeText={t => setNewBiz({...newBiz, contact_phone: t})} /></View>
                <View style={{ flex: 1, marginLeft: 8 }}><Text style={styles.inputLabel}>WhatsApp</Text><TextInput style={styles.inputField} keyboardType="phone-pad" value={newBiz.whatsapp_number} onChangeText={t => setNewBiz({...newBiz, whatsapp_number: t})} /></View>
              </View>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput style={styles.inputField} keyboardType="email-address" value={newBiz.contact_email} onChangeText={t => setNewBiz({...newBiz, contact_email: t})} />
              <TouchableOpacity style={styles.publishButton} onPress={handleRegisterBusiness} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Register Business</Text>}
              </TouchableOpacity>
      </ModalSheet>

      {/* GALLERY UPLOAD MODAL (UX Wrapper applied) */}
      <ModalSheet
        visible={galleryModalVisible}
        onClose={() => { setGalleryModalVisible(false); setGalleryImageUri(null); }}
        title="Add to Portfolio"
      >
              <TouchableOpacity
                style={[styles.imageSelector, { height: 200, width: '100%', marginBottom: 16 }]}
                onPress={async () => {
                  const localUri = await pickImageHelper({ allowsEditing: false, quality: 0.7 });
                  if (localUri) setGalleryImageUri(localUri);
                }}
              >
                {galleryImageUri ? <Image source={{ uri: galleryImageUri }} style={styles.selectedLogo} /> : <Text style={styles.imagePlaceholderText}>Tap to select image</Text>}
              </TouchableOpacity>
              <Text style={styles.inputLabel}>Product Label (Optional)</Text>
              <TextInput style={styles.inputField} placeholder="e.g. Summer Shoes" value={galleryLabel} onChangeText={setGalleryLabel} />
              <TouchableOpacity style={styles.publishButton} onPress={handleAddGalleryItem} disabled={uploadingGallery || !galleryImageUri}>
                {uploadingGallery ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Upload Image</Text>}
              </TouchableOpacity>
      </ModalSheet>

      {editingBusiness && (
        <EditBusinessModalScreen
          visible={!!editingBusiness}
          business={editingBusiness}
          onClose={() => setEditingBusiness(null)}
          onUpdate={fetchBusinesses}
        />
      )}
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
  
  bizCard: { backgroundColor: '#fff', borderRadius: 20, marginBottom: 20, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  cardCoverImage: { width: '100%', height: 120, resizeMode: 'cover' },
  cardHeader: { flexDirection: 'row', padding: 16, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  cardHeaderWithCover: { paddingTop: 8 },
  bizLogo: { width: 60, height: 60, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: '#fff', marginTop: -30 }, // Overlaps the cover if cover exists
  logoPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F1F5F9', marginTop: 0 },
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
  useLocationButton: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  distanceBadge: { fontSize: 12, fontWeight: '700', color: '#34C759', marginLeft: 4 },
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