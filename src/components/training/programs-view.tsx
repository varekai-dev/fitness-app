import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge, Card, EmptyState, Loading, SectionHeader, Text } from '@/components/ui';
import { useDialog } from '@/components/dialog';
import { confirmRemoveProgram } from '@/components/remove-dialogs';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { listPrograms } from '@/db/programs';
import { useDbQuery } from '@/hooks/use-db-query';
import { colors, radius, spacing } from '@/theme';

/** The Programs section of the Training tab. */
export function ProgramsView({ bottomSpace }: { bottomSpace: number }) {
  const { data } = useDbQuery(listPrograms);
  const dialog = useDialog();

  if (!data) return <Loading />;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
      keyboardShouldPersistTaps="handled">
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
