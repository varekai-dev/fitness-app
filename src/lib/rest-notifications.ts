import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'rest-timer';
let scheduledId: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Asks for permission once and sets up the Android channel. Safe to call repeatedly. */
export async function prepareRestNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Таймер відпочинку',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 200, 300],
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
}

export async function scheduleRestEnd(seconds: number, exerciseName: string) {
  await cancelRestEnd();
  if (seconds <= 0) return;
  scheduledId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Відпочинок завершено',
      body: `Наступний підхід: ${exerciseName}`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelRestEnd() {
  if (!scheduledId) return;
  const id = scheduledId;
  scheduledId = null;
  await Notifications.cancelScheduledNotificationAsync(id);
}
