import * as Linking from 'expo-linking';
import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, ScrollView, Switch, Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

export default function EventsScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Upcoming');

  const [showFilters, setShowFilters] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCategory, setSearchCategory] = useState('All');
  const [searchDate, setSearchDate] = useState('');

  // Creation Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('Schweizer-Reneke');
  const [newCategory, setNewCategory] = useState('Community');
  const [newDate, setNewDate] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [uploading, setUploading] = useState(false);

  const eventCategories = ['All', 'Agriculture', 'Tech & IT', 'Business', 'Entertainment', 'Community'];
  const creationCategories = ['Community', 'Agriculture', 'Tech & IT', 'Business', 'Entertainment'];

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [activeTab])
  );

  React.useEffect(() => {
    applyFilters();
  }, [searchLocation, searchCategory, searchDate, allEvents, activeTab]);

  async function fetchEvents() {
    try {
      if (!refreshing) setLoading(true);
      
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          creator:creator_id ( username, avatar_url ),
          rsvps:event_rsvps ( user_id )
        `)
        .order('event_date', { ascending: true });

      if (error) throw error;

      if (data) {
        const now = new Date();
        const formatted = data.map(ev => ({
          ...ev,
          rsvpCount: ev.rsvps ? ev.rsvps.length : 0,
          isAttending: ev.rsvps ? ev.rsvps.some((r: any) => r.user_id === session?.user?.id) : false,
          isPast: new Date(ev.event_date) < now
        }));
        setAllEvents(formatted);
      }
    } catch (e: any) {
      console.error("Events fetch error:", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const applyFilters = () => {
    const now = new Date();
    let result = [...allEvents];

    // PRIVACY FILTER: Hide private events unless I created it or I am already attending
    result = result.filter(e => 
      !e.is_private || e.creator_id === session?.user?.id || e.isAttending
    );

    if (activeTab === 'Upcoming') {
      result = result.filter(e => !e.isPast);
    } else if (activeTab === 'My RSVPs') {
      result = result.filter(e => e.isAttending);
    } else {
      result = result.filter(e => e.isPast);
    }

    if (searchLocation.trim()) {
      result = result.filter(e => e.location.toLowerCase().includes(searchLocation.toLowerCase()));
    }
    if (searchCategory !== 'All') {
      result = result.filter(e => e.category === searchCategory);
    }
    if (searchDate.trim()) {
      result = result.filter(e => e.event_date.startsWith(searchDate.trim()));
    }

    setFilteredEvents(result);
  };

  const clearFilters = () => {
    setSearchLocation('');
    setSearchCategory('All');
    setSearchDate('');
  };

  const toggleRSVP = async (eventId: string, currentlyAttending: boolean) => {
    setAllEvents(prev => prev.map(e => {
      if (e.id === eventId) {
        return { ...e, isAttending: !currentlyAttending, rsvpCount: currentlyAttending ? e.rsvpCount - 1 : e.rsvpCount + 1 };
      }
      return e;
    }));

    if (currentlyAttending) {
      await supabase.from('event_rsvps').delete().match({ event_id: eventId, user_id: session.user.id });
    } else {
      await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: session.user.id });
    }
  };

  const handleShareInvite = async (event: any) => {
    try {
      // Magic: Generates 'exp://.../--/event/123' in dev, and 'sizana://event/123' in production!
      const deepLink = Linking.createURL(`event/${event.id}`); 
      
      await Share.share({
        message: `You're invited to "${event.title}" on Sizana! Tap this link to RSVP and view details: \n\n${deepLink}`,
      });
    } catch (error: any) {
      console.error("Error sharing invite:", error.message);
    }
  };

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleCreateEvent() {
    if (!newTitle || !newDescription || !newDate || !newLocation) {
      Alert.alert('Missing Fields', 'Please fill out all event details.');
      return;
    }

    try {
      setUploading(true);
      let finalImageUrl = null;

      if (imageUri) {
        const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `event-${Date.now()}.${fileExt}`;
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const formData = new FormData();
        
        formData.append('file', { uri: imageUri, name: fileName, type: `image/${fileExt}` } as any);
        const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('Listings').getPublicUrl(fileName);
        finalImageUrl = publicUrl;
      }

      const eventDateObj = new Date(newDate);

      const { error } = await supabase.from('events').insert({
        creator_id: session.user.id,
        title: newTitle,
        description: newDescription,
        location: newLocation,
        category: newCategory,
        event_date: eventDateObj.toISOString(),
        image_url: finalImageUrl,
        is_private: isPrivate // <-- ADDED TO DB
      });

      if (error) throw error;

      setModalVisible(false);
      setNewTitle('');
      setNewDescription('');
      setNewDate('');
      setIsPrivate(false);
      setImageUri(null);
      fetchEvents();

    } catch (e: any) {
      Alert.alert('Creation Failed', e.message);
    } finally {
      setUploading(false);
    }
  }

  const formatEventDate = (isoString: string) => {
    const d = new Date(isoString);
    const day = d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    return { day, time };
  };

  const renderEventCard = ({ item }: { item: any }) => {
    const { day, time } = formatEventDate(item.event_date);
    
    return (
      <View style={styles.eventCard}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.eventBanner} />
        ) : (
          <View style={[styles.eventBanner, styles.placeholderBanner]}>
            <Ionicons name="calendar" size={40} color="#94A3B8" />
          </View>
        )}
        
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeMonth}>{new Date(item.event_date).toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase()}</Text>
          <Text style={styles.dateBadgeDay}>{new Date(item.event_date).getDate()}</Text>
        </View>

        <View style={styles.eventBody}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.categoryBadgeText}>{item.category}</Text>
            {item.is_private && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={10} color="#64748B" />
                <Text style={styles.privateBadgeText}>Private</Text>
              </View>
            )}
          </View>
          <Text style={styles.eventTitle}>{item.title}</Text>
          
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>{day} @ {time}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#64748B" />
            <Text style={styles.infoText}>{item.location}</Text>
          </View>

          <Text style={styles.eventDescription} numberOfLines={2}>{item.description}</Text>

          <View style={styles.actionRow}>
            <View style={styles.attendeesContainer}>
              <Ionicons name="people" size={18} color="#3B82F6" />
              <Text style={styles.attendeesText}>{item.rsvpCount} Attending</Text>
            </View>
            
            <View style={{ flexDirection: 'row' }}>
              {/* If it's a private event, show the Share Link button so the creator can invite people */}
              {item.is_private && (
                <TouchableOpacity style={styles.inviteButton} onPress={() => handleShareInvite(item)}>
                  <Ionicons name="share-social" size={18} color="#64748B" />
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[styles.rsvpButton, item.isAttending && styles.rsvpButtonActive]}
                onPress={() => toggleRSVP(item.id, item.isAttending)}
              >
                <Text style={[styles.rsvpText, item.isAttending && styles.rsvpTextActive]}>
                  {item.isAttending ? 'Going' : 'RSVP'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <View style={[styles.navPanel, { paddingTop: Math.max(insets.top, 45) }]}>
        <Text style={styles.navTitle}>Community Events</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={[styles.navIconButton, { marginRight: 10 }]}>
            <Ionicons name={showFilters ? "funnel" : "funnel-outline"} size={24} color="#34C759" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.navIconButton}>
            <Ionicons name="add-circle" size={28} color="#34C759" />
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTER EXPANDABLE VIEW */}
      {showFilters && (
        <View style={styles.filterTrayContainer}>
          <View style={styles.filterInputsRow}>
            <View style={[styles.searchBoxWrapper, { marginRight: 8 }]}>
              <Ionicons name="location-outline" size={16} color="#94A3B8" style={styles.searchIcon} />
              <TextInput style={styles.traySearchInput} placeholder="Filter Location..." value={searchLocation} onChangeText={setSearchLocation} placeholderTextColor="#94A3B8" />
            </View>
            <View style={styles.searchBoxWrapper}>
              <Ionicons name="calendar-outline" size={16} color="#94A3B8" style={styles.searchIcon} />
              <TextInput style={styles.traySearchInput} placeholder="YYYY-MM-DD" value={searchDate} onChangeText={setSearchDate} placeholderTextColor="#94A3B8" />
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 10 }}>
            {eventCategories.map(cat => (
              <TouchableOpacity key={cat} style={[styles.filterCategoryPill, searchCategory === cat && styles.filterCategoryPillActive]} onPress={() => setSearchCategory(cat)}>
                <Text style={[styles.filterCategoryText, searchCategory === cat && styles.filterCategoryTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {(searchLocation || searchCategory !== 'All' || searchDate) && (
            <TouchableOpacity style={styles.clearFilterLink} onPress={clearFilters}>
              <Text style={styles.clearFilterLinkText}>Clear Active Search Parameters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* TABS */}
      <View style={styles.tabContainer}>
        {['Upcoming', 'My RSVPs', 'Past'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !refreshing ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#34C759" /></View>
      ) : (
        <FlatList
          data={filteredEvents}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          onRefresh={() => { setRefreshing(true); fetchEvents(); }}
          refreshing={refreshing}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyLayout}>
              <Ionicons name="calendar-clear-outline" size={60} color="#CBD5E1" />
              <Text style={styles.emptyText}>No events match your criteria.</Text>
            </View>
          }
        />
      )}

      {/* CREATE EVENT MODAL */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Host an Event</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close-circle" size={28} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.imageSelector} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.selectedImage} />
                ) : (
                  <>
                    <Ionicons name="camera" size={32} color="#94A3B8" />
                    <Text style={styles.imagePlaceholderText}>Add Event Banner</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.inputLabel}>Event Title</Text>
              <TextInput style={styles.inputField} placeholder="e.g. Secret Dinner Party" value={newTitle} onChangeText={setNewTitle} />
              
              <Text style={styles.inputLabel}>Event Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ marginBottom: 16 }}>
                {creationCategories.map(cat => (
                  <TouchableOpacity key={cat} style={[styles.creationPill, newCategory === cat && styles.creationPillActive]} onPress={() => setNewCategory(cat)}>
                    <Text style={[styles.creationPillText, newCategory === cat && styles.creationPillTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* NEW: PRIVATE EVENT TOGGLE */}
              <View style={styles.privacyToggleRow}>
                <View>
                  <Text style={styles.privacyToggleTitle}>Private Event</Text>
                  <Text style={styles.privacyToggleSubtitle}>Hide from public feed. Invite via link only.</Text>
                </View>
                <Switch 
                  value={isPrivate} 
                  onValueChange={setIsPrivate} 
                  trackColor={{ false: '#E2E8F0', true: '#34C759' }}
                  thumbColor="#fff"
                />
              </View>

              <Text style={styles.inputLabel}>Date & Time</Text>
              <TextInput style={styles.inputField} placeholder="YYYY-MM-DD HH:MM (e.g. 2026-10-15 14:00)" value={newDate} onChangeText={setNewDate} />

              <Text style={styles.inputLabel}>Location</Text>
              <TextInput style={styles.inputField} placeholder="Venue or Address" value={newLocation} onChangeText={setNewLocation} />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput style={[styles.inputField, { height: 100, textAlignVertical: 'top' }]} multiline placeholder="What should people know?" value={newDescription} onChangeText={setNewDescription} />

              <TouchableOpacity style={styles.publishButton} onPress={handleCreateEvent} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Publish Event</Text>}
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  navIconButton: { padding: 4 },
  
  filterTrayContainer: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  filterInputsRow: { flexDirection: 'row', marginBottom: 4 },
  searchBoxWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  traySearchInput: { flex: 1, height: 40, fontSize: 13, color: '#1E293B', fontWeight: '500' },
  filterCategoryPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  filterCategoryPillActive: { backgroundColor: '#34C759', borderColor: '#34C759' },
  filterCategoryText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterCategoryTextActive: { color: '#fff' },
  clearFilterLink: { alignSelf: 'center', marginTop: 6, padding: 4 },
  clearFilterLinkText: { fontSize: 12, color: '#EF4444', fontWeight: '700' },

  tabContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  tabButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F1F5F9', marginRight: 10 },
  tabButtonActive: { backgroundColor: '#1E293B' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#fff' },

  eventCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
  eventBanner: { width: '100%', height: 160, resizeMode: 'cover' },
  placeholderBanner: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  
  dateBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  dateBadgeMonth: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  dateBadgeDay: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  
  eventBody: { padding: 16 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoryBadgeText: { fontSize: 11, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase' },
  
  privateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  privateBadgeText: { fontSize: 10, fontWeight: '700', color: '#64748B', marginLeft: 4 },

  eventTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { fontSize: 14, fontWeight: '600', color: '#475569', marginLeft: 8 },
  eventDescription: { fontSize: 14, color: '#64748B', marginTop: 12, lineHeight: 20 },
  
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  attendeesContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  attendeesText: { fontSize: 13, fontWeight: '700', color: '#3B82F6', marginLeft: 6 },
  
  inviteButton: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 14, borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  rsvpButton: { backgroundColor: '#F1F5F9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  rsvpButtonActive: { backgroundColor: '#34C759' },
  rsvpText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  rsvpTextActive: { color: '#fff' },

  emptyLayout: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  
  imageSelector: { width: '100%', height: 140, backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  selectedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholderText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  
  privacyToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  privacyToggleTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  privacyToggleSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },

  inputLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 6, marginLeft: 4 },
  inputField: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: '#1E293B', marginBottom: 16 },
  
  creationPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, marginBottom: 4 },
  creationPillActive: { backgroundColor: '#3B82F6' },
  creationPillText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  creationPillTextActive: { color: '#fff' },

  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});