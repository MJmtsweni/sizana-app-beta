import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from './AppHeader';

function normalizeEvent(events: any) {
  if (!events) return null;
  return Array.isArray(events) ? events[0] : events;
}

export default function DashboardScreen({ navigation, route }: any) {
  const session = route?.params?.session;
  const insets = useSafeAreaInsets();

  // Extract display name natively from session
  const displayName = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'Member';

  const [followedTopics, setFollowedTopics] = useState<string[]>([]);
  const [loadingForums, setLoadingForums] = useState(true);
  const [featuredEvent, setFeaturedEvent] = useState<any>(null);
  const [unreadForumCount, setUnreadForumCount] = useState(0);
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

    async function fetchForumActivityCount() {
      try {
        // Look for unread comments/likes to give the hub actual aggregation value
        const { count } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', session.user.id)
          .eq('is_read', false)
          .in('type', ['comment', 'like']);
          
        setUnreadForumCount(count || 0);
      } catch (e: any) {
        console.error("Forum activity fetch error:", e.message);
      }
    }

    await Promise.all([fetchFollowedForums(), fetchDashboardEvent(), fetchForumActivityCount()]);
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
      <AppHeader session={session} variant="dashboard" title="My Hub" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#34C759']} tintColor="#34C759" />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.greetingText}>Welcome back, {displayName}!</Text>
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
              <View style={styles.forumHeaderLeft}>
                <Ionicons name="chatbubbles" size={24} color="#3B82F6" />
                <Text style={styles.forumMainTitle}>Your Active Forums</Text>
              </View>
              {unreadForumCount > 0 && (
                <View style={styles.badgeContainer}>
                  <Text style={styles.badgeText}>{unreadForumCount} New</Text>
                </View>
              )}
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

        {/* --- CARD 3: BILLING & PROFILE --- */}
        <TouchableOpacity style={styles.dashboardCard} activeOpacity={0.9} onPress={() => navigation.navigate('Main', { screen: 'Profile' })}>
          <View style={[styles.cardBody, { paddingTop: 20 }]}>
            <View style={styles.forumHeaderRow}>
              <View style={styles.forumHeaderLeft}>
                <Ionicons name="card" size={24} color="#8B5CF6" />
                <Text style={styles.forumMainTitle}>Billing & Account</Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>Manage your billing details, active subscriptions, and profile settings.</Text>
            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>Manage Account</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating exit button — Safe Area applied dynamically */}
      <View style={[styles.exitButtonContainer, { bottom: Math.max(insets.bottom, 20) + 10 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.exitButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('Main', { session })}
        >
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  exitButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  exitButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
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
  greetingText: { fontSize: 26, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
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
  cardSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4, marginBottom: 4, lineHeight: 20 },
  cardActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#34C759', marginRight: 4 },
  forumHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  forumHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  forumMainTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginLeft: 8 },
  badgeContainer: { backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  forumTag: { backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#BAE6FD' },
  forumTagText: { fontSize: 12, fontWeight: '700', color: '#0369A1' },
  emptyForumsText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
});