import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';

import { Badge, Card, EmptyState, Loading, SectionHeader, Text } from '@/components/ui';
import { useDialog } from '@/components/dialog';
import { ListRow } from '@/components/motion';
import { confirmRemoveProgram } from '@/components/remove-dialogs';
import { SwipeToDelete } from '@/components/swipe-to-delete';
import { listPrograms } from '@/db/programs';
import { useFocusedDbQuery } from '@/hooks/use-db-query';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { colors, radius, spacing } from '@/theme';

/** The Programs section of the Training tab. */
export function ProgramsView({ bottomSpace }: { bottomSpace: number }) {
  const { data } = useFocusedDbQuery(listPrograms);
  const scrollRef = useRef<ScrollViewInstance>(null);
  useScrollResetOnTabLeave(scrollRef);
  const dialog = useDialog();

  if (!data) return <Loading />;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, { paddingBottom: bottomSpace }]}
      keyboardShouldPersistTaps="handled">
      <Card onPress={() => router.push('/program/ai')} style={styles.item}>
        <View style={styles.icon}>
          <Ionicons name="sparkles" size={24} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text variant="body">{t`Скласти програму з AI`}</Text>
          <Text variant="muted">
            {t`Кілька питань — і AI підбере дні, вправи й підходи під тебе`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
      <SectionHeader title={t`Мої програми`} />
      {/* A new program fades in; the ones there when the section opens just show. */}
      <LayoutAnimationConfig skipEntering>
        {data.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={t`Програм ще немає`}
            hint={t`Програма — це набір днів (наприклад, Push / Pull / Legs), які йдуть по колу.`}
          />
        ) : (
          data.map((p) => {
            const card = (
              <Card
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
                  <Text variant="muted">
                    {t`${p.days.length} дн. по колу`}
                  </Text>
                  {p.isActive && <Badge label={t`Активна`} />}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Card>
            );
            // Only programs the user made can be swiped away; built-in ones from their screen.
            return (
              <ListRow key={p.id} glide>
                {p.builtIn ? (
                  card
                ) : (
                  <SwipeToDelete
                    onDelete={(close) =>
                      confirmRemoveProgram(dialog.show, p.id, { onKept: close })
                    }>
                    {card}
                  </SwipeToDelete>
                )}
              </ListRow>
            );
          })
        )}
      </LayoutAnimationConfig>
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
