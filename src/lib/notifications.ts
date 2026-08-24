import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Foreground behavior: show the banner + play the sound even while the app
// is open, instead of the SDK default of suppressing it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const ANDROID_CHANNEL_ID = 'default';

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Sizana notifications',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 150, 100, 150],
    lightColor: '#34C759',
    sound: 'notification.wav',
  });
}

// projectId is required by getExpoPushTokenAsync once the app is built with
// EAS. Until this project is linked to an EAS project (`eas init`), this
// resolves to undefined and push-token retrieval below no-ops instead of
// throwing, so local/in-app notifications keep working either way.
function getEasProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId
  );
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device (or a real push-capable simulator).');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission was not granted.');
    return null;
  }

  const projectId = getEasProjectId();
  if (!projectId) {
    console.warn(
      'No EAS projectId configured — run `eas init` to link this app before push tokens can be issued. ' +
        'In-app/local notifications still work without it.'
    );
    return null;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (e: any) {
    console.error('Failed to get Expo push token:', e.message);
    return null;
  }
}

export async function savePushToken(userId: string, token: string) {
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' }
  );

  if (error) console.error('Failed to save push token:', error.message);
}

export async function registerAndSavePushToken(userId: string) {
  const token = await registerForPushNotificationsAsync();
  if (token) await savePushToken(userId, token);
  return token;
}

export function addNotificationListeners(handlers: {
  onReceived?: (notification: Notifications.Notification) => void;
  onResponse?: (response: Notifications.NotificationResponse) => void;
}) {
  const receivedSub = Notifications.addNotificationReceivedListener((n) => handlers.onReceived?.(n));
  const responseSub = Notifications.addNotificationResponseReceivedListener((r) => handlers.onResponse?.(r));

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
