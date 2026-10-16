import { createAudioPlayer } from 'expo-audio';

const SOUNDS = {
  notification: require('../../assets/sounds/notification.wav'),
  message: require('../../assets/sounds/message.wav'),
};

let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

function play(source: any) {
  if (!soundEnabled) return;
  try {
    const player = createAudioPlayer(source);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        player.remove();
      }
    });
    player.play();
  } catch (e) {
    console.warn('Failed to play sound effect:', e);
  }
}

export function playNotificationSound() {
  play(SOUNDS.notification);
}

export function playMessageSound() {
  play(SOUNDS.message);
}
