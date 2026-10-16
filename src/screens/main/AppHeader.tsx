import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NotificationBell from './NotificationBell';
import MailIcon from './MailIcon';
import { colors, spacing, typography } from '../../theme';

// Adjust this path to wherever the asset actually lives relative to this file
const LOGO_MARK = require('../../../assets/brand/sizana-icon-512.png');

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
                  <Ionicons name="person-circle" size={40} color={colors.slate[300]} />
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
          <MailIcon session={session} />
        </View>
        <NotificationBell session={session} />
      </View>

      {/* CENTER: the logo is always present now — on Main it's the Dashboard
          shortcut (tap-the-logo-to-go-home); on Dashboard itself, tapping it
          goes back to Main, mirroring the floating exit button already on
          DashboardScreen. Brand mark stays visible on every screen either way. */}
      <View style={styles.centerOverlay}>
        <TouchableOpacity
          onPress={() =>
            variant === 'main'
              ? navigation.navigate('Dashboard', { session })
              : navigation.navigate('Main', { session })
          }
          style={styles.logoButton}
          activeOpacity={0.75}
        >
          <View style={styles.logoStack}>
            <View style={styles.logoBadge}>
              <Image source={LOGO_MARK} style={styles.logoMark} />
            </View>
            <Ionicons name="chevron-down" size={11} color={colors.textTertiary} style={styles.logoChevron} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navPanel: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: spacing.lg,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
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
    transform: [{ translateY: 8 }],
    zIndex: 10,
    elevation: 6,
  },
  logoStack: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: colors.brandSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoMark: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
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
    borderColor: colors.borderStrong,
    backgroundColor: colors.backgroundMuted
  },
  navTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
});