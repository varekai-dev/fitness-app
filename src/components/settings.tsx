import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, CircleButton, Row, Text, type IconName } from '@/components/ui';
import { colors, fontSize, spacing } from '@/theme';

/** A row on the settings menu that opens one of its sections. */
export function SettingsLink({
  icon,
  title,
  hint,
  href,
}: {
  icon: IconName;
  title: string;
  hint: string;
  href: Href;
}) {
  return (
    <Card onPress={() => router.push(href)}>
      <Row style={styles.spaceBetween}>
        <Row>
          <Ionicons name={icon} size={20} color={colors.accent} />
          <Text variant="heading">{title}</Text>
        </Row>
        <Row>
          <Text variant="muted">{hint}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Row>
      </Row>
    </Card>
  );
}

/** Next value on the `step` grid, so a recommended 2137 steps to 2150 / 2100 rather than 2187 / 2087. */
const snapStep = (value: number, step: number, dir: 1 | -1) =>
  dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;

/** A daily goal edited with −/+ on a step grid, clamped to [min, max]. */
export function GoalStepper({
  title,
  unit,
  value,
  step,
  min,
  max,
  format,
  onChange,
}: {
  title: string;
  unit: string;
  value: number;
  step: number;
  min: number;
  max: number;
  format: (n: number) => string;
  onChange: (next: number) => void;
}) {
  const change = (dir: 1 | -1) => {
    const next = Math.min(Math.max(snapStep(value, step, dir), min), max);
    if (next === value) return;
    Haptics.selectionAsync();
    onChange(next);
  };
  return (
    <Card>
      <Row style={styles.spaceBetween}>
        <View>
          <Text variant="heading">{title}</Text>
          <Text variant="muted">
            Крок {step} {unit}
          </Text>
        </View>
        <Row style={styles.stepper}>
          <CircleButton
            icon="remove"
            size={36}
            disabled={value <= min}
            onPress={() => change(-1)}
          />
          <Text variant="heading" style={styles.goalValue}>
            {format(value)} {unit}
          </Text>
          <CircleButton icon="add" size={36} disabled={value >= max} onPress={() => change(1)} />
        </Row>
      </Row>
    </Card>
  );
}

/**
 * The profile-based recommendation for a goal, with a button to adopt it.
 * Without one it says which profile fields are still missing.
 */
export function RecommendationCard({
  value,
  goal,
  unit,
  format,
  details,
  missing,
  onAdopt,
}: {
  value: number | null;
  goal: number;
  unit: string;
  format: (n: number) => string;
  details: string;
  missing: string;
  onAdopt: (value: number) => void;
}) {
  return (
    <Card onPress={() => router.push('/profile')}>
      <Row style={styles.spaceBetween}>
        <Text variant="overline">Рекомендовано</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
      {value !== null ? (
        <>
          <Text variant="title">
            {format(value)}
            <Text style={styles.recUnit}> {unit}/день</Text>
          </Text>
          <Text variant="muted">{details}</Text>
          {value !== goal && (
            <Button
              title={`Зробити ціллю (зараз ${format(goal)})`}
              variant="secondary"
              small
              onPress={() => {
                Haptics.selectionAsync();
                onAdopt(value);
              }}
            />
          )}
        </>
      ) : (
        <Text variant="muted">Вкажи в профілі {missing}, щоб отримати рекомендацію.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  stepper: { gap: spacing.sm },
  goalValue: { minWidth: 96, textAlign: 'center' },
  recUnit: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: '600' },
  spaceBetween: { justifyContent: 'space-between' },
});
