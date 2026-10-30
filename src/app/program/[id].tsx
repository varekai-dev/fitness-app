import { plural, t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  CircleButton,
  EmptyState,
  Field,
  goBack,
  IconButton,
  IndexMarker,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { addDay, getProgram, moveDay, renameProgram, setActiveProgram } from '@/db/programs';
import { useDialog } from '@/components/dialog';
import { confirmRemoveProgram } from '@/components/remove-dialogs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, fontSize, radius, spacing } from '@/theme';

export default function ProgramScreen() {
  const params = useLocalSearchParams<{ id: string; isNew?: string }>();
  const id = Number(params.id);
  const { data: program } = useDbQuery(() => getProgram(id).then((p) => p ?? null), [id]);
  const [dayName, setDayName] = useState('');
  const dialog = useDialog();

  if (program === undefined) return <Loading />;
  if (program === null) {
    return (
      <Screen title={t`Програма`}>
        <EmptyState icon="alert-circle" title={t`Програму не знайдено`} />
      </Screen>
    );
  }

  const totalExercises = program.days.reduce((n, d) => n + d.exercises.length, 0);

  const createDay = async () => {
    const trimmed = dayName.trim() || `${t`День`} ${program.days.length + 1}`;
    await addDay(id, trimmed);
    setDayName('');
  };

  const remove = () => confirmRemoveProgram(dialog.show, id, { onRemoved: goBack });

  return (
    <Screen
      title={program.name}
      headerRight={<CircleButton icon="trash-outline" color={colors.danger} onPress={remove} />}>
      <ProgramNameField
        key={program.name}
        id={id}
        name={program.name}
        focus={params.isNew === '1'}
      />

      <Row style={styles.badges}>
        {program.isActive && <Badge label={t`Активна`} />}
        <Badge
          label={`${program.days.length} ${plural(program.days.length, { one: 'дн.', other: 'дн.' })}`}
          tone="muted"
        />
        <Badge
          label={`${totalExercises} ${plural(totalExercises, { one: 'вправа', few: 'вправи', many: 'вправ', other: 'вправи' })}`}
          tone="muted"
        />
      </Row>

      {!program.isActive && (
        <Button
          title={t`Зробити активною`}
          icon="checkmark-circle"
          onPress={() => setActiveProgram(id)}
        />
      )}

      <SectionHeader title={t`Послідовність днів`} />
      {program.days.length === 0 && (
        <>
          <EmptyState icon="calendar" title={t`Додай перший день`} />
          <Button
            title={t`Скласти з AI`}
            icon="sparkles"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: '/program/ai', params: { programId: String(id) } })
            }
          />
        </>
      )}
      {program.days.map((d, i) => (
        <Card
          key={d.id}
          style={styles.day}
          onPress={() => router.push({ pathname: '/program/day/[id]', params: { id: d.id } })}>
          <IndexMarker n={i + 1} />
          <View style={styles.flex}>
            <Text variant="body">{d.name}</Text>
            <Text variant="muted" numberOfLines={1}>
              {d.exercises.length === 0
                ? t`Без вправ`
                : `${d.exercises.length} ${plural(d.exercises.length, { one: 'вправа', few: 'вправи', many: 'вправ', other: 'вправи' })} · ${d.exercises.map((e) => e.exercise.name).join(', ')}`}
            </Text>
          </View>
          <View style={styles.reorder}>
            <IconButton
              icon="chevron-up"
              size={18}
              disabled={i === 0}
              onPress={() => moveDay(id, d.id, -1)}
            />
            <IconButton
              icon="chevron-down"
              size={18}
              disabled={i === program.days.length - 1}
              onPress={() => moveDay(id, d.id, 1)}
            />
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Card>
      ))}

      <View style={styles.addDay}>
        <TextInput
          style={styles.addDayInput}
          value={dayName}
          onChangeText={setDayName}
          placeholder={t`Новий день: День ${program.days.length + 1}`}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={createDay}
          returnKeyType="done"
        />
        <CircleButton
          icon="add"
          size={40}
          background={colors.accent}
          color={colors.accentText}
          onPress={createDay}
        />
      </View>
      {dialog.element}
    </Screen>
  );
}

function ProgramNameField({ id, name, focus }: { id: number; name: string; focus?: boolean }) {
  const [value, setValue] = useState(name);
  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) renameProgram(id, trimmed);
    else setValue(name);
  };
  return (
    <Field
      label={t`Назва програми`}
      value={value}
      onChangeText={setValue}
      onEndEditing={save}
      returnKeyType="done"
      autoFocus={focus}
      selectTextOnFocus={focus}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  badges: { flexWrap: 'wrap' },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  reorder: { gap: 0 },
  addDay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  addDayInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm,
  },
});
