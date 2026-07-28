import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NotificationBell from './NotificationBell';
import MailIcon from './MailIcon';

// Adjust this path to wherever the asset actually lives relative to this file
const LOGO_MARK = require('../../../assets/sizana-navbar-icon.png');

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
      {/* LEFT: avatar only (Main) or title (Dashboard) — the logo no longer competes for this spot. */}
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
        <View style={{ marginRight: 0 }}>
          <MailIcon session={session} />
        </View>
        <NotificationBell session={session} />
      </View>

      {/* CENTER: the logo itself is the Dashboard shortcut — tap-the-logo-to-go-home
          is a well-understood convention, so this replaces the grid icon entirely
          rather than adding a second floating button elsewhere that would collide
          with each screen's own FAB (e.g. Market's "+ Sell"). */}
      {variant === 'main' && (
        <View style={styles.centerOverlay}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Dashboard', { session })}
            style={styles.logoButton}
            activeOpacity={0.75}
          >
            <View style={styles.logoStack}>
              <View style={styles.logoBadge}>
                <Image source={LOGO_MARK} style={styles.logoMark} />
              </View>
              <Ionicons name="chevron-down" size={11} color="#94A3B8" style={styles.logoChevron} />
            </View>
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
    marginBottom: 10,
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
  logoButton: {
    padding: 4,
    pointerEvents: 'auto',
    transform: [{ translateY: 25 }],
    zIndex: 10,
    elevation: 6,
  },
  logoStack: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 46,
    height: 46,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMark: {
    width: 46,
    height: 46,
    resizeMode: 'cover',
  },
  logoChevron: {
    marginTop: 1,
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