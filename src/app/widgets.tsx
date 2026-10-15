import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { tileWidth, WidgetView } from '@/components/dashboard/widgets';
import { Button, Card, ChipGroup, goBack, Loading, Row, Screen, Text } from '@/components/ui';
import { addWidget, getDashboard, loadDashboardData } from '@/db/dashboard';
import { useDbQuery } from '@/hooks/use-db-query';
import {
  WIDGET_GROUPS,
  WIDGET_INFO,
  WIDGET_SIZE_LABELS,
  WIDGET_SIZES,
  type WidgetSize,
  type WidgetType,
} from '@/lib/dashboard';
import { colors, radius, spacing } from '@/theme';

/** Card padding plus the preview well's padding, on both sides. */
const PREVIEW_INSET = spacing.lg * 2 + spacing.md * 2;

/** Picker for home screen widgets, grouped by the tab they come from, with live previews. */
export default function WidgetsScreen() {
  const { width } = useWindowDimensions();
  const rowWidth = width - spacing.lg * 2 - PREVIEW_INSET;
  const { data } = useDbQuery(loadDashboardData);
  const { data: widgets } = useDbQuery(getDashboard);
  const [sizes, setSizes] = useState<Partial<Record<WidgetType, WidgetSize>>>({});

  if (!data || !widgets) return <Loading />;

  const add = async (type: WidgetType, size: WidgetSize) => {
    await addWidget(type, size);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    goBack();
  };

  return (
    <Screen title="Додати віджет" mode="modal">
      {WIDGET_GROUPS.map((group) => (
        <View key={group.title} style={styles.group}>
          <Text variant="overline">{group.title}</Text>
          {group.types.map((type) => {
            const info = WIDGET_INFO[type];
            const size = sizes[type] ?? 'small';
            const count = widgets.filter((w) => w.type === type).length;
            return (
              <Card key={type}>
                <Row>
                  <Ionicons name={info.icon} size={18} color={colors.accent} />
                  <Text variant="heading" style={styles.flex}>
                    {info.title}
                  </Text>
                  {count > 0 && <Text variant="muted">вже є: {count}</Text>}
                </Row>
                <Text variant="muted">{info.description}</Text>
                <View style={styles.preview}>
                  <WidgetView
                    widget={{ id: `preview-${type}`, type, size }}
                    data={data}
                    width={tileWidth(size, rowWidth)}
                    interactive={false}
                  />
                </View>
                <ChipGroup
                  options={WIDGET_SIZES}
                  value={size}
                  onChange={(s) => setSizes((prev) => ({ ...prev, [type]: s }))}
                  labels={WIDGET_SIZE_LABELS}
                />
                <Button title="Додати на головну" icon="add" onPress={() => add(type, size)} />
              </Card>
            );
          })}
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
});
