import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

type Coords = { latitude: number; longitude: number };
type Status = 'loading' | 'granted' | 'denied' | 'unavailable';

// Live device location for the "Near Me" tab — watches position (not a single
// GPS snapshot) so results actually update as the user moves, per the request
// that Near Me behave like its name implies.
export function useDeviceLocation(): { coords: Coords | null; status: Status } {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (permStatus !== 'granted') {
          setStatus('denied');
          return;
        }

        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 15000, distanceInterval: 100 },
          (loc) => {
            setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            setStatus('granted');
          }
        );

        if (cancelled) {
          sub.remove();
        } else {
          subscriptionRef.current = sub;
        }
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    }

    start();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
    };
  }, []);

  return { coords, status };
}