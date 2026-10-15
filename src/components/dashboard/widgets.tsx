import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Elapsed } from '@/components/elapsed';
import { Sparkline } from '@/components/line-chart';
import { Text, type IconName } from '@/components/ui';
import { drinkWater, GlassButton } from '@/components/water-card';
import { WaterBottle } from '@/components/water-bottle';
import type { DashboardData } from '@/db/dashboard';
import { startWorkout } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import { WIDGET_INFO, type Widget, type WidgetSize } from '@/lib/dashboard';
import { formatGrams, formatKcal } from '@/lib/food';
import {
  formatShortDate,
  formatWeightDelta,
  startOfWeek,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '@/lib/labels';
import { formatNumber, notStarted } from '@/lib/metrics';
import { formatMl, GLASS_PRESETS } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

/** Height of a small or medium tile; a large tile is two rows tall. */
export const TILE_HEIGHT = 156;
export const TILE_GAP = 12;

export const tileHeight = (size: WidgetSize) =>
  size === 'large' ? TILE_HEIGHT * 2 + TILE_GAP : TILE_HEIGHT;

/** Small tiles take half the row, medium and large the full width. */
export const tileWidth = (size: WidgetSize, rowWidth: number) =>
  size === 'small' ? (rowWidth - TILE_GAP) / 2 : rowWidth;

type WidgetProps = { size: WidgetSize; data: DashboardData };

/** Draws one dashboard tile. `interactive` is off in edit mode and in picker previews. */
export function WidgetView({
  widget,
  data,
  width,
  interactive = true,
}: {
  widget: Widget;
  data: DashboardData;
  width: number;
  interactive?: boolean;
}) {
  const props = { size: widget.size, data };
  const content = (() => {
    switch (widget.type) {
      case 'workout-next':
        return <WorkoutNextWidget {...props} />;
      case 'workout-week':
        return <WorkoutWeekWidget {...props} />;
      case 'food-calories':
        return <FoodCaloriesWidget {...props} />;
      case 'food-meals':
        return <FoodMealsWidget {...props} />;
      case 'water-today':
        return <WaterTodayWidget {...props} />;
      case 'water-week':
        return <WaterWeekWidget {...props} />;
      case 'weight':
        return <WeightWidget {...props} />;
    }
  })();
  return (
    <View
      style={{ width, height: tileHeight(widget.size) }}
      pointerEvents={interactive ? 'auto' : 'none'}>
      {content}
    </View>
  );
}

// ---------- building blocks ----------

function Tile({
  children,
  onPress,
  accent,
}: {
  children: ReactNode;
  onPress?: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        accent && styles.tileAccent,
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

function TileTitle({ title, icon, accent }: { title: string; icon: IconName; accent?: boolean }) {
  return (
    <View style={styles.titleRow}>
      <Ionicons name={icon} size={14} color={accent ? colors.accentText : colors.accent} />
      <Text
        variant="caption"
        style={[styles.titleText, accent && styles.onAccent]}
        numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const RING_STROKE = 6;

function ProgressRing({
  progress,
  icon,
  size = 56,
  overIsBad,
}: {
  progress: number;
  icon: IconName;
  size?: number;
  overIsBad?: boolean;
}) {
  const r = (size - RING_STROKE) / 2;
  const length = 2 * Math.PI * r;
  const over = overIsBad && progress > 1;
  const color = over ? colors.warning : colors.accent;
  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceRaised}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={length}
            strokeDashoffset={length * (1 - Math.min(progress, 1))}
            fill="none"
          />
        )}
      </Svg>
      <Ionicons name={icon} size={size * 0.36} color={color} />
    </View>
  );
}

function QuickButton({
  label,
  onPress,
  grow,
}: {
  label: string;
  onPress: () => void;
  /** Share a row equally with sibling buttons. */
  grow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.quick, grow && styles.flex, pressed && styles.quickPressed]}>
      <Ionicons name="add" size={14} color={colors.accent} />
      <Text variant="body" style={styles.quickText}>
        {label}
      </Text>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <Text variant="muted" style={styles.centerText}>
        {text}
      </Text>
    </View>
  );
}

const Big = ({ children, small }: { children: ReactNode; small?: boolean }) => (
  <Text style={[styles.big, small && styles.bigSmall]} numberOfLines={1}>
    {children}
  </Text>
);

const Unit = ({ children }: { children: ReactNode }) => <Text style={styles.unit}>{children}</Text>;

// ---------- training ----------

function WorkoutNextWidget({ size, data }: WidgetProps) {
  const { activeWorkout, program, nextDay } = data;

  if (activeWorkout) {
    const status = notStarted(activeWorkout)
      ? 'Не розпочато'
      : activeWorkout.pausedAt
        ? 'На паузі'
        : 'Триває';
    return (
      <Tile
        accent
        onPress={() =>
          router.push({ pathname: '/workout/[id]', params: { id: activeWorkout.id } })
        }>
        <TileTitle title={status} icon="pulse" accent />
        <Text
          style={[styles.heroTitle, size === 'small' && styles.heroTitleSmall]}
          numberOfLines={2}>
          {activeWorkout.dayName}
        </Text>
        {size !== 'small' && (
          <Text variant="caption" style={styles.onAccentMuted} numberOfLines={1}>
            {activeWorkout.programName}
          </Text>
        )}
        <Elapsed workout={activeWorkout} style={styles.heroElapsed} />
        <HeroAction icon="play" small={size === 'small'} />
      </Tile>
    );
  }

  if (!program || !nextDay) {
    return (
      <Tile
        onPress={() => router.navigate({ pathname: '/training', params: { view: 'programs' } })}>
        <TileTitle title={WIDGET_INFO['workout-next'].title} icon="play-circle" />
        <Empty text={program ? `У «${program.name}» ще немає днів` : 'Обери програму тренувань'} />
      </Tile>
    );
  }

  const start = async () => {
    try {
      const id = await startWorkout(nextDay.id);
      router.push({ pathname: '/workout/[id]', params: { id } });
    } catch {
      router.navigate('/training');
    }
  };
  const sets = nextDay.exercises.reduce((n, e) => n + e.targetSets, 0);
  const shown = nextDay.exercises.slice(0, 6);
  return (
    <Tile accent onPress={start}>
      <TileTitle title="Наступне тренування" icon="barbell" accent />
      <Text style={[styles.heroTitle, size === 'small' && styles.heroTitleSmall]} numberOfLines={2}>
        {nextDay.name}
      </Text>
      {size !== 'small' && (
        <Text variant="caption" style={styles.onAccentMuted} numberOfLines={1}>
          {program.name} · {nextDay.exercises.length} вправ · {sets} підходів
        </Text>
      )}
      {size === 'large' && (
        <View style={styles.heroList}>
          {shown.map((e, i) => (
            <View key={e.id} style={styles.heroRow}>
              <Text variant="muted" style={styles.heroIndex}>
                {String(i + 1).padStart(2, '0')}
              </Text>
              <Text variant="body" style={styles.onAccent} numberOfLines={1}>
                {e.exercise.name}
              </Text>
            </View>
          ))}
          {nextDay.exercises.length > shown.length && (
            <Text variant="caption" style={styles.onAccentMuted}>
              + ще {nextDay.exercises.length - shown.length}
            </Text>
          )}
        </View>
      )}
      <HeroAction icon="arrow-forward" small={size === 'small'} />
    </Tile>
  );
}

function HeroAction({ icon, small }: { icon: IconName; small?: boolean }) {
  const s = small ? 40 : 52;
  return (
    <View style={[styles.heroAction, { width: s, height: s }]}>
      <Ionicons name={icon} size={s * 0.45} color={colors.accent} />
    </View>
  );
}

function WorkoutWeekWidget({ size, data }: WidgetProps) {
  const { finished, bodyWeights, loadedAt } = data;
  const weekStart = startOfWeek(loadedAt);
  const thisWeek = finished.filter((w) => w.startedAt >= weekStart);
  const weekKcal =
    bodyWeights.length > 0
      ? thisWeek.reduce((sum, w) => sum + (estimateKcal(w, bodyWeights) ?? 0), 0)
      : null;
  const open = () => router.navigate({ pathname: '/training', params: { view: 'history' } });

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <TileTitle title="Цей тиждень" icon="flame" />
        <View style={styles.fill}>
          <Big>{thisWeek.length}</Big>
          <Text variant="muted">
            {thisWeek.length === 1 ? 'тренування' : 'тренувань'} · усього {finished.length}
          </Text>
        </View>
      </Tile>
    );
  }

  const daysDone = new Set(thisWeek.map((w) => weekdayIndex(w.startedAt)));
  const today = weekdayIndex(loadedAt);
  const last = finished[0];
  return (
    <Tile onPress={open}>
      <TileTitle title="Тиждень тренувань" icon="flame" />
      <View style={styles.statsRow}>
        <Stat value={String(thisWeek.length)} label="за тиждень" />
        <Stat
          value={weekKcal !== null ? formatKcal(weekKcal) : '—'}
          unit={weekKcal !== null ? 'ккал' : undefined}
          label="спалено"
        />
        <Stat value={String(finished.length)} label="усього" />
      </View>
      {size === 'large' && (
        <>
          <View style={styles.weekRow}>
            {WEEKDAY_SHORT.map((d, i) => (
              <View key={d} style={styles.weekDay}>
                <Text variant="caption" style={i === today && styles.today}>
                  {d}
                </Text>
                <View
                  style={[
                    styles.weekDot,
                    daysDone.has(i) && styles.weekDotDone,
                    i === today && styles.weekDotToday,
                  ]}>
                  {daysDone.has(i) && (
                    <Ionicons name="checkmark" size={16} color={colors.accentText} />
                  )}
                </View>
              </View>
            ))}
          </View>
          <Text variant="muted" numberOfLines={1}>
            {last
              ? `Останнє: ${last.dayName} · ${formatShortDate(last.startedAt)}`
              : 'Ще немає завершених тренувань'}
          </Text>
        </>
      )}
    </Tile>
  );
}

function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
        {unit ? <Unit> {unit}</Unit> : null}
      </Text>
      <Text variant="muted">{label}</Text>
    </View>
  );
}

// ---------- food ----------

function FoodCaloriesWidget({ size, data }: WidgetProps) {
  const { totals, goal } = data.food;
  const progress = goal > 0 ? totals.kcal / goal : 0;
  const left = goal - totals.kcal;
  const open = () => router.navigate('/food');

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <ProgressRing progress={progress} icon="restaurant" overIsBad />
        <View style={styles.bottom}>
          <Big small>
            {formatKcal(totals.kcal)}
            <Unit> ккал</Unit>
          </Big>
          <Text variant="muted">з {formatKcal(goal)}</Text>
        </View>
      </Tile>
    );
  }

  const macros = [
    { label: 'Білки', value: totals.proteinG },
    { label: 'Жири', value: totals.fatG },
    { label: 'Вуглеводи', value: totals.carbsG },
  ];
  return (
    <Tile onPress={open}>
      <TileTitle title="Калорії сьогодні" icon="restaurant" />
      <View style={styles.rowCenter}>
        <ProgressRing
          progress={progress}
          icon="restaurant"
          size={size === 'large' ? 96 : 48}
          overIsBad
        />
        <View style={styles.flex}>
          <Big>
            {formatKcal(totals.kcal)}
            <Unit> / {formatKcal(goal)}</Unit>
          </Big>
          <Text variant="muted">
            {left >= 0 ? `ще ${formatKcal(left)} ккал` : `понад ціль на ${formatKcal(-left)}`}
          </Text>
        </View>
      </View>
      <View style={styles.macros}>
        {macros.map((m) => (
          // Medium tiles have room for one line per macro only.
          <View
            key={m.label}
            style={[styles.macro, size === 'large' ? styles.macroLarge : styles.macroInline]}>
            <Text variant={size === 'large' ? 'heading' : 'body'} style={styles.macroValue}>
              {formatGrams(m.value)} г
            </Text>
            <Text variant="muted" numberOfLines={1}>
              {size === 'large' ? m.label : m.label.slice(0, 1)}
            </Text>
          </View>
        ))}
      </View>
    </Tile>
  );
}

const timeFormatter = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });

function FoodMealsWidget({ size, data }: WidgetProps) {
  const entries = [...data.food.todayEntries].reverse();
  const open = () => router.navigate('/food');
  const limit = size === 'large' ? 7 : 3;

  if (entries.length === 0) {
    return (
      <Tile onPress={open}>
        <TileTitle title="Прийоми їжі" icon="list" />
        <Empty text="Ще нічого не з’їдено" />
      </Tile>
    );
  }

  if (size === 'small') {
    const last = entries[0];
    return (
      <Tile onPress={open}>
        <TileTitle title="Прийоми їжі" icon="list" />
        <View style={styles.fill}>
          <Big>{entries.length}</Big>
          <Text variant="body" numberOfLines={1}>
            {last.name}
          </Text>
          <Text variant="muted">
            {timeFormatter.format(new Date(last.eatenAt))} · {formatKcal(last.kcal)} ккал
          </Text>
        </View>
      </Tile>
    );
  }

  return (
    <Tile onPress={open}>
      <TileTitle title={`Прийоми їжі · ${entries.length}`} icon="list" />
      <View style={styles.list}>
        {entries.slice(0, limit).map((e) => (
          <View key={e.id} style={styles.listRow}>
            <Text variant="muted" style={styles.listTime}>
              {timeFormatter.format(new Date(e.eatenAt))}
            </Text>
            <Text variant="body" style={styles.flex} numberOfLines={1}>
              {e.name}
            </Text>
            <Text variant="body" style={styles.listValue}>
              {formatKcal(e.kcal)}
            </Text>
          </View>
        ))}
        {entries.length > limit && <Text variant="muted">+ ще {entries.length - limit}</Text>}
      </View>
    </Tile>
  );
}

// ---------- water ----------

const QUICK_ML = 250;
const MEDIUM_GLASSES = GLASS_PRESETS.filter((g) => [250, 350, 500].includes(g.ml));
// Two rows of two tiles fit beside the bottle.
const LARGE_GLASSES = GLASS_PRESETS.filter((g) => [150, 250, 350, 500].includes(g.ml));

function WaterTodayWidget({ size, data }: WidgetProps) {
  const { todayMl, goal } = data.water;
  const progress = goal > 0 ? todayMl / goal : 0;
  const open = () => router.navigate('/water');
  const drink = (ml: number) => drinkWater(ml, todayMl, goal);

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <View style={styles.rowBetween}>
          <ProgressRing progress={progress} icon="water" size={48} />
          <View style={styles.right}>
            <Big small>
              {formatMl(todayMl)}
              <Unit> мл</Unit>
            </Big>
            <Text variant="muted">з {formatMl(goal)}</Text>
          </View>
        </View>
        <View style={styles.bottom}>
          <QuickButton label={`${QUICK_ML} мл`} onPress={() => drink(QUICK_ML)} />
        </View>
      </Tile>
    );
  }

  if (size === 'medium') {
    return (
      <Tile onPress={open}>
        <TileTitle title="Вода сьогодні" icon="water" />
        <View style={styles.rowCenter}>
          <ProgressRing progress={progress} icon="water" size={56} />
          <View style={styles.flex}>
            <Big>
              {formatMl(todayMl)}
              <Unit> / {formatMl(goal)} мл</Unit>
            </Big>
            <Text variant="muted">{Math.round(progress * 100)}% денної норми</Text>
          </View>
        </View>
        <View style={styles.quickRow}>
          {MEDIUM_GLASSES.map((g) => (
            <QuickButton key={g.ml} label={`${g.ml}`} onPress={() => drink(g.ml)} grow />
          ))}
        </View>
      </Tile>
    );
  }

  return (
    <Tile onPress={open}>
      <TileTitle title="Вода сьогодні" icon="water" />
      <View style={styles.waterLarge}>
        <WaterBottle progress={progress} height={230} />
        <View style={styles.waterSide}>
          <View>
            <Big>
              {formatMl(todayMl)}
              <Unit> мл</Unit>
            </Big>
            <Text variant="muted">
              з {formatMl(goal)} мл · {Math.round(progress * 100)}%
            </Text>
          </View>
          <View style={styles.glassGrid}>
            {LARGE_GLASSES.map((g) => (
              <View key={g.ml} style={styles.glassCell}>
                <GlassButton glass={g} onPress={() => drink(g.ml)} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </Tile>
  );
}

function WaterWeekWidget({ size, data }: WidgetProps) {
  const { days, goal, today } = data.water;
  const reached = days.filter((d) => d.totalMl >= goal).length;
  const open = () => router.navigate('/water');

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <TileTitle title="Вода за тиждень" icon="bar-chart" />
        <View style={styles.fill}>
          <Big>
            {reached}
            <Unit> / 7</Unit>
          </Big>
          <Text variant="muted">днів з виконаною ціллю</Text>
        </View>
      </Tile>
    );
  }

  const chartHeight = size === 'large' ? 190 : 64;
  const max = Math.max(goal, ...days.map((d) => d.totalMl));
  const average = days.reduce((s, d) => s + d.totalMl, 0) / days.length;
  return (
    <Tile onPress={open}>
      <TileTitle title={`Вода за тиждень · ціль ${reached}/7`} icon="bar-chart" />
      <View style={styles.bars}>
        {days.map((d) => (
          <View key={d.dayStart} style={styles.barColumn}>
            {size === 'large' && (
              <Text variant="muted" style={styles.barValue} numberOfLines={1}>
                {d.totalMl > 0 ? formatMl(d.totalMl) : ''}
              </Text>
            )}
            <View style={[styles.barTrack, { height: chartHeight }]}>
              <View style={[styles.goalLine, { bottom: (goal / max) * chartHeight }]} />
              <View
                style={[
                  styles.bar,
                  { height: Math.max((d.totalMl / max) * chartHeight, d.totalMl ? 3 : 0) },
                  d.totalMl < goal && styles.barPartial,
                ]}
              />
            </View>
            <Text variant="caption" style={[styles.barLabel, d.dayStart === today && styles.today]}>
              {WEEKDAY_SHORT[weekdayIndex(d.dayStart)]}
            </Text>
          </View>
        ))}
      </View>
      {size === 'large' && <Text variant="muted">У середньому {formatMl(average)} мл на день</Text>}
    </Tile>
  );
}

// ---------- body ----------

function WeightWidget({ size, data }: WidgetProps) {
  const { bodyWeights } = data;
  const latest = bodyWeights.at(-1);
  const prev = bodyWeights.at(-2);
  const open = () => router.push('/body-weight');

  if (!latest) {
    return (
      <Tile onPress={open}>
        <TileTitle title="Вага тіла" icon="scale" />
        <Empty text="Додай перше зважування" />
      </Tile>
    );
  }

  const delta = prev ? latest.weightKg - prev.weightKg : null;
  const recent = bodyWeights.slice(-30);
  const value = (
    <View>
      <Big small={size === 'small'}>
        {formatNumber(latest.weightKg, 1)}
        <Unit> кг</Unit>
      </Big>
      <Text variant="muted" numberOfLines={1}>
        {delta !== null ? `${formatWeightDelta(delta)} кг · ` : ''}
        {formatShortDate(latest.measuredAt)}
      </Text>
    </View>
  );

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <TileTitle title="Вага тіла" icon="scale" />
        <View style={styles.bottom}>{value}</View>
      </Tile>
    );
  }

  const ys = recent.map((w) => w.weightKg);
  return (
    <Tile onPress={open}>
      <TileTitle title="Вага тіла" icon="scale" />
      {value}
      <View style={styles.fillEnd}>
        {recent.length > 1 ? (
          <Sparkline
            points={recent.map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
            height={size === 'large' ? 170 : 48}
          />
        ) : (
          <Text variant="muted">Графік з’явиться після зважування в інший день.</Text>
        )}
        {size === 'large' && recent.length > 1 && (
          <Text variant="muted">
            Останні {recent.length}: від {formatNumber(Math.min(...ys), 1)} до{' '}
            {formatNumber(Math.max(...ys), 1)} кг
          </Text>
        )}
      </View>
    </Tile>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md + 2,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  tileAccent: { backgroundColor: colors.accent },
  pressed: { opacity: 0.85 },
  flex: { flex: 1 },
  fill: { flex: 1, justifyContent: 'flex-end' },
  fillEnd: { flex: 1, justifyContent: 'flex-end', gap: spacing.xs },
  bottom: { marginTop: 'auto' },
  right: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  titleText: { flex: 1, fontWeight: '600' },
  onAccent: { color: colors.accentText },
  onAccentMuted: { color: colors.onAccentMuted },
  big: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800', letterSpacing: -0.5 },
  bigSmall: { fontSize: fontSize.xl },
  unit: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  ring: { alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  quickPressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  quickText: { color: colors.accent, fontWeight: '700', fontSize: fontSize.sm },
  quickRow: { flexDirection: 'row', gap: spacing.sm },
  heroTitle: {
    color: colors.accentText,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroTitleSmall: { fontSize: fontSize.xl },
  heroElapsed: { color: colors.accentText, fontSize: fontSize.lg, fontWeight: '800' },
  heroList: { marginTop: spacing.sm, gap: spacing.xs, paddingRight: 64 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroIndex: { color: colors.onAccentMuted, fontWeight: '700', width: 22 },
  heroAction: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accentText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm, flex: 1, alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: spacing.xs },
  weekDot: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotDone: { backgroundColor: colors.accent },
  weekDotToday: { borderWidth: 1.5, borderColor: colors.accent },
  today: { color: colors.accent, fontWeight: '700' },
  macros: { flexDirection: 'row', gap: spacing.sm },
  macro: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  macroLarge: { paddingVertical: spacing.lg },
  macroInline: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs },
  macroValue: { fontWeight: '700' },
  list: { flex: 1, gap: spacing.xs + 2, justifyContent: 'flex-start', marginTop: spacing.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listTime: { width: 40 },
  listValue: { fontWeight: '700' },
  waterLarge: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg },
  waterSide: { flex: 1, height: '100%', justifyContent: 'space-between', paddingTop: spacing.sm },
  glassGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Row direction: GlassButton's flex: 1 then stretches it across, not down to nothing.
  glassCell: { flexBasis: '45%', flexGrow: 1, flexDirection: 'row' },
  bars: { flex: 1, flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center', gap: 2 },
  barValue: { fontSize: fontSize.xs - 2 },
  barTrack: { width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm / 2, backgroundColor: colors.accent },
  barPartial: { backgroundColor: colors.accentSoft },
  barLabel: { fontSize: fontSize.xs },
  goalLine: {
    position: 'absolute',
    left: -2,
    right: -2,
    height: 1,
    backgroundColor: colors.textMuted,
  },
});
