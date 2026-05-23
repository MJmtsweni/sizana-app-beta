import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';

export default function DashboardScreen({ navigation, route }: any) {
  const session = route?.params?.session;

  const [followedTopics, setFollowedTopics] = useState<string[]>([]);
  const [loadingForums, setLoadingForums] = useState(true);
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);

  // Re-fetch followed forum topics every time the user looks at the dashboard
  useFocusEffect(
    useCallback(() => {

      async function fetchDashboardEvent() {
  if (!session?.user?.id) return;
  try {
    // 1. Try to find an upcoming event the user RSVP'd to
    const { data: rsvpData, error: rsvpError } = await supabase
      .from('event_rsvps')
      .select('event_id, events(*)')
      .eq('user_id', session.user.id)
      .limit(1);

    if (rsvpData && rsvpData.length > 0 && rsvpData[0].events) {
      setFeaturedEvent(rsvpData[0].events);
      return;
    }

    // 2. Fallback: Get the most recent public event
    const { data: publicData, error: publicError } = await supabase
      .from('events')
      .select('*')
      .eq('is_private', false)
      .order('event_date', { ascending: true })
      .limit(1);

    if (publicData && publicData.length > 0) {
      setFeaturedEvent(publicData[0]);
    }
  } catch (e: any) {
    console.error("Dashboard event fetch error:", e.message);
  }
}
      
      // 1. Fetch Forums Logic
      async function fetchFollowedForums() {
        if (!session?.user?.id) return;
        try {
          setLoadingForums(true);
          const { data, error } = await supabase
            .from('forum_follows')
            .select(`
              post_id,
              forum_posts ( topic )
            `)
            .eq('user_id', session.user.id);

          if (error) throw error;

          if (data) {
            // Extract topics and remove duplicates using a Set
            const topicsArray = data
              .map((f: any) => f.forum_posts?.topic)
              .filter(Boolean);
            
            setFollowedTopics(Array.from(new Set(topicsArray)));
          }
        } catch (e: any) {
          console.error("Dashboard forum tracking fetch crash:", e.message);
        } finally {
          setLoadingForums(false);
        }
      }

      // 2. Check Alerts Logic
      async function checkUnreadAlerts() {
        if (!session?.user?.id) return;
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', session.user.id)
          .eq('is_read', false);
        
        setHasUnreadAlerts(count ? count > 0 : false);
      }

      // 3. Execute both functions
      fetchFollowedForums();
      checkUnreadAlerts();

    }, [session?.user?.id])
  );

  return (
    <View style={styles.mainContainer}>
      
      {/* TOP NAVIGATION PANEL */}
      <View style={styles.navPanel}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text style={styles.navTitle}>Command Center</Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>

        {/* BELL ICON */}
        <TouchableOpacity 
          onPress={() => navigation.navigate('Notifications', { session: session })}
          style={[styles.navIconButton, { marginRight: 12 }]}
        >
         <View style={{ position: 'relative' }}>
      <Ionicons name="notifications" size={24} color="#34C759" />
      {hasUnreadAlerts && (
        <View style={{
          position: 'absolute', top: -2, right: -2, width: 10, height: 10, 
          borderRadius: 5, backgroundColor: '#FF3B30', borderWidth: 1.5, borderColor: '#fff'
        }} />
      )}
    </View>
        </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => navigation.navigate('Inbox', { session: session })}
            style={styles.navIconButton}
          >
            <Ionicons name="mail" size={26} color="#34C759" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.subtitleText}>Here is your workspace overview</Text>
        </View>

        {/* --- CARD 1: EVENTS --- */}
        <TouchableOpacity style={styles.dashboardCard} activeOpacity={0.9} onPress={() => navigation.navigate('Main', { screen: 'Events' })}>
          <View style={styles.cardImageContainer}>
            <Image source={{ uri: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80' }} style={styles.cardImage} />
            <View style={styles.dateOverlay}>
              <Text style={styles.dateMonth}>OCT</Text>
              <Text style={styles.dateDay}>15</Text>
            </View>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardCategory}>Upcoming Event</Text>
            <Text style={styles.cardTitle}>Schweizer-Reneke Agri-Trade Fair</Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>View Event Details</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        {/* --- CARD 2: ACTIVE FORUMS (DYNAMICALLY BALANCED) --- */}
        <TouchableOpacity style={styles.dashboardCard} activeOpacity={0.9} onPress={() => navigation.navigate('Main', { screen: 'Forums' })}>
          <View style={[styles.cardBody, { paddingTop: 20 }]}>
            <View style={styles.forumHeaderRow}>
              <Ionicons name="chatbubbles" size={24} color="#3B82F6" />
              <Text style={styles.forumMainTitle}>Your Active Forums</Text>
            </View>
            <Text style={styles.cardSubtitle}>New activity in your tracked communities.</Text>
            
            {loadingForums ? (
              <ActivityIndicator color="#3B82F6" style={{ alignSelf: 'flex-start', marginTop: 12 }} />
            ) : followedTopics.length > 0 ? (
              <View style={styles.tagsContainer}>
                {followedTopics.map((topic, index) => (
                  <View key={index} style={styles.forumTag}>
                    <Text style={styles.forumTagText}>{topic}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyForumsText}>You aren't following any discussion lines yet. Tap follow on a forum post to prioritize it here!</Text>
            )}

            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>Jump to Forums</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        {/* --- CARD 3: BANKING --- */}
        <TouchableOpacity style={styles.dashboardCard} activeOpacity={0.9} onPress={() => navigation.navigate('Main', { screen: 'Profile' })}>
          <View style={[styles.cardBody, { paddingTop: 20 }]}>
            <View style={styles.forumHeaderRow}>
              <Ionicons name="wallet" size={24} color="#8B5CF6" />
              <Text style={styles.forumMainTitle}>Billing & Profile</Text>
            </View>
            <View style={styles.bankingInfoBox}>
              <Ionicons name="card" size={20} color="#475569" />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.bankNameText}>Standard Bank</Text>
                <Text style={styles.accountMaskText}>Verified •••• 4092</Text>
              </View>
            </View>
            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>Manage Profile</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* BOTTOM CENTER FAB */}
      <TouchableOpacity style={styles.bottomCenterFab} activeOpacity={0.8} onPress={() => navigation.navigate('Main', { screen: 'Buy & Sell' })}>
        <Ionicons name="grid" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  navPanel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 45, paddingBottom: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  navIconButton: { padding: 4 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  headerBlock: { marginBottom: 20, paddingHorizontal: 4 },
  greetingText: { fontSize: 28, fontWeight: '800', color: '#1E293B' },
  subtitleText: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  dashboardCard: { backgroundColor: '#fff', borderRadius: 24, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
  cardImageContainer: { height: 140, width: '100%', backgroundColor: '#E2E8F0' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  dateOverlay: { position: 'absolute', top: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, padding: 8, alignItems: 'center' },
  dateMonth: { fontSize: 10, fontWeight: '800', color: '#EF4444' },
  dateDay: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  cardBody: { padding: 16 },
  cardCategory: { fontSize: 11, fontWeight: '700', color: '#34C759', textTransform: 'uppercase' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 4 },
  cardSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4, marginBottom: 4 },
  cardActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#34C759', marginRight: 4 },
  forumHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  forumMainTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginLeft: 8 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  forumTag: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  forumTagText: { fontSize: 12, fontWeight: '700', color: '#0369A1' },
  emptyForumsText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
  bankingInfoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 10 },
  bankNameText: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  accountMaskText: { fontSize: 12, color: '#94A3B8' },
  bottomCenterFab: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#34C759', width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#34C759', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15 }
});

function setFeaturedEvent(events: any) {
  // Normalize input: accept either an array (from joined RSVP query) or a single event object
  if (!events) return null;
  const event = Array.isArray(events) ? events[0] : events;
  // Minimal side-effect: log for debugging and return the chosen event
  console.debug('setFeaturedEvent -> selected event:', event);
  return event;
}
