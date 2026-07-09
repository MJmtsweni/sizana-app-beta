import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import AppHeader from './AppHeader';

function normalizeEvent(events: any) {
  if (!events) return null;
  return Array.isArray(events) ? events[0] : events;
}

export default function DashboardScreen({ navigation, route }: any) {
  const session = route?.params?.session;

  const [followedTopics, setFollowedTopics] = useState<string[]>([]);
  const [loadingForums, setLoadingForums] = useState(true);
  const [featuredEvent, setFeaturedEvent] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboardData = useCallback(async () => {
    if (!session?.user?.id) return;

    async function fetchDashboardEvent() {
      try {
        const { data: rsvpData } = await supabase
          .from('event_rsvps')
          .select('event_id, events(*)')
          .eq('user_id', session.user.id)
          .limit(1);

        if (rsvpData?.length && rsvpData[0].events) {
          setFeaturedEvent(normalizeEvent(rsvpData[0].events));
          return;
        }

        const { data: publicData } = await supabase
          .from('events')
          .select('*')
          .eq('is_private', false)
          .order('event_date', { ascending: true })
          .limit(1);

        if (publicData?.length) setFeaturedEvent(normalizeEvent(publicData[0]));
      } catch (e: any) {
        console.error("Dashboard event fetch error:", e.message);
      }
    }

    async function fetchFollowedForums() {
      try {
        setLoadingForums(true);
        const { data, error } = await supabase
          .from('forum_follows')
          .select(`post_id, forum_posts ( topic )`)
          .eq('user_id', session.user.id);

        if (error) throw error;

        if (data) {
          const topicsArray = data.map((f: any) => f.forum_posts?.topic).filter(Boolean);
          setFollowedTopics(Array.from(new Set(topicsArray)));
        }
      } catch (e: any) {
        console.error("Dashboard forum tracking fetch crash:", e.message);
      } finally {
        setLoadingForums(false);
      }
    }

    await Promise.all([fetchFollowedForums(), fetchDashboardEvent()]);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  return (
    <View style={styles.mainContainer}>
      <AppHeader session={session} variant="dashboard" title="Command Center" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#34C759']} tintColor="#34C759" />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.subtitleText}>Here is your workspace overview</Text>
        </View>

        {/* --- CARD 1: EVENTS --- */}
        <TouchableOpacity style={styles.dashboardCard} activeOpacity={0.9} onPress={() => navigation.navigate('Main', { screen: 'Events' })}>
          <View style={styles.cardImageContainer}>
            <Image source={{ uri: featuredEvent?.image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80' }} style={styles.cardImage} />
            {featuredEvent?.event_date && (
              <View style={styles.dateOverlay}>
                <Text style={styles.dateMonth}>
                  {new Date(featuredEvent.event_date).toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase()}
                </Text>
                <Text style={styles.dateDay}>{new Date(featuredEvent.event_date).getDate()}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardCategory}>{featuredEvent ? 'Upcoming Event' : 'Nothing on your radar yet'}</Text>
            <Text style={styles.cardTitle}>{featuredEvent?.title || 'Browse what\'s happening nearby'}</Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>{featuredEvent ? 'View Event Details' : 'Explore Events'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        {/* --- CARD 2: ACTIVE FORUMS --- */}
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

        {/* --- CARD 3: BANKING (left as-is, pending stakeholder input) --- */}
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

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Floating exit button — mirrors the grid button in the main header,
          so the same icon means "toggle Dashboard" in both directions. */}
      <View style={styles.exitButtonContainer} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.exitButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Main', { session })}
        >
          <Ionicons name="grid" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  exitButtonContainer: {
    position: 'absolute',
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  exitButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },
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
});