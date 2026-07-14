import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NotificationBell from './NotificationBell';
import MailIcon from './MailIcon';

type AppHeaderProps = {
  session: any;
  variant: 'main' | 'dashboard';
  title?: string;
  displayName?: string;
  avatarUri?: string | null;
};

export default function AppHeader({ session, variant, title, displayName, avatarUri }: AppHeaderProps) {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.navPanel}>
      {/* LEFT: Avatar only on Main, plain title on Dashboard. */}
      <View style={styles.leftSection}>
        {variant === 'main' ? (
          <View style={styles.userInfo}>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => navigation.navigate('Profile', { session })}
            >
              <View style={styles.avatarContainer}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person-circle" size={40} color="#ccc" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.navTitle} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
        )}
      </View>

      {/* RIGHT: bell + mail, identical everywhere. */}
      <View style={styles.rightSection}>
        <View style={{ marginRight: 16 }}>
          <NotificationBell session={session} />
        </View>
        <MailIcon session={session} />
      </View>

      {/* CENTER: grid button, absolutely positioned relative to the whole panel
          so it stays visually centered no matter how wide the left/right content is. */}
      {variant === 'main' && (
        <View style={styles.centerOverlay}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Dashboard', { session })}
            style={styles.gridButton}
          >
            <Ionicons name="grid" size={28} color="#34C759" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  navPanel: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightSection: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  centerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 15,
    pointerEvents: 'box-none',
  },
  gridButton: { 
    padding: 4, 
    pointerEvents: 'auto' 
  },
  userInfo: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  avatarContainer: { 
    marginRight: 10 
  },
  avatarImage: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#ccc', 
    backgroundColor: '#eee' 
  },
  navTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#1E293B' 
  },
});