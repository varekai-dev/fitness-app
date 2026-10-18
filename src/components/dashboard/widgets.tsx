import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text as RNText, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Elapsed } from '@/components/elapsed';
import { Sparkline } from '@/components/line-chart';
import { GoalPulse, GrowArc, GrowBar, GrowColumn, PressScale } from '@/components/motion';
import { Text, type IconName } from '@/components/ui';
import { drinkWater, GlassButton } from '@/components/water-card';
import { WaterBottle } from '@/components/water-bottle';
import { useAnimatedNumber } from '@/hooks/use-animated-number';
import type { DashboardData } from '@/db/dashboard';
import { startWorkout } from '@/db/workouts';
import { estimateKcal } from '@/lib/calories';
import {
  isFixedSize,
  isStatType,
  STAT_INFO,
  WIDGET_INFO,
  type StatType,
  type Widget,
  type WidgetSize,
} from '@/lib/dashboard';
import { formatGrams, formatKcal } from '@/lib/food';
import { locale, plural, tr } from '@/lib/i18n';
import {
  formatShortDate,
  formatWeightDelta,
  startOfWeek,
  WEEKDAY_SHORT,
  weekdayIndex,
} from '@/lib/labels';
import { formatNumber, formatWeight, notStarted, workoutDurationMs } from '@/lib/metrics';
import { dailyPhrase } from '@/lib/motivation';
import { averageOfLogged, daysBetween, dayStreak, weekStreak } from '@/lib/stats';
import { formatVolume, kgToDisplay, unitSystem, VOLUME_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { GLASS_PRESETS } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

const KCAL = tr('ккал', 'kcal');
const KG = WEIGHT_UNIT;
const ML = VOLUME_UNIT;
const G = tr('г', 'g');

/** Height of a small or medium tile; a large tile is two rows tall. */
export const TILE_HEIGHT = 156;
export const TILE_GAP = 12;
export const STAT_TILE_HEIGHT = 120;
/**
 * Fits the title and two lines of the phrase. Fixed rather than the height of the text:
 * Sortable.Flex places tiles by measured heights, and a phrase that wrapped onto another
 * line after measuring left the tiles below drawn over it.
 */
export const QUOTE_TILE_HEIGHT = 108;

export const tileHeight = ({ type, size }: Pick<Widget, 'type' | 'size'>) =>
  isStatType(type)
    ? STAT_TILE_HEIGHT
    : type === 'quote'
      ? QUOTE_TILE_HEIGHT
      : size === 'large'
        ? TILE_HEIGHT * 2 + TILE_GAP
        : TILE_HEIGHT;

/**
 * Stat tiles take a third of the row, small tiles half, medium and large the full width.
 * Rounded down: fractions rounded up to whole pixels would push the last tile onto a new row.
 */
export const tileWidth = ({ type, size }: Pick<Widget, 'type' | 'size'>, rowWidth: number) =>
  isStatType(type)
    ? Math.floor((rowWidth - TILE_GAP * 2) / 3)
    : size === 'small' && !isFixedSize(type)
      ? Math.floor((rowWidth - TILE_GAP) / 2)
      : rowWidth;

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
    if (isStatType(widget.type)) return <StatWidget type={widget.type} data={data} />;
    switch (widget.type) {
      case 'quote':
        return <QuoteWidget {...props} />;
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
      style={{ width, height: tileHeight(widget) }}
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
    <PressScale
      onPress={onPress}
      disabled={!onPress}
      style={[styles.tile, accent && styles.tileAccent]}>
      {children}
    </PressScale>
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
  label,
  size = 56,
  overIsBad,
}: {
  progress: number;
  icon?: IconName;
  /** Drawn in the middle instead of the icon. */
  label?: string;
  size?: number;
  overIsBad?: boolean;
}) {
  const r = (size - RING_STROKE) / 2;
  const over = overIsBad && progress > 1;
  const color = over ? colors.warning : colors.accent;
  return (
    // A ring where more is better bounces when it closes.
    <GoalPulse
      reached={!overIsBad && progress >= 1}
      style={[styles.ring, { width: size, height: size }]}>
      <Svg width={size} height={size} style={styles.ringSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceRaised}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <GrowArc size={size} stroke={RING_STROKE} color={color} progress={progress} />
      </Svg>
      {label !== undefined ? (
        <Text style={[styles.ringLabel, { color }]}>{label}</Text>
      ) : (
        icon && <Ionicons name={icon} size={size * 0.36} color={color} />
      )}
    </GoalPulse>
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

// ---------- quote ----------

function QuoteWidget({ data }: WidgetProps) {
  return (
    <Tile>
      <View style={styles.quoteGlow} pointerEvents="none" />
      <TileTitle title={tr('Цитата дня', 'Quote of the day')} icon="flash" />
      <RNText style={styles.quote} numberOfLines={2} adjustsFontSizeToFit>
        {dailyPhrase(new Date(data.loadedAt))}
      </RNText>
    </Tile>
  );
}

// ---------- training ----------

function WorkoutNextWidget({ size, data }: WidgetProps) {
  const { activeWorkout, program, nextDay } = data;

  if (activeWorkout) {
    const status = notStarted(activeWorkout)
      ? tr('Не розпочато', 'Not started')
      : activeWorkout.pausedAt
        ? tr('На паузі', 'Paused')
        : tr('Триває', 'In progress');
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
        <Empty
          text={
            program
              ? tr(`У «${program.name}» ще немає днів`, `“${program.name}” has no days yet`)
              : tr('Обери програму тренувань', 'Choose a training program')
          }
        />
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
      <TileTitle title={tr('Наступне тренування', 'Next workout')} icon="barbell" accent />
      <Text style={[styles.heroTitle, size === 'small' && styles.heroTitleSmall]} numberOfLines={2}>
        {nextDay.name}
      </Text>
      {size !== 'small' && (
        <Text variant="caption" style={styles.onAccentMuted} numberOfLines={1}>
          {program.name} · {nextDay.exercises.length}{' '}
          {plural(
            nextDay.exercises.length,
            ['вправа', 'вправи', 'вправ'],
            ['exercise', 'exercises'],
          )}{' '}
          · {sets} {plural(sets, ['підхід', 'підходи', 'підходів'], ['set', 'sets'])}
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
              + {tr('ще', 'more')} {nextDay.exercises.length - shown.length}
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
        <TileTitle title={tr('Цей тиждень', 'This week')} icon="flame" />
        <View style={styles.fill}>
          <Big>{thisWeek.length}</Big>
          <Text variant="muted">
            {plural(
              thisWeek.length,
              ['тренування', 'тренування', 'тренувань'],
              ['workout', 'workouts'],
            )}{' '}
            · {tr('усього', 'total')} {finished.length}
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
      <TileTitle title={tr('Тиждень тренувань', 'Training week')} icon="flame" />
      <View style={styles.statsRow}>
        <Stat value={String(thisWeek.length)} label={tr('за тиждень', 'this week')} />
        <Stat
          value={weekKcal !== null ? formatKcal(weekKcal) : '—'}
          unit={weekKcal !== null ? KCAL : undefined}
          label={tr('спалено', 'burned')}
        />
        <Stat value={String(finished.length)} label={tr('усього', 'total')} />
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
              ? `${tr('Останнє', 'Last')}: ${last.dayName} · ${formatShortDate(last.startedAt)}`
              : tr('Ще немає завершених тренувань', 'No finished workouts yet')}
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
  const kcal = Math.round(useAnimatedNumber(totals.kcal));
  const open = () => router.navigate('/food');

  if (size === 'small') {
    // No macro goals exist, so each bar is that macro's share of today's kcal.
    const macroKcal = [
      { label: tr('Б', 'P'), grams: totals.proteinG, kcal: totals.proteinG * 4 },
      { label: tr('Ж', 'F'), grams: totals.fatG, kcal: totals.fatG * 9 },
      { label: tr('В', 'C'), grams: totals.carbsG, kcal: totals.carbsG * 4 },
    ];
    const macroTotal = macroKcal.reduce((sum, m) => sum + m.kcal, 0);
    return (
      <Tile onPress={open}>
        <View style={styles.titleWithRing}>
          <View style={styles.flex}>
            <TileTitle title={tr('Калорії', 'Calories')} icon="restaurant" />
          </View>
          <ProgressRing
            progress={progress}
            label={`${Math.round(progress * 100)}%`}
            size={36}
            overIsBad
          />
        </View>
        <View style={styles.macroBars}>
          {macroKcal.map((m) => (
            <View key={m.label} style={styles.macroBarRow}>
              <Text variant="caption" style={styles.macroBarLabel}>
                {m.label}
              </Text>
              <GrowBar
                progress={macroTotal > 0 ? m.kcal / macroTotal : 0}
                color={colors.accent}
                style={styles.macroBarTrack}
              />
              <Text variant="caption" style={styles.macroBarValue}>
                {formatGrams(m.grams)} {G}
              </Text>
            </View>
          ))}
        </View>
        <Big small>
          {formatKcal(kcal)}
          <Unit>
            {' '}
            / {formatKcal(goal)} {KCAL}
          </Unit>
        </Big>
      </Tile>
    );
  }

  const macros = [
    { label: tr('Білки', 'Protein'), value: totals.proteinG },
    { label: tr('Жири', 'Fat'), value: totals.fatG },
    { label: tr('Вуглеводи', 'Carbs'), value: totals.carbsG },
  ];
  return (
    <Tile onPress={open}>
      <TileTitle title={tr('Калорії сьогодні', 'Calories today')} icon="restaurant" />
      <View style={styles.rowCenter}>
        <ProgressRing
          progress={progress}
          icon="restaurant"
          size={size === 'large' ? 96 : 48}
          overIsBad
        />
        <View style={styles.flex}>
          <Big>
            {formatKcal(kcal)}
            <Unit> / {formatKcal(goal)}</Unit>
          </Big>
          <Text variant="muted">
            {left >= 0
              ? tr(`ще ${formatKcal(left)} ккал`, `${formatKcal(left)} kcal left`)
              : tr(`понад ціль на ${formatKcal(-left)}`, `${formatKcal(-left)} over goal`)}
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
              {formatGrams(m.value)} {G}
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

const timeFormatter = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

function FoodMealsWidget({ size, data }: WidgetProps) {
  const entries = [...data.food.dayEntries].reverse();
  const open = () => router.navigate('/food');
  const limit = size === 'large' ? 7 : 3;

  if (entries.length === 0) {
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Прийоми їжі', 'Meals')} icon="list" />
        <Empty text={tr('Ще нічого не з’їдено', 'Nothing eaten yet')} />
      </Tile>
    );
  }

  if (size === 'small') {
    const last = entries[0];
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Прийоми їжі', 'Meals')} icon="list" />
        <View style={styles.fill}>
          <Big>{entries.length}</Big>
          <Text variant="body" numberOfLines={1}>
            {last.name}
          </Text>
          <Text variant="muted">
            {timeFormatter.format(new Date(last.eatenAt))} · {formatKcal(last.kcal)} {KCAL}
          </Text>
        </View>
      </Tile>
    );
  }

  return (
    <Tile onPress={open}>
      <TileTitle title={`${tr('Прийоми їжі', 'Meals')} · ${entries.length}`} icon="list" />
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
        {entries.length > limit && (
          <Text variant="muted">
            + {tr('ще', 'more')} {entries.length - limit}
          </Text>
        )}
      </View>
    </Tile>
  );
}

// ---------- water ----------

// The glass.
const QUICK_ML = GLASS_PRESETS[1].ml;

function WaterTodayWidget({ size, data }: WidgetProps) {
  const { todayMl, goal } = data.water;
  const progress = goal > 0 ? todayMl / goal : 0;
  const ml = Math.round(useAnimatedNumber(todayMl));
  const open = () => router.navigate('/water');
  const drink = (ml: number) => drinkWater(ml, todayMl, goal);

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Вода', 'Water')} icon="water" />
        <View style={styles.bottleRow}>
          <GoalPulse reached={progress >= 1}>
            <WaterBottle progress={progress} height={64} />
          </GoalPulse>
          <View>
            <Big small>
              {Math.round(progress * 100)}
              <Unit> %</Unit>
            </Big>
            <Text variant="muted">{tr('норми', 'of goal')}</Text>
          </View>
        </View>
        <View style={styles.valueWithAction}>
          <Big small>
            {formatVolume(ml)}
            <Unit>
              {' '}
              / {formatVolume(goal)} {ML}
            </Unit>
          </Big>
          <Pressable
            onPress={() => drink(QUICK_ML)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr(
              `Додати ${formatVolume(QUICK_ML)} ${ML}`,
              `Add ${formatVolume(QUICK_ML)} ${ML}`,
            )}
            style={({ pressed }) => [styles.addRound, pressed && styles.quickPressed]}>
            <Ionicons name="add" size={20} color={colors.accentText} />
          </Pressable>
        </View>
      </Tile>
    );
  }

  if (size === 'medium') {
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Вода сьогодні', 'Water today')} icon="water" />
        <View style={styles.rowCenter}>
          <ProgressRing progress={progress} icon="water" size={56} />
          <View style={styles.flex}>
            <Big>
              {formatVolume(ml)}
              <Unit>
                {' '}
                / {formatVolume(goal)} {ML}
              </Unit>
            </Big>
            <Text variant="muted">
              {Math.round(progress * 100)}% {tr('денної норми', 'of daily goal')}
            </Text>
          </View>
        </View>
        <View style={styles.quickRow}>
          {GLASS_PRESETS.map((g) => (
            <QuickButton key={g.ml} label={formatVolume(g.ml)} onPress={() => drink(g.ml)} grow />
          ))}
        </View>
      </Tile>
    );
  }

  return (
    <Tile onPress={open}>
      <TileTitle title={tr('Вода сьогодні', 'Water today')} icon="water" />
      <View style={styles.waterLarge}>
        <GoalPulse reached={progress >= 1}>
          <WaterBottle progress={progress} height={230} />
        </GoalPulse>
        <View style={styles.waterSide}>
          <View>
            <Big>
              {formatVolume(ml)}
              <Unit> {ML}</Unit>
            </Big>
            <Text variant="muted">
              {tr('з', 'of')} {formatVolume(goal)} {ML} · {Math.round(progress * 100)}%
            </Text>
          </View>
          <View style={styles.glassGrid}>
            {GLASS_PRESETS.map((g) => (
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
        <TileTitle title={tr('Вода за тиждень', 'Water this week')} icon="bar-chart" />
        <View style={styles.fill}>
          <Big>
            {reached}
            <Unit> / 7</Unit>
          </Big>
          <Text variant="muted">{tr('днів з виконаною ціллю', 'days at goal')}</Text>
        </View>
      </Tile>
    );
  }

  const chartHeight = size === 'large' ? 190 : 64;
  const max = Math.max(goal, ...days.map((d) => d.totalMl));
  const average = days.reduce((s, d) => s + d.totalMl, 0) / days.length;
  return (
    <Tile onPress={open}>
      <TileTitle
        title={`${tr('Вода за тиждень · ціль', 'Water this week · goal')} ${reached}/7`}
        icon="bar-chart"
      />
      <View style={styles.bars}>
        {days.map((d) => (
          <View key={d.dayStart} style={styles.barColumn}>
            {size === 'large' && (
              <Text variant="muted" style={styles.barValue} numberOfLines={1}>
                {d.totalMl > 0 ? formatVolume(d.totalMl) : ''}
              </Text>
            )}
            <View style={[styles.barTrack, { height: chartHeight }]}>
              <View style={[styles.goalLine, { bottom: (goal / max) * chartHeight }]} />
              <GrowColumn
                height={Math.max((d.totalMl / max) * chartHeight, d.totalMl ? 3 : 0)}
                style={[styles.bar, d.totalMl < goal && styles.barPartial]}
              />
            </View>
            <Text variant="caption" style={[styles.barLabel, d.dayStart === today && styles.today]}>
              {WEEKDAY_SHORT[weekdayIndex(d.dayStart)]}
            </Text>
          </View>
        ))}
      </View>
      {size === 'large' && (
        <Text variant="muted">
          {tr(
            `У середньому ${formatVolume(average)} ${ML} на день`,
            `${formatVolume(average)} ${ML} a day on average`,
          )}
        </Text>
      )}
    </Tile>
  );
}

// ---------- stat tiles ----------

type StatValue = { value: string; unit?: string; label: string; onPress: () => void };

const openHistory = () => router.navigate({ pathname: '/training', params: { view: 'history' } });
const openFood = () => router.navigate('/food');
const openWater = () => router.navigate('/water');

/** "45 min" under an hour, "3.5 h" from there on. */
function formatHours(ms: number): Pick<StatValue, 'value' | 'unit'> {
  const min = Math.round(ms / 60_000);
  return min < 60
    ? { value: String(min), unit: tr('хв', 'min') }
    : { value: formatNumber(min / 60, 1), unit: tr('год', 'h') };
}

/** Weight lifted, in tonnes from a tonne up (thousands of pounds from 10 000 lb). */
function formatTonnage(kg: number): Pick<StatValue, 'value' | 'unit'> {
  if (unitSystem === 'imperial') {
    const lb = kgToDisplay(kg);
    return lb < 10_000
      ? { value: formatNumber(lb, 0), unit: KG }
      : { value: formatNumber(lb / 1000, 1), unit: tr('тис. фн', 'k lb') };
  }
  return kg < 1000
    ? { value: formatNumber(kg, 0), unit: KG }
    : { value: formatNumber(kg / 1000, 1), unit: tr('т', 't') };
}

const pluralDays = (n: number) => plural(n, ['день', 'дні', 'днів'], ['day', 'days']);

function statValue(type: StatType, data: DashboardData): StatValue {
  const { finished, bodyWeights, food, water, daily, loadedAt } = data;
  const weekStart = startOfWeek(loadedAt);
  const thisWeek = finished.filter((w) => w.startedAt >= weekStart);
  const kcalOf = (ws: typeof finished) =>
    bodyWeights.length > 0
      ? ws.reduce((sum, w) => sum + (estimateKcal(w, bodyWeights) ?? 0), 0)
      : null;

  switch (type) {
    case 'stat-workouts-week':
      return {
        value: String(thisWeek.length),
        label: tr('За тиждень', 'This week'),
        onPress: openHistory,
      };
    case 'stat-workouts-kcal': {
      const kcal = kcalOf(thisWeek);
      return {
        value: kcal !== null ? formatKcal(kcal) : '—',
        unit: kcal !== null ? KCAL : undefined,
        label: tr('Спалено', 'Burned'),
        onPress: openHistory,
      };
    }
    case 'stat-workouts-total':
      return { value: String(finished.length), label: tr('Усього', 'Total'), onPress: openHistory };
    case 'stat-workouts-time': {
      const ms = thisWeek.reduce((sum, w) => sum + workoutDurationMs(w, loadedAt), 0);
      return { ...formatHours(ms), label: tr('Час', 'Time'), onPress: openHistory };
    }
    case 'stat-workouts-volume': {
      let kg = 0;
      for (const w of thisWeek)
        for (const e of w.exercises) {
          const t = e.exercise.trackingType;
          if (t !== 'weight_reps' && t !== 'weighted_reps') continue;
          for (const set of e.sets)
            if (set.completedAt !== null) kg += (set.weightKg ?? 0) * (set.reps ?? 0);
        }
      return { ...formatTonnage(kg), label: tr('Тоннаж', 'Volume'), onPress: openHistory };
    }
    case 'stat-workouts-streak': {
      const n = weekStreak(
        loadedAt,
        finished.map((w) => w.startedAt),
      );
      return {
        value: String(n),
        unit: tr('тиж.', n === 1 ? 'wk' : 'wks'),
        label: tr('Поспіль', 'In a row'),
        onPress: openHistory,
      };
    }
    case 'stat-workouts-since': {
      const last = finished[0];
      if (!last)
        return {
          value: '—',
          label: tr('Ще без тренувань', 'No workouts yet'),
          onPress: openHistory,
        };
      const days = daysBetween(last.startedAt, loadedAt);
      return days === 0
        ? {
            value: tr('Сьогодні', 'Today'),
            label: tr('Тренування', 'Workout'),
            onPress: openHistory,
          }
        : {
            value: String(days),
            unit: pluralDays(days),
            label: tr('Перерва', 'Break'),
            onPress: openHistory,
          };
    }
    case 'stat-food-left': {
      const left = food.goal - food.totals.kcal;
      return {
        value: formatKcal(Math.abs(left)),
        unit: KCAL,
        label: left >= 0 ? tr('Лишилось', 'Left') : tr('Понад ціль', 'Over goal'),
        onPress: openFood,
      };
    }
    case 'stat-food-protein':
      return {
        value: formatGrams(food.totals.proteinG),
        unit: G,
        label: tr('Білок', 'Protein'),
        onPress: openFood,
      };
    case 'stat-food-average': {
      const avg = averageOfLogged(food.days.map((d) => d.kcal));
      return {
        value: avg !== null ? formatKcal(avg) : '—',
        unit: avg !== null ? KCAL : undefined,
        label: tr('Середнє', 'Average'),
        onPress: openFood,
      };
    }
    case 'stat-food-streak': {
      const n = dayStreak(loadedAt, (day) => {
        const kcal = daily.foodKcal.get(day) ?? 0;
        return kcal > 0 && kcal <= food.goal;
      });
      return {
        value: String(n),
        unit: pluralDays(n),
        label: tr('У межах цілі', 'Within goal'),
        onPress: openFood,
      };
    }
    case 'stat-food-balance': {
      const today = finished.filter((w) => w.startedAt >= food.today);
      const balance = food.totals.kcal - (kcalOf(today) ?? 0);
      const sign = balance > 0 ? '+' : balance < 0 ? '−' : '';
      return {
        value: `${sign}${formatKcal(Math.abs(balance))}`,
        unit: KCAL,
        label: tr('Баланс', 'Balance'),
        onPress: openFood,
      };
    }
    case 'stat-water-today': {
      const pct = water.goal > 0 ? Math.round((water.todayMl / water.goal) * 100) : 0;
      return {
        value: formatVolume(water.todayMl),
        unit: ML,
        label: tr(`${pct}% норми`, `${pct}% of goal`),
        onPress: openWater,
      };
    }
    case 'stat-water-average': {
      const avg = averageOfLogged(water.days.map((d) => d.totalMl));
      return {
        value: avg !== null ? formatVolume(avg) : '—',
        unit: avg !== null ? ML : undefined,
        label: tr('Середнє', 'Average'),
        onPress: openWater,
      };
    }
    case 'stat-water-goal-days': {
      const reached = water.days.filter((d) => d.totalMl >= water.goal).length;
      return {
        value: String(reached),
        unit: '/ 7',
        label: tr('З нормою', 'At goal'),
        onPress: openWater,
      };
    }
    case 'stat-water-streak': {
      const n = dayStreak(loadedAt, (day) => (daily.waterMl.get(day) ?? 0) >= water.goal);
      return {
        value: String(n),
        unit: pluralDays(n),
        label: tr('Поспіль', 'In a row'),
        onPress: openWater,
      };
    }
  }
}

/** One number with an icon and a caption, like the Training tab's stats. */
function StatWidget({ type, data }: { type: StatType; data: DashboardData }) {
  const { value, unit, label, onPress } = statValue(type, data);
  return (
    <Tile onPress={onPress}>
      <View style={styles.statTile}>
        <Ionicons name={STAT_INFO[type].icon} size={22} color={colors.accent} />
        <RNText style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
          {unit ? <Unit> {unit}</Unit> : null}
        </RNText>
        <Text variant="muted" style={styles.centerText} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Tile>
  );
}

// ---------- body ----------

function WeightWidget({ size, data }: WidgetProps) {
  const { bodyWeights } = data;
  const latest = bodyWeights.at(-1);
  const first = bodyWeights[0];
  const open = () => router.push('/body-weight');

  if (!latest) {
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Вага тіла', 'Body weight')} icon="scale" />
        <Empty text={tr('Додай перше зважування', 'Log your first weigh-in')} />
      </Tile>
    );
  }

  // Change since the first weigh-in.
  const delta = bodyWeights.length > 1 ? latest.weightKg - first.weightKg : null;
  const recent = bodyWeights.slice(-30);
  const value = (
    <View>
      <Big small={size === 'small'}>
        {formatWeight(latest.weightKg, 1)}
        <Unit> {KG}</Unit>
      </Big>
      <Text variant="muted" numberOfLines={1}>
        {delta !== null ? `${formatWeightDelta(delta)} ${KG} · ` : ''}
        {formatShortDate(latest.measuredAt)}
      </Text>
    </View>
  );

  if (size === 'small') {
    return (
      <Tile onPress={open}>
        <TileTitle title={tr('Вага тіла', 'Body weight')} icon="scale" />
        <View style={styles.fillCenter}>
          {recent.length > 1 ? (
            <Sparkline
              points={recent.map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
              height={36}
            />
          ) : (
            <Text variant="muted" style={styles.centerText}>
              {tr('Графік — після наступного зважування', 'Chart after the next weigh-in')}
            </Text>
          )}
        </View>
        <View>
          <View style={styles.valueWithAction}>
            <Big small>
              {formatWeight(latest.weightKg, 1)}
              <Unit> {KG}</Unit>
            </Big>
            {delta !== null && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>{formatWeightDelta(delta)}</Text>
              </View>
            )}
          </View>
          <Text variant="muted">{formatShortDate(latest.measuredAt)}</Text>
        </View>
      </Tile>
    );
  }

  const ys = recent.map((w) => kgToDisplay(w.weightKg));
  return (
    <Tile onPress={open}>
      <TileTitle title={tr('Вага тіла', 'Body weight')} icon="scale" />
      {value}
      <View style={styles.fillEnd}>
        {recent.length > 1 ? (
          <Sparkline
            points={recent.map((w) => ({ x: w.measuredAt, y: w.weightKg }))}
            height={size === 'large' ? 170 : 48}
          />
        ) : (
          <Text variant="muted">
            {tr(
              'Графік з’явиться після зважування в інший день.',
              'The chart appears after a weigh-in on another day.',
            )}
          </Text>
        )}
        {size === 'large' && recent.length > 1 && (
          <Text variant="muted">
            {tr('Останні', 'Last')} {recent.length}: {tr('від', 'from')}{' '}
            {formatNumber(Math.min(...ys), 1)} {tr('до', 'to')} {formatNumber(Math.max(...ys), 1)}{' '}
            {KG}
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
  quoteGlow: {
    position: 'absolute',
    right: -40,
    top: -60,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accentSoft,
  },
  quote: {
    color: colors.text,
    fontSize: fontSize.xl,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
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
  ringLabel: { fontSize: fontSize.xs - 1, fontWeight: '800' },
  titleWithRing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroBars: { flex: 1, justifyContent: 'center', gap: spacing.xs + 1 },
  macroBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  macroBarLabel: { width: 12, fontWeight: '700' },
  macroBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  macroBarFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  macroBarValue: { minWidth: 36, textAlign: 'right' },
  bottleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fillCenter: { flex: 1, justifyContent: 'center' },
  valueWithAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  addRound: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  chipText: { color: colors.accent, fontSize: fontSize.xs + 1, fontWeight: '700' },
  statTile: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
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
