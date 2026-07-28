import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// Sizana has no GPS/lat-lng infrastructure — businesses, events, and forum
// posts all store location as a free-text town/area (e.g. "Ballito"), same
// as MarketScreen's location search. So "Near Me" is proxied by matching
// that text against the CURRENT user's own profile location, rather than
// true geo-distance. Given the small-town/township context this app is
// built for, matching by town name is a meaningful, honest signal — not a
// placeholder for "real" geolocation we intend to bolt on later.
export function useUserLocation(session: any) {
  const [myLocation, setMyLocation] = useState<string | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function fetchMyLocation() {
        if (!session?.user?.id) {
          setLoadingLocation(false);
          return;
        }
        setLoadingLocation(true);
        const { data } = await supabase
          .from('users')
          .select('location')
          .eq('id', session.user.id)
          .single();

        if (!cancelled) {
          setMyLocation(data?.location?.trim() || null);
          setLoadingLocation(false);
        }
      }

      fetchMyLocation();
      return () => { cancelled = true; };
    }, [session?.user?.id])
  );

  return { myLocation, loadingLocation };
}
