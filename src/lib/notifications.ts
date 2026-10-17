import type * as NotificationsModule from 'expo-notifications';
import { LogBox, Platform } from 'react-native';

import { listProgressPhotos } from '@/db/progress-photos';
import { getDayWindow, getPhotoReminders, getWaterReminders } from '@/db/reminders';
import { loadWater } from '@/db/water';
import { tr } from '@/lib/i18n';
import { planPhotoReminder, planWaterReminders } from '@/lib/reminders';

/**
 * Loaded lazily: Expo Go on Android ships without some of the module's native
 * parts and throws on import, which would take the whole app down. There (and
 * on web) reminders are simply unavailable; a development build has them all.
 */
function load(): typeof NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  // Expo Go on Android warns on import that push notifications are missing;
  // the app only schedules local ones, which still work there.
  LogBox.ignoreLogs(['[expo-notifications] Push notifications (remote notifications)']);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

const Notifications = load();

export const notificationsSupported = Notifications !== null;

export type NotificationResponse = NotificationsModule.NotificationResponse;

const WATER_CHANNEL = 'water';
const WATER_PREFIX = 'water-';
/** Where a tap on a water reminder leads: the tab with the glasses to log. */
const WATER_URL = '/water';
const PHOTO_CHANNEL = 'progress-photos';
const PHOTO_PREFIX = 'photo-';
const PHOTO_URL = '/progress-photos';

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Creates the reminder channels; resolves to whether they exist. Android 13+ only
 * shows the permission prompt once a channel exists. Expo Go can't create
 * channels, so there reminders go to its default one instead.
 */
async function ensureChannels(N: typeof NotificationsModule) {
  if (Platform.OS !== 'android') return false;
  try {
    await N.setNotificationChannelAsync(WATER_CHANNEL, {
      name: tr('Нагадування про воду', 'Water reminders'),
      importance: N.AndroidImportance.HIGH,
    });
    await N.setNotificationChannelAsync(PHOTO_CHANNEL, {
      name: tr('Нагадування про фото прогресу', 'Progress photo reminders'),
      importance: N.AndroidImportance.DEFAULT,
    });
    return true;
  } catch {
    return false;
  }
}

const isGranted = (
  N: typeof NotificationsModule,
  p: NotificationsModule.NotificationPermissionsStatus,
) => p.granted || p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;

/** Asks for permission if it was never asked; resolves to whether notifications may be shown. */
export async function requestNotificationPermission() {
  const N = Notifications;
  if (!N) return false;
  try {
    await ensureChannels(N);
    const current = await N.getPermissionsAsync();
    if (isGranted(N, current)) return true;
    if (!current.canAskAgain) return false;
    return isGranted(N, await N.requestPermissionsAsync());
  } catch {
    return false;
  }
}

export async function getNotificationPermission() {
  const N = Notifications;
  return N !== null && isGranted(N, await N.getPermissionsAsync());
}

async function syncWaterRemindersNow(N: typeof NotificationsModule) {
  const scheduled = (await N.getAllScheduledNotificationsAsync()).filter((n) =>
    n.identifier.startsWith(WATER_PREFIX),
  );
  const [reminders, dayWindow, water] = await Promise.all([
    getWaterReminders(),
    getDayWindow(),
    loadWater(),
  ]);
  const permitted = await getNotificationPermission();
  const wanted =
    reminders.enabled && permitted
      ? planWaterReminders({
          now: Date.now(),
          today: water.today,
          todayMl: water.todayMl,
          goal: water.goal,
          window: dayWindow,
          intervalMin: reminders.intervalMin,
        })
      : [];
  const channelId = wanted.length && (await ensureChannels(N)) ? WATER_CHANNEL : undefined;

  // Only touch what changed: logging a glass usually drops or rewords a few of today's checks.
  const wantedById = new Map(wanted.map((r) => [WATER_PREFIX + r.at, r]));
  const kept = new Set<string>();
  for (const n of scheduled) {
    const r = wantedById.get(n.identifier);
    if (r && n.content.body === r.body && n.content.title === r.title) kept.add(n.identifier);
    else await N.cancelScheduledNotificationAsync(n.identifier);
  }
  for (const [identifier, r] of wantedById) {
    if (kept.has(identifier)) continue;
    await N.scheduleNotificationAsync({
      identifier,
      content: { title: r.title, body: r.body, data: { url: WATER_URL } },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DATE,
        date: r.at,
        channelId,
      },
    });
  }
}

/** The one weekly progress photo reminder; its id carries its time, so an unchanged plan is left alone. */
async function syncPhotoReminderNow(N: typeof NotificationsModule) {
  const scheduled = (await N.getAllScheduledNotificationsAsync()).filter((n) =>
    n.identifier.startsWith(PHOTO_PREFIX),
  );
  const [reminders, dayWindow, photos] = await Promise.all([
    getPhotoReminders(),
    getDayWindow(),
    listProgressPhotos(),
  ]);
  const permitted = await getNotificationPermission();
  const wanted =
    reminders.enabled && permitted
      ? planPhotoReminder({
          now: Date.now(),
          lastPhotoAt: photos.at(-1)?.takenAt ?? null,
          window: dayWindow,
        })
      : null;
  const identifier = wanted && PHOTO_PREFIX + wanted.at;
  for (const n of scheduled) {
    if (n.identifier !== identifier || n.content.body !== wanted?.body)
      await N.cancelScheduledNotificationAsync(n.identifier);
  }
  if (!wanted || !identifier) return;
  if (scheduled.some((n) => n.identifier === identifier && n.content.body === wanted.body)) return;
  const channelId = (await ensureChannels(N)) ? PHOTO_CHANNEL : undefined;
  await N.scheduleNotificationAsync({
    identifier,
    content: { title: wanted.title, body: wanted.body, data: { url: PHOTO_URL } },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: wanted.at, channelId },
  });
}

let queue = Promise.resolve();

/**
 * Brings the scheduled reminders in line with the settings, the water goal,
 * today's intake and the latest progress photo. Calls run one after another,
 * so overlapping triggers never interleave their cancels and schedules.
 */
export function syncReminders() {
  const N = Notifications;
  if (!N) return Promise.resolve();
  queue = queue
    .then(() => syncWaterRemindersNow(N))
    .catch(() => {})
    .then(() => syncPhotoReminderNow(N))
    .catch(() => {});
  return queue;
}

/** The screen a tapped notification asks to open, if any. */
function notificationUrl(response: NotificationResponse | null) {
  const url = response?.notification.request.content.data?.url;
  return typeof url === 'string' ? url : null;
}

/**
 * Calls `open` with the screen of every tapped notification, starting with the
 * one that launched the app, if any. Returns the unsubscribe function.
 */
export function onNotificationTap(open: (url: string) => void) {
  const N = Notifications;
  if (!N) return () => {};
  const handle = (response: NotificationResponse | null) => {
    const url = notificationUrl(response);
    if (!url) return;
    N.clearLastNotificationResponse();
    open(url);
  };
  // A tap that launched the app arrives before the listener exists.
  handle(N.getLastNotificationResponse());
  const sub = N.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
