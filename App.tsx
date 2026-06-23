import * as Linking from 'expo-linking';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useState, useCallback } from 'react';
import { LogBox, View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'; 
import { NavigationContainer, useNavigation, useIsFocused, useFocusEffect, LinkingOptions } from '@react-navigation/native'; 
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BusinessProfileScreen from './src/screens/main/BusinessProfileScreen';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/lib/supabase';
import { Session } from '@supabase/supabase-js';

import DashboardScreen from './src/screens/main/DashboardScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import MarketScreen from './src/screens/main/MarketScreen';
import ForumsScreen from './src/screens/main/ForumsScreen';
import BusinessScreen from './src/screens/main/BusinessScreen';
import EventsScreen from './src/screens/main/EventsScreen';
import ProfileScreenDefault from './src/screens/main/ProfileScreen';
import ChatScreen from './src/screens/main/ChatScreen';
import InboxScreen from './src/screens/main/InboxScreen';
import ThreadScreen from './src/screens/main/ThreadScreen';
import NotificationsScreen from './src/screens/main/NotificationsScreen';
import EventDetailScreen from './src/screens/main/EventDetailScreen';

const ProfileScreen = ProfileScreenDefault as React.ComponentType<any>;

LogBox.ignoreAllLogs();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ session }: any) {
  console.log("DEBUG - User Metadata:", session?.user?.user_metadata);
  const navigation = useNavigation<any>();

  const [userRecord, setUserRecord] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);

  // 1. MEMOIZED FETCH — stable reference, only rebuilds on user ID change
  const fetchGlobalUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { count, error } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', session.user.id)
        .eq('is_read', false);

      if (error) throw error;

      setUnreadCount(count || 0);
    } catch (e) {
      console.error("Global badge fetch error:", e);
    }
  }, [session?.user?.id]);

  // 1.5 MEMOIZED NOTIFICATION CHECK
  const fetchNotificationStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', session.user.id)
        .eq('is_read', false);

      if (error) {
        // Catch silent DB rejections or RLS blocks gracefully
        console.warn("[Sizana] Notification Badge Warn:", error.message || "Silent DB rejection");
        return; 
      }
      
      setHasUnreadAlerts(count ? count > 0 : false);
    } catch (e) {
      console.warn("[Sizana] Network drop during notification badge fetch.");
    }
  }, [session?.user?.id]);

  // 2. FOCUS EFFECT — refetches badge count every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchGlobalUnreadCount();
      fetchNotificationStatus();
    }, [fetchGlobalUnreadCount, fetchNotificationStatus])
  );



  // 3. PROFILE LOAD + STABLE REALTIME CHANNEL — no navigation or isFocused in deps
  useEffect(() => {
    async function loadProfile() {
      if (!session?.user?.id) return;

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error("Database Query Error:", error.message);
      } else if (data) {
        setUserRecord(data);
      }
    }

    loadProfile();
    fetchGlobalUnreadCount();

    const globalInboxChannel = supabase
      .channel('global-header-badge')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${session.user.id}`, // row-level filter
        },
        () => {
          fetchGlobalUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(globalInboxChannel);
    };
  }, [session?.user?.id, fetchGlobalUnreadCount]); // removed isFocused and navigation

  const displayName = userRecord?.username || session?.user?.email || "User";
  const avatarUri = userRecord?.avatar_url || null;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: any;
          if (route.name === 'Buy & Sell') iconName = 'pricetag';
          else if (route.name === 'Forums') iconName = 'chatbubbles';
          else if (route.name === 'Business') iconName = 'briefcase';
          else if (route.name === 'Events') iconName = 'calendar';
          else if (route.name === 'Profile') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#34C759',
        tabBarInactiveTintColor: 'gray',

        headerShown: route.name !== 'Profile',
        header: () => (
  <View style={styles.navPanel}>
    {/* 1. Left Side: User Avatar & Name */}
    <View style={[styles.userInfo, { flex: 1, alignItems: 'flex-start' }]}>
      <View style={styles.avatarContainer}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person-circle" size={40} color="#ccc" />
        )}
      </View>
      <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
    </View>

    {/* 2. CENTER COLUMN: Dashboard Grid Icon */}
    <View style={{ flex: 1, alignItems: 'center' }}>
      {/* NEW DASHBOARD BUTTON */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Dashboard', { session: session })}
        style={{ padding: 4 }}
      >
        <Ionicons name="grid" size={28} color="#34C759" />
      </TouchableOpacity>
    </View>
      {/* 3. RIGHT COLUMN: Bell & Inbox */}
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>

        {/* NEW BELL ICON */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Notifications', { session: session })}
        style={[styles.inboxButton, { marginRight: 16 }]}
      >
       <View style={{ position: 'relative' }}>
      <Ionicons name="notifications" size={24} color="#34C759" />
      {/* THE RED DOT */}
      {hasUnreadAlerts && (
        <View style={styles.redDotBadge} pointerEvents="none">
        </View>
      )}
    </View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('Inbox', { session: session })}
        style={styles.inboxButton}
      >
        <View style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="mail" size={26} color="#34C759" />
          {unreadCount > 0 && (
            <View style={styles.iconBadgeContainer}>
              <Text style={styles.iconBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

    </View>
  </View>
),
      })}
    >
      <Tab.Screen
        name="Buy & Sell"
        component={MarketScreen}
        initialParams={{ session: session }}
      />
      <Tab.Screen name="Forums" component={ForumsScreen} initialParams={{ session: session }} />
      <Tab.Screen name="Business" component={BusinessScreen} initialParams={{ session: session }} />
      <Tab.Screen name="Events" component={EventsScreen} initialParams={{ session: session }} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        initialParams={{ session: session }}
      />
    </Tab.Navigator>
  );
}

// Define the deep linking prefixes and routing map
const prefix = Linking.createURL('/');

const linking: LinkingOptions<any> = {
  prefixes: [prefix, 'sizana://', 'https://sizana.com'],
  config: {
    screens: {
      // 1. Map to your main tabs
      Main: {
        screens: {
          'Buy & Sell': 'market',
          Forums: 'forums',
          Business: 'business',
          Events: 'events',
          Profile: 'profile',
        },
      },
      // 2. Map to specific detail screens inside your Stack
      Inbox: 'inbox',
      Thread: 'thread/:id',
      Notifications: 'notifications',
      
      // 3. THE EVENT INVITE LINK
      // This tells the app: "If a URL looks like sizana://event/ABC, 
      // extract 'ABC' as an 'id' parameter and open the EventDetail screen."
      EventDetail: 'event/:id', 
    },
  },
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  return (
    <NavigationContainer linking={linking}>
  <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Dashboard">
    {session && session.user ? (
      <>
        {/* --- NEW: DASHBOARD LANDING PAGE --- */}
        <Stack.Screen 
          name="Dashboard" 
          component={DashboardScreen} 
          initialParams={{ session: session }}
          options={{ headerShown: false}} //title: 'Command Center' }} 
        />
        
        {/* --- EXISTING CORE NAVIGATION --- */}
        <Stack.Screen name="Main">
          {(props) => <MainTabs {...props} session={session} />}
        </Stack.Screen>
        
        <Stack.Screen 
          name="Chat" 
          component={ChatScreen} 
          options={({ route }: any) => ({ 
            headerShown: true, 
            title: route.params?.receiverName || 'Chat' 
          })}
        />
        
        <Stack.Screen 
          name="Inbox" 
          component={InboxScreen} 
          initialParams={{ session: session }}
          options={{ headerShown: true, title: 'My Messages' }} 
        />

        <Stack.Screen 
          name="Notifications" 
          component={NotificationsScreen} 
          initialParams={{ session: session }}
          options={{ headerShown: false }} 
        />

        {/* NEW: The landing page for Event Deep Links */}
        <Stack.Screen 
          name="EventDetail" 
          component={EventDetailScreen} // We will build this next!
          initialParams={{ session: session }}
          options={{ headerShown: false }} 
        />

        <Stack.Screen 
          name="Thread" 
          component={ThreadScreen} 
          initialParams={{ session: session }}
          options={{ headerShown: false }} 
        />

        <Stack.Screen 
          name="BusinessProfile" 
          component={BusinessProfileScreen} 
          initialParams={{ session: session }}
          options={{ headerShown: false }} 
        />
        
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </>
    ) : (
      <>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
      </>
    )}
  </Stack.Navigator>
</NavigationContainer>
  );
}

const styles = StyleSheet.create({
  navPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 50, 
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20, 
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#eee', 
  },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { marginRight: 10 },
  userName: { fontSize: 18, fontWeight: '600', color: '#333' },
  inboxButton: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  
  // --- STYLES FOR THE FLOATING RED ACTIVE TRACKING BADGE CONTAINER ---
  iconBadgeContainer: {
    position: 'absolute',
    right: -6,
    top: -4,
    backgroundColor: '#FF3B30', 
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff' // Crisp boundary outline accent separation pop layer
  },
  iconBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 14
  },
  redDotBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: '#fff'
  },
});