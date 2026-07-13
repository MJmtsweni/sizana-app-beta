import * as Linking from 'expo-linking';
import 'react-native-url-polyfill/auto';
import React, { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer, useNavigation, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import BusinessProfileScreen from './src/screens/main/BusinessProfileScreen';
import FriendsScreen from './src/screens/main/FriendsScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
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
        tabBarActiveTintColor: '#34C759',
        tabBarInactiveTintColor: 'gray',
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
  );
}