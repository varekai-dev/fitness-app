import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

const CHANNEL_ID = 'rest-timer';
let scheduledId: string | null = null;

/**
 * Expo Go on Android throws as soon as expo-notifications is imported (removed in
 * SDK 53), so the module is loaded lazily and skipped there. The in-app countdown
 * and haptics still work; only the locked-screen notification is missing.
 */
const unsupported = Platform.OS === 'android' && isRunningInExpoGo();

let cached: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (unsupported) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: NotificationsModule = require('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/** Asks for permission once and sets up the Android channel. Safe to call repeatedly. */
export async function prepareRestNotifications() {
  const N = notifications();
  if (!N) return;
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Таймер відпочинку',
      importance: N.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
    });
  }
  const current = await N.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await N.requestPermissionsAsync();
}

export async function scheduleRestEnd(seconds: number, exerciseName: string) {
  const N = notifications();
  if (!N) return;
  await cancelRestEnd();
  if (seconds <= 0) return;
  scheduledId = await N.scheduleNotificationAsync({
    content: {
      title: 'Відпочинок завершено',
      body: `Наступний підхід: ${exerciseName}`,
    },
    trigger: {
      type: N.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelRestEnd() {
  const N = notifications();
  if (!N || !scheduledId) return;
  const id = scheduledId;
  scheduledId = null;
  await N.cancelScheduledNotificationAsync(id);
}
