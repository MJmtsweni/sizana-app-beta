import React, { useEffect, useState, useCallback, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

export default function MailIcon({ session }: { session: any }) {
  const navigation = useNavigation<any>();
  const [hasUnread, setHasUnread] = useState(false);
  // Same reasoning as NotificationBell: AppHeader can have more than one instance
  // mounted at once, so give each one its own channel topic to avoid colliding
  // with an already-subscribed channel of the same name.
  const instanceIdRef = useRef(Math.random().toString(36).slice(2));

  const fetchUnread = useCallback(async () => {
    if (!session?.user?.id) return;
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', session.user.id)
      .eq('is_read', false);
    setHasUnread(!!count && count > 0);
  }, [session?.user?.id]);

  // Realtime — catches live changes while mounted
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUnread();

    const channel = supabase
      .channel(`global-mail-${session.user.id}-${instanceIdRef.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${session.user.id}`
      }, () => fetchUnread())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, fetchUnread]);

  // Focus fallback — catches anything realtime missed
  useFocusEffect(
    useCallback(() => {
      fetchUnread();
    }, [fetchUnread])
  );

  return (
    <TouchableOpacity style={styles.container} onPress={() => navigation.navigate('Inbox', { session })}>
      <Ionicons name="mail" size={26} color="#34C759" />
      {hasUnread && <View style={styles.badge} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: 5, justifyContent: 'center', alignItems: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
});