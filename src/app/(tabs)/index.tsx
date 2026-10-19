import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { TILE_GAP, tileWidth, WidgetView } from '@/components/dashboard/widgets';
import { useTabBarSpace } from '@/components/floating-tab-bar';
import { Backdrop } from '@/components/glass';
import { Button, CircleButton, EmptyState, Loading, Row, Text } from '@/components/ui';
import { getDashboard, loadDashboardData, saveDashboard } from '@/db/dashboard';
import { useDbQuery } from '@/hooks/use-db-query';
import { useScrollResetOnTabLeave } from '@/hooks/use-scroll-reset-on-tab-leave';
import { useToday } from '@/hooks/use-today';
import { isFixedSize, nextSize, WIDGET_SIZE_LABELS, type Widget } from '@/lib/dashboard';
import { tr } from '@/lib/i18n';
import { formatLongDate } from '@/lib/labels';
import { colors, fontSize, radius, spacing } from '@/theme';

/**
 * Home is a dashboard of widgets the user picks. "Edit" switches to edit
 * mode: tiles can be dragged into a new order, resized and removed, and new
 * ones added from the widget picker.
 */
export default function HomeScreen() {
  const tabBarSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rowWidth = width - spacing.lg * 2;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  useScrollResetOnTabLeave(scrollRef);
  const { data: widgets } = useDbQuery(getDashboard);
  const today = useToday();
  const { data } = useDbQuery(loadDashboardData, [today]);
  const [editing, setEditing] = useState(false);

  if (!widgets || !data) return <Loading />;

  const remove = (id: string) => {
    saveDashboard(widgets.filter((w) => w.id !== id));
  };
  const resize = (id: string) => {
    saveDashboard(widgets.map((w) => (w.id === id ? { ...w, size: nextSize(w.size) } : w)));
  };
  const toggleEditing = () => {
    setEditing((e) => !e);
  };

  return (
    <View style={styles.root}>
      <Backdrop />
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: tabBarSpace },
        ]}>
        <View style={styles.greeting}>
          <Row style={styles.spaceBetween}>
            <Text variant="secondary">{formatLongDate(data.loadedAt)}</Text>
            <Row>
              <Button
                title={editing ? tr('Готово', 'Done') : tr('Змінити', 'Edit')}
                icon={editing ? 'checkmark' : 'grid-outline'}
                variant={editing ? 'primary' : 'secondary'}
                onPress={toggleEditing}
                style={styles.editButton}
              />
              {!editing && (
                <CircleButton icon="settings-outline" onPress={() => router.push('/settings')} />
              )}
            </Row>
          </Row>
          {editing && (
            <Text variant="muted">
              {tr(
                'Утримуй і тягни плитку, щоб перемістити. Розмір змінює кнопка внизу плитки.',
                'Hold and drag a tile to move it. The button at the bottom of a tile changes its size.',
              )}
            </Text>
          )}
        </View>

        {widgets.length === 0 ? (
          <EmptyState
            icon="grid-outline"
            title={tr('На головній ще немає віджетів', 'No widgets on the home screen yet')}
            hint={tr(
              'Додай плитки з тренуваннями, харчуванням, водою чи вагою.',
              'Add tiles with workouts, food, water or weight.',
            )}
          />
        ) : (
          <Sortable.Flex
            gap={TILE_GAP}
            sortEnabled={editing}
            scrollableRef={scrollRef}
            dragActivationDelay={150}
            activeItemScale={1.03}
            inactiveItemOpacity={0.6}
            onDragEnd={({ order }) => saveDashboard(order(widgets))}>
            {widgets.map((w, i) => (
              <View key={w.id}>
                {/* Tiles rise in one after another when the app opens (and when one is added). */}
                <Animated.View entering={FadeInDown.delay(i * 60).duration(380)}>
                  <WidgetView
                    widget={w}
                    data={data}
                    width={tileWidth(w, rowWidth)}
                    interactive={!editing}
                  />
                </Animated.View>
                {editing && (
                  <EditOverlay
                    widget={w}
                    onRemove={() => remove(w.id)}
                    onResize={() => resize(w.id)}
                  />
                )}
              </View>
            ))}
          </Sortable.Flex>
        )}

        {(editing || widgets.length === 0) && (
          <Button
            title={tr('Додати віджет', 'Add widget')}
            icon="add"
            variant={widgets.length === 0 ? 'primary' : 'secondary'}
            onPress={() => router.push('/widgets')}
          />
        )}
      </Animated.ScrollView>
    </View>
  );
}

/** Edit-mode chrome on a tile: a dashed outline, a remove cross and a size switch. */
function EditOverlay({
  widget,
  onRemove,
  onResize,
}: {
  widget: Widget;
  onRemove: () => void;
  onResize: () => void;
}) {
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.outline} pointerEvents="none" />
      <Sortable.Touchable onTap={onRemove} style={styles.remove}>
        <Ionicons name="close" size={16} color={colors.text} />
      </Sortable.Touchable>
      {!isFixedSize(widget.type) && (
        <Sortable.Touchable onTap={onResize} style={styles.size}>
          <Ionicons name="resize" size={14} color={colors.accentText} />
          <Text variant="caption" style={styles.sizeText}>
            {WIDGET_SIZE_LABELS[widget.size]}
          </Text>
        </Sortable.Touchable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg, flexGrow: 1 },
  // No top margin: the actions line up with the ScreenHeader buttons on the other tabs.
  greeting: { gap: spacing.xs },
  spaceBetween: { justifyContent: 'space-between' },
  // As tall as the 44 px CircleButtons used in every screen header.
  editButton: { minHeight: 44, paddingHorizontal: spacing.lg },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  outline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  size: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  sizeText: { color: colors.accentText, fontWeight: '700', fontSize: fontSize.xs + 1 },
});
