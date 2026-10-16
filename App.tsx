import * as Linking from 'expo-linking';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useState, useCallback } from 'react';
import { LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import AnimatedSplash from './src/components/AnimatedSplash';

// Keep the native splash (static, per app.json) up until we know whether
// there's a session — prevents a flash of blank white before auth resolves.
SplashScreen.preventAutoHideAsync().catch(() => {});
import { NavigationContainer, useNavigation, LinkingOptions, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BusinessProfileScreen from './src/screens/main/BusinessProfileScreen';
import FriendsScreen from './src/screens/main/FriendsScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import CompleteProfileScreen from './src/screens/auth/CompleteProfileScreen';
import PublicProfileScreen from './src/screens/main/PublicProfileScreen';
import AppHeader from './src/screens/main/AppHeader';
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
import InboxScreen from './src/screens/main/InboxScreen';
import ThreadScreen from './src/screens/main/ThreadScreen';
import NotificationsScreen from './src/screens/main/NotificationsScreen';
import EventDetailScreen from './src/screens/main/EventDetailScreen';
import { useAppFonts, colors } from './src/theme';
import { ToastProvider, useToast, OfflineBanner } from './src/components/ui';
import { registerAndSavePushToken, addNotificationListeners } from './src/lib/notifications';
import { playNotificationSound } from './src/lib/sound';
import { haptics } from './src/lib/haptics';
import { withRetry } from './src/lib/network';

const ProfileScreen = ProfileScreenDefault as React.ComponentType<any>;

LogBox.ignoreAllLogs();

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ session }: any) {
  const navigation = useNavigation<any>();
  const [userRecord, setUserRecord] = useState<any>(null);

  // PROFILE LOAD — only concern left here; unread badges now live inside AppHeader
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
  }, [session?.user?.id]);

  const displayName = userRecord?.username || session?.user?.email || "User";
  const avatarUri = userRecord?.avatar_url || null;

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => haptics.selection(),
      }}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: any;
          if (route.name === 'Market') iconName = 'pricetag';
          else if (route.name === 'Forums') iconName = 'chatbubbles';
          else if (route.name === 'Business') iconName = 'briefcase';
          else if (route.name === 'Events') iconName = 'calendar';
          else if (route.name === 'Profile') iconName = 'person';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textTertiary,
        headerShown: route.name !== 'Profile',
        header: () => <AppHeader session={session} variant="main" displayName={displayName} avatarUri={avatarUri} />,
      })}
    >
      <Tab.Screen
        name="Market"
        component={MarketScreen}
        initialParams={{ session: session }}
      />
      <Tab.Screen name="Business" component={BusinessScreen} initialParams={{ session: session }} />
      <Tab.Screen name="Events" component={EventsScreen} initialParams={{ session: session }} />
      <Tab.Screen name="Forums" component={ForumsScreen} initialParams={{ session: session }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ session: session }}/>
    </Tab.Navigator>
  );
}

// Define the deep linking prefixes and routing map
const prefix = Linking.createURL('/');

const linking: LinkingOptions<any> = {
  prefixes: [prefix, 'sizana://', 'https://sizana.com'],
  config: {
    screens: {
      Main: {
        screens: {
          'Market': 'market',
          'Forums': 'forums',
          'Business': 'business',
          'Events': 'events',
          'Profile': 'profile',
        },
      },
      Inbox: 'inbox',
      Thread: 'thread/:id',
      Notifications: 'notifications',
      EventDetail: 'event/:id',
    },
  },
};

const navigationRef = createNavigationContainerRef<any>();

function NotificationBridge({ session }: { session: Session | null }) {
  const { show } = useToast();

  // Register (or refresh) this device's push token whenever a session
  // becomes available — no-ops safely if push isn't configured yet (see
  // src/lib/notifications.ts).
  useEffect(() => {
    if (!session?.user?.id) return;
    registerAndSavePushToken(session.user.id);
  }, [session?.user?.id]);

  // Foreground: surface a toast + sound instead of relying on the OS banner,
  // which some Android OEMs suppress while the app is focused. Tapping a
  // notification (foreground or from the tray) deep-links to the Notifications screen.
  useEffect(() => {
    const remove = addNotificationListeners({
      onReceived: (notification) => {
        const title = notification.request.content.title || 'New notification';
        show({ message: title, type: 'info' });
        playNotificationSound();
      },
      onResponse: () => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Notifications', { session });
        }
      },
    });
    return remove;
  }, [session, show]);

  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  // Which user's profile has been checked for onboarding, and whether that
  // user still needs CompleteProfileScreen (null = no onboarding needed).
  const [profileCheckedFor, setProfileCheckedFor] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState<{ username: string } | null>(null);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const fontsLoaded = useAppFonts();

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Boot-time call — worth a couple of retries so a flaky connection
        // during app launch doesn't drop straight to the logged-out screen.
        const { data: { session } } = await withRetry(() => supabase.auth.getSession());
        setSession(session);
      } finally {
        setAuthResolved(true);
      }
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

  // Google/Apple sign-ups create the account before we know the user's
  // regions and interests (email sign-up collects them in its wizard), so
  // route them through CompleteProfileScreen until those are filled in.
  // Email users are never redirected, and a failed lookup never blocks
  // entry — worst case the user fills it in later from their profile.
  const userId = session?.user?.id ?? null;
  const provider = session?.user?.app_metadata?.provider;
  useEffect(() => {
    if (!userId) {
      setOnboarding(null);
      setProfileCheckedFor(null);
      return;
    }
    if (!provider || provider === 'email') {
      setOnboarding(null);
      setProfileCheckedFor(userId);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await withRetry(() =>
          supabase.from('users').select('username, regions, interests').eq('id', userId).single()
        );
        if (cancelled) return;
        const incomplete = data && (!data.regions?.length || !data.interests?.length);
        setOnboarding(incomplete ? { username: data.username || '' } : null);
      } catch {
        if (!cancelled) setOnboarding(null);
      } finally {
        if (!cancelled) setProfileCheckedFor(userId);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, provider]);

  const profileResolved = !userId || profileCheckedFor === userId;

  // The moment auth is resolved, hand off from the native splash to our
  // AnimatedSplash — it renders on top of the same blank frame, so there's
  // no flash of empty white in between the two.
  useEffect(() => {
    if (authResolved && fontsLoaded && profileResolved) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [authResolved, fontsLoaded, profileResolved]);

  const handleAnimationFinish = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  if (!authResolved || !fontsLoaded || !profileResolved) {
    return null; // native splash is still showing — nothing to render yet
  }

  if (showAnimatedSplash) {
    return <AnimatedSplash onFinish={handleAnimationFinish} />;
  }

  return (
    <ToastProvider>
      <OfflineBanner />
      <NotificationBridge session={session} />
      <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Dashboard">
        {session && session.user && onboarding ? (
          <Stack.Screen name="CompleteProfile">
            {() => (
              <CompleteProfileScreen
                session={session}
                initialUsername={onboarding.username}
                onComplete={() => setOnboarding(null)}
              />
            )}
          </Stack.Screen>
        ) : session && session.user ? (
          <>
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              initialParams={{ session: session }}
              options={{ headerShown: false }}
            />

            <Stack.Screen name="Main">
              {(props) => <MainTabs {...props} session={session} />}
            </Stack.Screen>

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

            <Stack.Screen
              name="EventDetail"
              component={EventDetailScreen}
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

            <Stack.Screen name="Friends" component={FriendsScreen} options={{ headerShown: false }} 
/>

            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="PublicProfile" component={PublicProfileScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>
      </NavigationContainer>
    </ToastProvider>
  );
}