import { t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { TILE_GAP, tileWidth, WidgetView } from '@/components/dashboard/widgets';
import { Button, Card, ChipGroup, goBack, Loading, Row, Screen, Text } from '@/components/ui';
import { addWidget, getDashboard, loadDashboardData } from '@/db/dashboard';
import { useDbQuery } from '@/hooks/use-db-query';
import { useToday } from '@/hooks/use-today';
import {
  isFixedSize,
  STAT_INFO,
  WIDGET_GROUPS,
  WIDGET_INFO,
  WIDGET_SIZE_LABELS,
  WIDGET_SIZES,
  type WidgetSize,
  type WidgetType,
} from '@/lib/dashboard';
import { isWidgetAvailable, useEnabledModules } from '@/lib/modules';
import { colors, radius, spacing } from '@/theme';

/** Card padding plus the preview well's padding, on both sides. */
const PREVIEW_INSET = spacing.lg * 2 + spacing.md * 2;

/** Picker for home screen widgets, grouped by the tab they come from, with live previews. */
export default function WidgetsScreen() {
  const { width } = useWindowDimensions();
  const rowWidth = width - spacing.lg * 2 - PREVIEW_INSET;
  const today = useToday();
  const { data } = useDbQuery(loadDashboardData, [today]);
  const { data: widgets } = useDbQuery(getDashboard);
  const [sizes, setSizes] = useState<Partial<Record<WidgetType, WidgetSize>>>({});
  useEnabledModules();
  // Widgets from switched-off sections aren't offered.
  const groups = WIDGET_GROUPS.map((g) => ({
    ...g,
    types: g.types.filter(isWidgetAvailable),
    stats: g.stats.filter(isWidgetAvailable),
  })).filter((g) => g.types.length + g.stats.length > 0);

  if (!data || !widgets) return <Loading />;

  const add = async (type: WidgetType, size: WidgetSize) => {
    await addWidget(type, size);
    goBack();
  };

  return (
    <Screen title={t`Додати віджет`} mode="modal">
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text variant="overline">{group.title}</Text>
          {group.types.map((type) => {
            const info = WIDGET_INFO[type];
            const size = isFixedSize(type) ? 'medium' : (sizes[type] ?? 'small');
            const count = widgets.filter((w) => w.type === type).length;
            return (
              <Card key={type}>
                <Row>
                  <Ionicons name={info.icon} size={18} color={colors.accent} />
                  <Text variant="heading" style={styles.flex}>
                    {info.title}
                  </Text>
                  {count > 0 && (
                    <Text variant="muted">
                      {t`вже є`}: {count}
                    </Text>
                  )}
                </Row>
                <Text variant="muted">{info.description}</Text>
                <View style={styles.preview}>
                  <WidgetView
                    widget={{ id: `preview-${type}`, type, size }}
                    data={data}
                    width={tileWidth({ type, size }, rowWidth)}
                    interactive={false}
                  />
                </View>
                {!isFixedSize(type) && (
                  <ChipGroup
                    options={WIDGET_SIZES}
                    value={size}
                    onChange={(s) => setSizes((prev) => ({ ...prev, [type]: s }))}
                    labels={WIDGET_SIZE_LABELS}
                  />
                )}
                <Button
                  title={t`Додати на головну`}
                  icon="add"
                  onPress={() => add(type, size)}
                />
              </Card>
            );
          })}
          {group.stats.length > 0 && (
            <Card>
              <Row>
                <Ionicons name="apps" size={18} color={colors.accent} />
                <Text variant="heading" style={styles.flex}>
                  {t`Плитки`}
                </Text>
              </Row>
              <Text variant="muted">
                {t`Одне число на третину ширини. Торкнись плитки, щоб додати.`}
              </Text>
              <View style={[styles.preview, styles.statGrid]}>
                {group.stats.map((type) => {
                  const count = widgets.filter((w) => w.type === type).length;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => add(type, 'small')}
                      accessibilityRole="button"
                      accessibilityLabel={t`Додати плитку «${STAT_INFO[type].title}»`}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <WidgetView
                        widget={{ id: `preview-${type}`, type, size: 'small' }}
                        data={data}
                        width={tileWidth({ type, size: 'small' }, rowWidth)}
                        interactive={false}
                      />
                      {count > 0 && (
                        <View style={styles.added}>
                          <Ionicons name="checkmark" size={12} color={colors.accentText} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { gap: spacing.sm },
  // A dark well, so tiles that share the card's colour still read as tiles.
  preview: {
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    alignItems: 'flex-start',
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  pressed: { opacity: 0.7 },
  // Marks a tile that is already on Home.
  added: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
