import { t } from '@lingui/core/macro';
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
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { useNow } from '@/hooks/use-now';
import { isModuleEnabled } from '@/lib/modules';
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
    ? t`сьогодні`
    : at < addDays(today, 2)
      ? t`завтра`
      : t`пізніше`;

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
  const { data } = useFocusedDbQuery(
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
  const waterOn = isModuleEnabled('water');
  const next =
    water.enabled && waterOn
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
        title: t`Сповіщення вимкнені`,
        message: t`Дозволь сповіщення для застосунку в налаштуваннях телефону.`,
        icon: 'notifications-off-outline',
        buttons: [
          { text: t`Скасувати`, style: 'cancel' },
          {
            text: t`Відкрити налаштування`,
            onPress: () => Linking.openSettings(),
          },
        ],
      });
      return;
    }
    save(enabled);
  };

  return (
    <Screen title={t`Сповіщення`}>
      <Card>
        <Row>
          <Ionicons name="sunny-outline" size={20} color={colors.accent} />
          <Text variant="heading">{t`Мій день`}</Text>
        </Row>
        <Text variant="muted">
          {t`Нагадування приходять лише в ці години (${hours}). До кінця дня має бути випита вся норма.`}
        </Text>
        <TimeStepper
          title={t`Початок`}
          hint={t`Підйом`}
          value={dayWindow.startMin}
          min={0}
          max={dayWindow.endMin - MIN_DAY_LENGTH_MIN}
          onChange={(startMin) => setDayWindow({ ...dayWindow, startMin })}
        />
        <TimeStepper
          title={t`Кінець`}
          hint={t`Відбій`}
          value={dayWindow.endMin}
          min={dayWindow.startMin + MIN_DAY_LENGTH_MIN}
          max={LAST_DAY_MIN}
          onChange={(endMin) => setDayWindow({ ...dayWindow, endMin })}
        />
      </Card>

      {waterOn && (
        <Card>
          <Row style={styles.spaceBetween}>
            <Row style={styles.flex}>
              <Ionicons name="water-outline" size={20} color={colors.accent} />
              <Text variant="heading">{t`Нагадування пити воду`}</Text>
            </Row>
            <Switch
              value={water.enabled}
              onValueChange={toggle((enabled) => setWaterReminders({ enabled }))}
              trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
              thumbColor={colors.text}
            />
          </Row>
          <Text variant="muted">
            {t`Перевіряємо, чи випито стільки, скільки треба на цю годину, щоб дійти до ${formatVolume(goal)} ${VOLUME_UNIT}. Якщо ні — нагадаємо.`}
          </Text>
          {water.enabled && (
            <>
              <Text variant="caption">{t`Перевіряти кожні`}</Text>
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
                  title={t`Сповіщення заборонені — відкрити налаштування`}
                  variant="danger"
                  small
                  onPress={() => Linking.openSettings()}
                />
              ) : next ? (
                <Text variant="secondary">
                  {t`Наступне нагадування ${dayLabel(next.at, today)} о ${clockOf(next.at)}, якщо не доп’єш.`}
                </Text>
              ) : null}
            </>
          )}
        </Card>
      )}

      <Card>
        <Row style={styles.spaceBetween}>
          <Row style={styles.flex}>
            <Ionicons name="camera-outline" size={20} color={colors.accent} />
            <Text variant="heading">{t`Фото прогресу`}</Text>
          </Row>
          <Switch
            value={photo.enabled}
            onValueChange={toggle(setPhotoReminders)}
            trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
            thumbColor={colors.text}
          />
        </Row>
        <Text variant="muted">
          {t`Нагадаємо зранку, коли мине тиждень від останнього фото.`}
        </Text>
        {photo.enabled &&
          (!permitted ? (
            <Button
              title={t`Сповіщення заборонені — відкрити налаштування`}
              variant="danger"
              small
              onPress={() => Linking.openSettings()}
            />
          ) : nextPhoto ? (
            <Text variant="secondary">
              {t`Наступне нагадування ${photoDay(nextPhoto.at, today)} о ${clockOf(nextPhoto.at)}.`}
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
