import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, StyleSheet, Switch, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, Card, Chip, CircleButton, Loading, Row, Screen, Text } from '@/components/ui';
import { listProgressPhotos } from '@/db/progress-photos';
import {
  getDayWindow,
  getPhotoReminders,
  getWaterReminders,
  setDayWindow,
  setPhotoReminders,
  setWaterReminders,
} from '@/db/reminders';
import { loadWater } from '@/db/water';
import { useDbQuery } from '@/hooks/use-db-query';
import { useNow } from '@/hooks/use-now';
import { tr } from '@/lib/i18n';
import { formatShortDate } from '@/lib/labels';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import {
  DAY_WINDOW_STEP_MIN,
  formatClock,
  formatInterval,
  MIN_DAY_LENGTH_MIN,
  planPhotoReminder,
  planWaterReminders,
  REMINDER_INTERVALS_MIN,
} from '@/lib/reminders';
import { formatVolume, VOLUME_UNIT } from '@/lib/units';
import { addDays } from '@/lib/water';
import { colors, spacing } from '@/theme';

const LAST_DAY_MIN = 24 * 60 - DAY_WINDOW_STEP_MIN;

/** A time of day edited with −/+ in `DAY_WINDOW_STEP_MIN` steps. */
function TimeStepper({
  title,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  title: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const change = (dir: 1 | -1) => {
    const next = Math.min(Math.max(value + dir * DAY_WINDOW_STEP_MIN, min), max);
    if (next === value) return;
    onChange(next);
  };
  return (
    <Row style={styles.spaceBetween}>
      <View style={styles.flex}>
        <Text variant="body">{title}</Text>
        <Text variant="muted">{hint}</Text>
      </View>
      <Row style={styles.stepper}>
        <CircleButton icon="remove" size={36} disabled={value <= min} onPress={() => change(-1)} />
        <Text variant="heading" style={styles.timeValue}>
          {formatClock(value)}
        </Text>
        <CircleButton icon="add" size={36} disabled={value >= max} onPress={() => change(1)} />
      </Row>
    </Row>
  );
}

const dayLabel = (at: number, today: number) =>
  at < addDays(today, 1)
    ? tr('сьогодні', 'today')
    : at < addDays(today, 2)
      ? tr('завтра', 'tomorrow')
      : tr('пізніше', 'later');

/** "сьогодні", "завтра" or the date for reminders that can be days away. */
const photoDay = (at: number, today: number) =>
  at < addDays(today, 2) ? dayLabel(at, today) : formatShortDate(at);

const clockOf = (at: number) => {
  const d = new Date(at);
  return formatClock(d.getHours() * 60 + d.getMinutes());
};

/** Waking hours, the water reminders that pace the daily goal across them, and the weekly photo nudge. */
export default function NotificationsScreen() {
  const dialog = useDialog();
  const now = useNow();
  // Re-run with the clock too: the next check moves on and permission may change in system settings.
  const { data } = useDbQuery(
    () =>
      Promise.all([
        getDayWindow(),
        getWaterReminders(),
        loadWater(),
        getNotificationPermission(),
        getPhotoReminders(),
        listProgressPhotos(),
      ]),
    [now],
  );
  if (!data) return <Loading />;
  const [dayWindow, water, { goal, todayMl, today }, permitted, photo, photos] = data;
  const nextPhoto = photo.enabled
    ? planPhotoReminder({ now, lastPhotoAt: photos.at(-1)?.takenAt ?? null, window: dayWindow })
    : undefined;
  const next = water.enabled
    ? planWaterReminders({
        now,
        today,
        todayMl,
        goal,
        window: dayWindow,
        intervalMin: water.intervalMin,
      })[0]
    : undefined;
  const hours = formatInterval(dayWindow.endMin - dayWindow.startMin);

  const toggle = (save: (enabled: boolean) => Promise<void>) => async (enabled: boolean) => {
    if (enabled && !(await requestNotificationPermission())) {
      dialog.show({
        title: tr('Сповіщення вимкнені', 'Notifications are off'),
        message: tr(
          'Дозволь сповіщення для застосунку в налаштуваннях телефону.',
          'Allow notifications for the app in your phone settings.',
        ),
        icon: 'notifications-off-outline',
        buttons: [
          { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
          {
            text: tr('Відкрити налаштування', 'Open settings'),
            onPress: () => Linking.openSettings(),
          },
        ],
      });
      return;
    }
    save(enabled);
  };

  return (
    <Screen title={tr('Сповіщення', 'Notifications')}>
      <Card>
        <Row>
          <Ionicons name="sunny-outline" size={20} color={colors.accent} />
          <Text variant="heading">{tr('Мій день', 'My day')}</Text>
        </Row>
        <Text variant="muted">
          {tr(
            `Нагадування приходять лише в ці години (${hours}). До кінця дня має бути випита вся норма.`,
            `Reminders come only during these hours (${hours}). The whole goal should be drunk by the end of the day.`,
          )}
        </Text>
        <TimeStepper
          title={tr('Початок', 'Start')}
          hint={tr('Підйом', 'Wake up')}
          value={dayWindow.startMin}
          min={0}
          max={dayWindow.endMin - MIN_DAY_LENGTH_MIN}
          onChange={(startMin) => setDayWindow({ ...dayWindow, startMin })}
        />
        <TimeStepper
          title={tr('Кінець', 'End')}
          hint={tr('Відбій', 'Bedtime')}
          value={dayWindow.endMin}
          min={dayWindow.startMin + MIN_DAY_LENGTH_MIN}
          max={LAST_DAY_MIN}
          onChange={(endMin) => setDayWindow({ ...dayWindow, endMin })}
        />
      </Card>

      <Card>
        <Row style={styles.spaceBetween}>
          <Row style={styles.flex}>
            <Ionicons name="water-outline" size={20} color={colors.accent} />
            <Text variant="heading">{tr('Нагадування пити воду', 'Water reminders')}</Text>
          </Row>
          <Switch
            value={water.enabled}
            onValueChange={toggle((enabled) => setWaterReminders({ enabled }))}
            trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
            thumbColor={colors.text}
          />
        </Row>
        <Text variant="muted">
          {tr(
            `Перевіряємо, чи випито стільки, скільки треба на цю годину, щоб дійти до ${formatVolume(goal)} ${VOLUME_UNIT}. Якщо ні — нагадаємо.`,
            `We check whether you’ve drunk enough by this hour to reach ${formatVolume(goal)} ${VOLUME_UNIT}. If not, we’ll remind you.`,
          )}
        </Text>
        {water.enabled && (
          <>
            <Text variant="caption">{tr('Перевіряти кожні', 'Check every')}</Text>
            <View style={styles.chips}>
              {REMINDER_INTERVALS_MIN.map((m) => (
                <Chip
                  key={m}
                  label={formatInterval(m)}
                  selected={m === water.intervalMin}
                  onPress={() => {
                    setWaterReminders({ intervalMin: m });
                  }}
                />
              ))}
            </View>
            {!permitted ? (
              <Button
                title={tr(
                  'Сповіщення заборонені — відкрити налаштування',
                  'Notifications blocked: open settings',
                )}
                variant="danger"
                small
                onPress={() => Linking.openSettings()}
              />
            ) : next ? (
              <Text variant="secondary">
                {tr(
                  `Наступне нагадування ${dayLabel(next.at, today)} о ${clockOf(next.at)}, якщо не доп’єш.`,
                  `Next reminder ${dayLabel(next.at, today)} at ${clockOf(next.at)} if you’re behind.`,
                )}
              </Text>
            ) : null}
          </>
        )}
      </Card>

      <Card>
        <Row style={styles.spaceBetween}>
          <Row style={styles.flex}>
            <Ionicons name="camera-outline" size={20} color={colors.accent} />
            <Text variant="heading">{tr('Фото прогресу', 'Progress photos')}</Text>
          </Row>
          <Switch
            value={photo.enabled}
            onValueChange={toggle(setPhotoReminders)}
            trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
            thumbColor={colors.text}
          />
        </Row>
        <Text variant="muted">
          {tr(
            'Нагадаємо зранку, коли мине тиждень від останнього фото.',
            'We’ll remind you in the morning once a week has passed since the last photo.',
          )}
        </Text>
        {photo.enabled &&
          (!permitted ? (
            <Button
              title={tr(
                'Сповіщення заборонені — відкрити налаштування',
                'Notifications blocked: open settings',
              )}
              variant="danger"
              small
              onPress={() => Linking.openSettings()}
            />
          ) : nextPhoto ? (
            <Text variant="secondary">
              {tr(
                `Наступне нагадування ${photoDay(nextPhoto.at, today)} о ${clockOf(nextPhoto.at)}.`,
                `Next reminder ${photoDay(nextPhoto.at, today)} at ${clockOf(nextPhoto.at)}.`,
              )}
            </Text>
          ) : null)}
      </Card>
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepper: { gap: spacing.sm },
  timeValue: { minWidth: 64, textAlign: 'center' },
  spaceBetween: { justifyContent: 'space-between' },
});
