import { useState } from 'react';
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export type CapturedLocation = { latitude: number; longitude: number; label: string };

// "Use My Current Location" for creation forms (business registration, event
// creation, forum posts). Captures device coordinates AND a human-readable
// place name via on-device reverse geocoding — free, no API key, since it
// uses the OS's native geocoder rather than a paid service.
export function useLocationCapture() {
  const [capturing, setCapturing] = useState(false);

  async function captureLocation(): Promise<CapturedLocation | null> {
    try {
      setCapturing(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Access Needed', 'Enable location access to use your current location.');
        return null;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = position.coords;

      let label = '';
      try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = results[0];
        label = [place?.city || place?.subregion || place?.district, place?.region]
          .filter(Boolean)
          .join(', ');
      } catch {
        // Reverse geocoding is best-effort — coordinates are still useful without a label.
      }

      return { latitude, longitude, label: label || 'Current Location' };
    } catch {
      Alert.alert('Location Error', 'Could not get your current location.');
      return null;
    } finally {
      setCapturing(false);
    }
  }

  return { capturing, captureLocation };
}