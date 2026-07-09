import * as Linking from 'expo-linking';
import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, 
  TextInput, Modal, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
  ScrollView, Switch, Share, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function EventsScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  const [eventDate, setEventDate] = useState(new Date());
  const [eventTime, setEventTime] = useState(new Date());

  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('Upcoming');

  const [showFilters, setShowFilters] = useState(false);
  const [searchLocation, setSearchLocation] = useState('');
  const [searchCategory, setSearchCategory] = useState('All');
  const [searchDate, setSearchDate] = useState('');

  // --- IDENTITY STATE ---
  const [ownedBusinesses, setOwnedBusinesses] = useState<any[]>([]);
  const [postingAsBusinessId, setPostingAsBusinessId] = useState<string | null>(null);

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

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDate = (date: Date) => date.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
      fetchUserBusinesses();
    }, [activeTab, session?.user?.id])
  );

  React.useEffect(() => {
    applyFilters();
  }, [searchLocation, searchCategory, searchDate, allEvents, activeTab]);

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
      console.warn("Failed to fetch owned businesses:", e.message);
    }
  }

  async function fetchEvents() {
    try {
      if (!refreshing) setLoading(true);
      
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          creator:creator_id ( username, avatar_url ),
          business:business_id ( name, logo_url ),
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
    let result = [...allEvents];

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

  // Now accepts the full event object so we can read creator_id for the notification
  const toggleRSVP = async (event: any, currentlyAttending: boolean) => {
    // Optimistic UI update
    setAllEvents(prev => prev.map(e => {
      if (e.id === event.id) {
        return {
          ...e,
          isAttending: !currentlyAttending,
          rsvpCount: currentlyAttending ? e.rsvpCount - 1 : e.rsvpCount + 1
        };
      }
      return e;
    }));

    if (currentlyAttending) {
      // Un-RSVP — just delete the record, no notification needed
      const { error } = await supabase
        .from('event_rsvps')
        .delete()
        .match({ event_id: event.id, user_id: session.user.id });

      if (error) {
        console.error('RSVP delete error:', error.message);
        // Revert on failure
        setAllEvents(prev => prev.map(e =>
          e.id === event.id ? { ...e, isAttending: true, rsvpCount: e.rsvpCount + 1 } : e
        ));
      }
    } else {
      // RSVP
      const { error: rsvpError } = await supabase
        .from('event_rsvps')
        .insert({ event_id: event.id, user_id: session.user.id });

      if (rsvpError) {
        console.error('RSVP insert error:', rsvpError.message);
        // Revert on failure
        setAllEvents(prev => prev.map(e =>
          e.id === event.id ? { ...e, isAttending: false, rsvpCount: e.rsvpCount - 1 } : e
        ));
        return;
      }

      // Notify the event creator — skip if the user is the creator
      if (event.creator_id && event.creator_id !== session.user.id) {
        const { error: notifError } = await supabase.from('notifications').insert({
          actor_id: session.user.id,    // Who RSVP'd
          receiver_id: event.creator_id, // Event creator gets notified
          type: 'rsvp',
          target_id: event.id,           // So we can navigate to the event later
          is_read: false,
        });
        if (notifError) console.error('RSVP notification error:', notifError.message);
      }
    }
  };

  const handleShareInvite = async (event: any) => {
    try {
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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handleCreateEvent() {
    if (!newTitle || !newDescription || !newLocation) {
      Alert.alert('Missing Fields', 'Please fill out all event details.');
      return;
    }

    const combinedDateTime = new Date(eventDate);
    combinedDateTime.setHours(eventTime.getHours(), eventTime.getMinutes(), 0, 0);

    if (combinedDateTime.getTime() < new Date().getTime()) {
      Alert.alert(
        "Invalid Schedule", 
        "You cannot schedule an event in the past. Please select a future date and time."
      );
      return; 
    }

    try {
      setUploading(true);
      let finalImageUrl = null;

      if (imageUri) {
        const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `event-${Date.now()}.${fileExt}`;
        const formData = new FormData();
        formData.append('file', { uri: imageUri, name: fileName, type: `image/${fileExt}` } as any);
        const { error: uploadError } = await supabase.storage.from('Listings').upload(fileName, formData);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('Listings').getPublicUrl(fileName);
        finalImageUrl = publicUrl;
      }

      const { error } = await supabase.from('events').insert({
        creator_id: session.user.id,
        business_id: postingAsBusinessId,
        title: newTitle,
        description: newDescription,
        location: newLocation,
        category: newCategory,
        image_url: finalImageUrl,
        event_date: combinedDateTime.toISOString(),
        is_private: isPrivate
      });

      if (error) throw error;

      setModalVisible(false);
      setNewTitle('');
      setNewDescription('');
      setNewDate('');
      setIsPrivate(false);
      setImageUri(null);
      setPostingAsBusinessId(null);
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
    const displayAvatar = item.business?.logo_url || item.creator?.avatar_url;
    const displayName = item.business?.name || item.creator?.username || 'Community Member';
    
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

          <View style={styles.hostRow}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.hostAvatar} />
            ) : (
              <Ionicons name={item.business ? "briefcase" : "person-circle"} size={20} color="#CBD5E1" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.hostName}>Hosted by {displayName}</Text>
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
              {item.is_private && (
                <TouchableOpacity style={styles.inviteButton} onPress={() => handleShareInvite(item)}>
                  <Ionicons name="share-social" size={18} color="#64748B" />
                </TouchableOpacity>
              )}
              
              {/* Pass the full item object, not just item.id */}
              <TouchableOpacity 
                style={[styles.rsvpButton, item.isAttending && styles.rsvpButtonActive]}
                onPress={() => toggleRSVP(item, item.isAttending)}
              >
                <Text style={[styles.rsvpText, item.isAttending && styles.rsvpTextActive]}>
                  {item.isAttending ? 'Going ✓' : 'RSVP'}
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalContent}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Host an Event</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close-circle" size={28} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
                
                {/* IDENTITY SELECTOR */}
                {ownedBusinesses.length > 0 && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Host As</Text>
                    <View style={{ height: 50 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <TouchableOpacity 
                          style={[styles.identityPill, postingAsBusinessId === null && styles.identityPillActive]}
                          onPress={() => setPostingAsBusinessId(null)}
                        >
                          <Ionicons name="person-circle" size={24} color={postingAsBusinessId === null ? "#34C759" : "#64748B"} />
                          <Text style={[styles.identityText, postingAsBusinessId === null && styles.identityTextActive]}>My Profile</Text>
                        </TouchableOpacity>
                        {ownedBusinesses.map((biz) => (
                          <TouchableOpacity 
                            key={biz.id}
                            style={[styles.identityPill, postingAsBusinessId === biz.id && styles.identityPillActive]}
                            onPress={() => setPostingAsBusinessId(biz.id)}
                          >
                            {biz.logo_url ? (
                              <Image source={{ uri: biz.logo_url }} style={{ width: 24, height: 24, borderRadius: 12 }} />
                            ) : (
                              <Ionicons name="briefcase" size={24} color={postingAsBusinessId === biz.id ? "#34C759" : "#64748B"} />
                            )}
                            <Text style={[styles.identityText, postingAsBusinessId === biz.id && styles.identityTextActive]}>
                              {biz.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                )}

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

                <Text style={styles.inputLabel}>Location</Text>
                <TextInput style={styles.inputField} placeholder="Venue or Address" value={newLocation} onChangeText={setNewLocation} />

                <Text style={styles.inputLabel}>Description</Text>
                <TextInput style={[styles.inputField, { height: 100, textAlignVertical: 'top' }]} multiline placeholder="What should people know?" value={newDescription} onChangeText={setNewDescription} />

                <Text style={styles.inputLabel}>Event Date & Time</Text>
                <View style={styles.halfInputRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Date</Text>
                    {Platform.OS === 'ios' ? (
                      <View style={[styles.inputField, { justifyContent: 'center', alignItems: 'flex-start' }]}>
                        <DateTimePicker value={eventDate} mode="date" display="default" onChange={(e, d) => d && setEventDate(d)} />
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.inputField, { justifyContent: 'center' }]} onPress={() => setShowDatePicker(true)}>
                        <Text style={{ color: '#1E293B' }}>{formatDate(eventDate)}</Text>
                      </TouchableOpacity>
                    )}
                    {showDatePicker && Platform.OS === 'android' && (
                      <DateTimePicker value={eventDate} mode="date" display="default" onChange={(e, d) => { setShowDatePicker(false); if (d) setEventDate(d); }} />
                    )}
                  </View>

                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Start Time</Text>
                    {Platform.OS === 'ios' ? (
                      <View style={[styles.inputField, { justifyContent: 'center', alignItems: 'flex-start' }]}>
                        <DateTimePicker value={eventTime} mode="time" display="default" onChange={(e, d) => d && setEventTime(d)} />
                      </View>
                    ) : (
                      <TouchableOpacity style={[styles.inputField, { justifyContent: 'center' }]} onPress={() => setShowTimePicker(true)}>
                        <Text style={{ color: '#1E293B' }}>{formatTime(eventTime)}</Text>
                      </TouchableOpacity>
                    )}
                    {showTimePicker && Platform.OS === 'android' && (
                      <DateTimePicker value={eventTime} mode="time" display="default" onChange={(e, d) => { setShowTimePicker(false); if (d) setEventTime(d); }} />
                    )}
                  </View>
                </View>

                <TouchableOpacity style={styles.publishButton} onPress={handleCreateEvent} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.publishButtonText}>Publish Event</Text>}
                </TouchableOpacity>
                <View style={{ height: 40 }} />
                
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navPanel: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 15,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0'
  },
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
  eventCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 20, overflow: 'hidden',
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8
  },
  eventBanner: { width: '100%', height: 160, resizeMode: 'cover' },
  placeholderBanner: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  dateBadge: {
    position: 'absolute', top: 12, right: 12, backgroundColor: '#fff',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3
  },
  dateBadgeMonth: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
  dateBadgeDay: { fontSize: 18, fontWeight: '900', color: '#1E293B' },
  eventBody: { padding: 16 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoryBadgeText: { fontSize: 11, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase' },
  privateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  privateBadgeText: { fontSize: 10, fontWeight: '700', color: '#64748B', marginLeft: 4 },
  hostRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hostAvatar: { width: 20, height: 20, borderRadius: 10, marginRight: 6 },
  hostName: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  eventTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { fontSize: 14, fontWeight: '600', color: '#475569', marginLeft: 8 },
  eventDescription: { fontSize: 14, color: '#64748B', marginTop: 12, lineHeight: 20 },
  actionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9'
  },
  attendeesContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12
  },
  attendeesText: { fontSize: 13, fontWeight: '700', color: '#3B82F6', marginLeft: 6 },
  inviteButton: {
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F8FAFC', paddingHorizontal: 14,
    borderRadius: 12, marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0'
  },
  rsvpButton: { backgroundColor: '#F1F5F9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  rsvpButtonActive: { backgroundColor: '#34C759' },
  rsvpText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  rsvpTextActive: { color: '#fff' },
  emptyLayout: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#94A3B8', fontSize: 14, fontWeight: '600', marginTop: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 28,
    borderTopRightRadius: 28, padding: 24, maxHeight: '90%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  imageSelector: {
    width: '100%', height: 140, backgroundColor: '#F8FAFC', borderRadius: 16,
    borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden'
  },
  selectedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholderText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', marginTop: 8 },
  privacyToggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0'
  },
  privacyToggleTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  privacyToggleSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },
  halfInputRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#64748B', marginBottom: 6, marginLeft: 4 },
  inputField: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: '#1E293B', marginBottom: 16
  },
  creationPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, marginBottom: 4 },
  creationPillActive: { backgroundColor: '#3B82F6' },
  creationPillText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  creationPillTextActive: { color: '#fff' },
  publishButton: { backgroundColor: '#34C759', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  publishButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  identityPill: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: '#F8FAFC', borderRadius: 20,
    marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0'
  },
  identityPillActive: { backgroundColor: '#F0FDF4', borderColor: '#34C759' },
  identityText: { fontSize: 14, fontWeight: '600', color: '#64748B', marginLeft: 8 },
  identityTextActive: { color: '#34C759' }
});
