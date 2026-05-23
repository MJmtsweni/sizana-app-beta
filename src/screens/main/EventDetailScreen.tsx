import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EventDetailScreen({ route, navigation }: any) {
  // Catch the ID whether it comes from a deep link URL (route.params.id) or direct navigation
  const eventId = route.params?.id || route.params?.event?.id;
  const session = route.params?.session;
  const insets = useSafeAreaInsets();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAttending, setIsAttending] = useState(false);
  const [rsvpCount, setRsvpCount] = useState(0);

  useEffect(() => {
    if (eventId) fetchEventDetails();
  }, [eventId]);

  async function fetchEventDetails() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          creator:creator_id ( username, avatar_url ),
          rsvps:event_rsvps ( user_id )
        `)
        .eq('id', eventId)
        .single();

      if (error) throw error;

      if (data) {
        setEvent(data);
        setRsvpCount(data.rsvps ? data.rsvps.length : 0);
        setIsAttending(data.rsvps ? data.rsvps.some((r: any) => r.user_id === session?.user?.id) : false);
      }
    } catch (e: any) {
      Alert.alert('Event Not Found', 'This event may have been deleted or is unavailable.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  const toggleRSVP = async () => {
    if (!session?.user?.id) return;
    
    // Optimistic UI update
    const currentlyAttending = isAttending;
    setIsAttending(!currentlyAttending);
    setRsvpCount(prev => currentlyAttending ? prev - 1 : prev + 1);

    // Database sync
    if (currentlyAttending) {
      await supabase.from('event_rsvps').delete().match({ event_id: eventId, user_id: session.user.id });
    } else {
      await supabase.from('event_rsvps').insert({ event_id: eventId, user_id: session.user.id });
    }
  };

  const formatEventDate = (isoString: string) => {
    const d = new Date(isoString);
    const day = d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const time = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
    return { day, time };
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  if (!event) return null;

  const { day, time } = formatEventDate(event.event_date);

  return (
    <View style={styles.mainContainer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        
        {/* HERO BANNER */}
        <View style={styles.heroContainer}>
          {event.image_url ? (
            <Image source={{ uri: event.image_url }} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroImage, styles.placeholderBanner]}>
              <Ionicons name="calendar" size={60} color="#94A3B8" />
            </View>
          )}
          
          {/* FLOATING BACK BUTTON */}
          <TouchableOpacity 
            style={[styles.backButton, { top: Math.max(insets.top, 20) }]} 
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main')}
          >
            <Ionicons name="arrow-back" size={24} color="#1E293B" />
          </TouchableOpacity>
        </View>

        {/* CONTENT OVERLAP CARD */}
        <View style={styles.contentCard}>
          <View style={styles.headerRow}>
            <Text style={styles.categoryBadgeText}>{event.category}</Text>
            {event.is_private && (
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={12} color="#64748B" />
                <Text style={styles.privateBadgeText}>Private Invite</Text>
              </View>
            )}
          </View>

          <Text style={styles.eventTitle}>{event.title}</Text>

          {/* DATE & TIME INFO */}
          <View style={styles.infoBlock}>
            <View style={styles.iconBox}>
              <Ionicons name="calendar-outline" size={24} color="#34C759" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>{day}</Text>
              <Text style={styles.infoSubtitle}>{time}</Text>
            </View>
          </View>

          {/* LOCATION INFO */}
          <View style={styles.infoBlock}>
            <View style={styles.iconBox}>
              <Ionicons name="location-outline" size={24} color="#34C759" />
            </View>
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>{event.location}</Text>
              <Text style={styles.infoSubtitle}>Open in Maps</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* CREATOR INFO */}
          <View style={styles.creatorRow}>
            {event.creator?.avatar_url ? (
              <Image source={{ uri: event.creator.avatar_url }} style={styles.creatorAvatar} />
            ) : (
              <Ionicons name="person-circle" size={44} color="#CBD5E1" />
            )}
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.creatorName}>{event.creator?.username || 'Community Member'}</Text>
              <Text style={styles.creatorLabel}>Event Organizer</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* ABOUT SECTION */}
          <Text style={styles.sectionTitle}>About this Event</Text>
          <Text style={styles.descriptionText}>{event.description}</Text>

        </View>
      </ScrollView>

      {/* FIXED BOTTOM RSVP DOCK */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.attendeesContainer}>
          <Text style={styles.attendeesCount}>{rsvpCount}</Text>
          <Text style={styles.attendeesLabel}>Attending</Text>
        </View>

        <TouchableOpacity 
          style={[styles.rsvpButton, isAttending && styles.rsvpButtonActive]}
          onPress={toggleRSVP}
          activeOpacity={0.8}
        >
          <Text style={[styles.rsvpText, isAttending && styles.rsvpTextActive]}>
            {isAttending ? 'You are going!' : 'RSVP Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  heroContainer: { width: '100%', height: 300, position: 'relative' },
  heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholderBanner: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  backButton: { position: 'absolute', left: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  
  contentCard: { backgroundColor: '#F8FAFC', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -30, padding: 24, minHeight: 500 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  categoryBadgeText: { fontSize: 12, fontWeight: '800', color: '#3B82F6', textTransform: 'uppercase' },
  privateBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  privateBadgeText: { fontSize: 11, fontWeight: '700', color: '#64748B', marginLeft: 6 },
  
  eventTitle: { fontSize: 26, fontWeight: '800', color: '#1E293B', marginBottom: 24 },
  
  infoBlock: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  iconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#F0FDF4', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  infoTextContainer: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  infoSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2, fontWeight: '500' },
  
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 24 },
  
  creatorRow: { flexDirection: 'row', alignItems: 'center' },
  creatorAvatar: { width: 44, height: 44, borderRadius: 22 },
  creatorName: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  creatorLabel: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginBottom: 12 },
  descriptionText: { fontSize: 15, color: '#475569', lineHeight: 24 },

  bottomDock: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 10 },
  attendeesContainer: { flex: 1 },
  attendeesCount: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
  attendeesLabel: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  
  rsvpButton: { flex: 2, backgroundColor: '#F1F5F9', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  rsvpButtonActive: { backgroundColor: '#34C759' },
  rsvpText: { fontSize: 16, fontWeight: '800', color: '#64748B' },
  rsvpTextActive: { color: '#fff' },
});