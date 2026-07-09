import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

export default function NotificationBell({ session }: { session: any }) {
  const navigation = useNavigation<any>();
  const [unreadCount, setUnreadCount] = useState(0);
  // AppHeader renders on every screen, so more than one NotificationBell can be
  // mounted at once (e.g. a previous screen still alive underneath in the stack).
  // A fixed channel name would make the second instance reuse an already-subscribed
  // channel and crash when calling .on() after .subscribe(). Give each mounted
  // instance its own topic so they never collide.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  // Lifted out so both the realtime effect and the focus effect can call it
  const fetchUnreadCount = useCallback(async () => {
    if (!session?.user?.id) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', session.user.id)
      .eq('is_read', false);
    setUnreadCount(count || 0);
  }, [session?.user?.id]);

  // Realtime — catches live updates while the bell is mounted
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUnreadCount();

    const channel = supabase
      .channel(`global-bell-${session.user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `receiver_id=eq.${session.user.id}`
      }, () => fetchUnreadCount())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, fetchUnreadCount]);

  // Focus fallback — catches anything the realtime event missed
  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => navigation.navigate('Notifications', { session })}
    >
      <Ionicons name="notifications-outline" size={26} color="#34C759" />
      {unreadCount > 0 && <View style={styles.badge} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    padding: 8,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});