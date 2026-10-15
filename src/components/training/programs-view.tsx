import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  Badge,
  Card,
  CircleButton,
  EmptyState,
  Loading,
  SectionHeader,
  Text,
} from '@/components/ui';
import { useDialog } from '@/components/dialog';
import { confirmRemoveProgram } from '@/components/remove-dialogs';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { createProgram, listPrograms } from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, fontSize, radius, spacing } from '@/theme';

/** The Programs section of the Training tab. */
export function ProgramsView({ bottomSpace }: { bottomSpace: number }) {
  const { data } = useDbQuery(listPrograms);
  const [name, setName] = useState('');
  const dialog = useDialog();

  if (!data) return <Loading />;

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await createProgram(trimmed);
    setName('');
    router.push({ pathname: '/program/[id]', params: { id } });
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
      keyboardShouldPersistTaps="handled">
      <View style={styles.create}>
        <TextInput
          style={styles.createInput}
          value={name}
          onChangeText={setName}
          placeholder="Назва нової програми"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={create}
          returnKeyType="done"
        />
        <CircleButton
          icon="add"
          size={40}
          background={name.trim() ? colors.accent : colors.surfaceRaised}
          color={name.trim() ? colors.accentText : colors.textMuted}
          disabled={!name.trim()}
          onPress={create}
        />
      </View>

      <SectionHeader title="Мої програми" />
      {data.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Програм ще немає"
          hint="Програма — це набір днів (наприклад, Push / Pull / Legs), які йдуть по колу."
        />
      ) : (
        data.map((p) => {
          const card = (
            <Card
              key={p.id}
              onPress={() => router.push({ pathname: '/program/[id]', params: { id: p.id } })}
              style={styles.item}>
              <View style={[styles.icon, p.isActive && styles.iconActive]}>
                <Ionicons
                  name="calendar"
                  size={24}
                  color={p.isActive ? colors.accentText : colors.accent}
                />
              </View>
              <View style={styles.flex}>
                <Text variant="body" numberOfLines={1}>
                  {p.name}
                </Text>
                <Text variant="muted">{p.days.length} дн. по колу</Text>
                {p.isActive && <Badge label="Активна" />}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          );
          // Only programs the user made can be swiped away; built-in ones from their screen.
          return p.builtIn ? (
            card
          ) : (
            <SwipeToDelete
              key={p.id}
              onDelete={(close) => confirmRemoveProgram(dialog.show, p.id, { onKept: close })}>
              {card}
            </SwipeToDelete>
          );
        })
      )}
      {dialog.element}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  flex: { flex: 1, gap: 3 },
  create: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  createInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    paddingRight: spacing.lg,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: { backgroundColor: colors.accent },
});
