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
      {/* LEFT: avatar+name on Main, plain title on Dashboard.
          flex:1 + minWidth:0 lets this shrink instead of pushing the
          absolutely-centered grid button off-center when the name is long. */}
      <View style={styles.leftSection}>
        {variant === 'main' ? (
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-circle" size={40} color="#ccc" />
              )}
            </View>
            <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">
              {displayName}
            </Text>
          </View>
        ) : (
          <Text style={styles.navTitle} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
        )}
      </View>

      {/* RIGHT: bell + mail, identical everywhere. Fixed content, never shrinks,
          so its width is predictable and doesn't factor into centering math. */}
      <View style={styles.rightSection}>
        <View style={{ marginRight: 16 }}>
          <NotificationBell session={session} />
        </View>
        <MailIcon session={session} />
      </View>

      {/* CENTER: grid button, absolutely positioned relative to the whole panel
          so it stays visually centered no matter how wide the left/right
          content is. Only shown on Main — Dashboard exits via its own
          floating button on-screen instead. */}
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
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    // reserve space so long names truncate before reaching the centered button
    paddingRight: 48,
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
  gridButton: { padding: 4, pointerEvents: 'auto' },
  userInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { marginRight: 10 },
  avatarImage: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#eee' },
  userName: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '600', color: '#333' },
  navTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B' },
});
