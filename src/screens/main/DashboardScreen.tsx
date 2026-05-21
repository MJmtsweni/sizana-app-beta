import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation, route }: any) {
  const session = route?.params?.session;

  return (
    <View style={styles.mainContainer}>
      
      {/* --- CLEAN TOP NAVIGATION PANEL (2-COLUMN) --- */}
      <View style={styles.navPanel}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text style={styles.navTitle}>Command Center</Text>
        </View>

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Inbox', { session: session })}
            style={styles.navIconButton}
          >
            <Ionicons name="mail" size={26} color="#34C759" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.subtitleText}>Here is your workspace overview</Text>
        </View>

        {/* --- CARD 1: EVENTS --- */}
        <TouchableOpacity 
          style={styles.dashboardCard} 
          activeOpacity={0.9} 
          onPress={() => navigation.navigate('Main', { screen: 'Events' })}
        >
          <View style={styles.cardImageContainer}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80' }} 
              style={styles.cardImage} 
            />
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

        {/* --- CARD 2: FORUMS --- */}
        <TouchableOpacity 
          style={styles.dashboardCard} 
          activeOpacity={0.9} 
          onPress={() => navigation.navigate('Main', { screen: 'Forums' })}
        >
          <View style={[styles.cardBody, { paddingTop: 20 }]}>
            <View style={styles.forumHeaderRow}>
              <Ionicons name="chatbubbles" size={24} color="#3B82F6" />
              <Text style={styles.forumMainTitle}>Your Active Forums</Text>
            </View>
            <Text style={styles.cardSubtitle}>New activity in your tracked communities.</Text>
            <View style={styles.tagsContainer}>
              <View style={styles.forumTag}><Text style={styles.forumTagText}>Livestock</Text></View>
              <View style={styles.forumTag}><Text style={styles.forumTagText}>Maize Trade</Text></View>
            </View>
            <View style={styles.cardActionRow}>
              <Text style={styles.actionText}>Jump to Forums</Text>
              <Ionicons name="arrow-forward" size={16} color="#34C759" />
            </View>
          </View>
        </TouchableOpacity>

        {/* --- CARD 3: BANKING --- */}
        <TouchableOpacity 
          style={styles.dashboardCard} 
          activeOpacity={0.9} 
          onPress={() => navigation.navigate('Main', { screen: 'Profile' })}
        >
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

        <View style={{ height: 100 }} /> {/* Extra space for the FAB */}
      </ScrollView>

      {/* --- BOTTOM CENTER DASHBOARD EXIT BUTTON --- */}
      <TouchableOpacity 
        style={styles.bottomCenterFab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Main', { screen: 'Buy & Sell' })}
      >
        <Ionicons name="grid" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  navPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
  navIconButton: { padding: 4 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  headerBlock: { marginBottom: 20, paddingHorizontal: 4 },
  greetingText: { fontSize: 28, fontWeight: '800', color: '#1E293B' },
  subtitleText: { fontSize: 16, color: '#64748B', fontWeight: '500' },
  
  dashboardCard: { 
    backgroundColor: '#fff', 
    borderRadius: 24, 
    marginBottom: 20, 
    overflow: 'hidden',
    borderWidth: 1, 
    borderColor: '#E2E8F0',
    elevation: 4, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 10 
  },
  cardImageContainer: { height: 140, width: '100%', backgroundColor: '#E2E8F0' },
  cardImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  dateOverlay: { position: 'absolute', top: 12, right: 12, backgroundColor: '#fff', borderRadius: 12, padding: 8, alignItems: 'center' },
  dateMonth: { fontSize: 10, fontWeight: '800', color: '#EF4444' },
  dateDay: { fontSize: 16, fontWeight: '900', color: '#1E293B' },
  cardBody: { padding: 16 },
  cardCategory: { fontSize: 11, fontWeight: '700', color: '#34C759', textTransform: 'uppercase' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginTop: 4 },
  cardSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  cardActionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  actionText: { fontSize: 14, fontWeight: '700', color: '#34C759', marginRight: 4 },
  forumHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  forumMainTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', marginLeft: 8 },
  tagsContainer: { flexDirection: 'row', marginTop: 10 },
  forumTag: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginRight: 8 },
  forumTagText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  bankingInfoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginTop: 10 },
  bankNameText: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  accountMaskText: { fontSize: 12, color: '#94A3B8' },

  // --- NEW BOTTOM CENTER FAB STYLING ---
  bottomCenterFab: {
    position: 'absolute',
    bottom: 40,               // Distance from bottom
    alignSelf: 'center',      // Perfectly centers horizontally
    backgroundColor: '#34C759',
    width: 70,
    height: 70,
    borderRadius: 35,         // Circular
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,             // Strong shadow for Android
    shadowColor: '#34C759',   // Green-tinted shadow for iOS
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  }
});