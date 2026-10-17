import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { MacroRow } from '@/components/macro-row';
import {
  Badge,
  Button,
  Card,
  CircleButton,
  Field,
  goBack,
  Row,
  type IconName,
  Screen,
  Text,
} from '@/components/ui';
import {
  applyMealTemplate,
  deleteFood,
  deleteMealTemplate,
  loadFood,
  logFood,
  lookupFood,
  rateFood,
  saveFood,
  searchFoods,
  timeOnDay,
  type ManualFood,
} from '@/db/food';
import type { Food, HealthRating, MealTemplate } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { amountUnit, formatGrams, formatKcal, normalizeDish, scaleNutrition } from '@/lib/food';
import { describeFoodPhoto, GroqError } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { captureForAi } from '@/lib/images';
import { MEAL_LABELS, MEALS, mealAt, type Meal } from '@/lib/meals';
import { parseDecimal } from '@/lib/metrics';
import { colors, fontSize, radius, spacing } from '@/theme';

// Drinks come in bigger round volumes, so they step faster.
const amountStep = (isDrink: boolean) => (isDrink ? 50 : 10);
const MAX_AMOUNT = 5000;

/**
 * A dish waiting to be logged. `amount` is the raw field text (grams, or ml when
 * `isDrink`), so the user can clear it while typing; `isDrink` starts from the
 * AI's guess and the user can flip it.
 */
type Pending = { food: Food; cached: boolean; amount: string; isDrink: boolean };

const startPending = (food: Food, cached: boolean): Pending => ({
  food,
  cached,
  amount: String(Math.round(food.portionG ?? 100)),
  isDrink: food.isDrink,
});

function parseAmount(text: string) {
  const a = parseDecimal(text);
  return a !== null && a > 0 && a <= MAX_AMOUNT ? a : null;
}

/** Now, or the same time of day on `day` (its local midnight) when logging a past day. */
function eatenAt(day?: string) {
  const start = Number(day);
  return day && Number.isFinite(start) ? timeOnDay(start) : Date.now();
}

export default function AddFoodScreen() {
  // `text` fills in a dish to calculate, e.g. a snack AI suggested for the day.
  const params = useLocalSearchParams<{ meal?: string; day?: string; text?: string }>();
  // Opened without a meal (e.g. a deep link): pick it by the time of day.
  const [meal] = useState<Meal>(() => MEALS.find((m) => m === params.meal) ?? mealAt(Date.now()));
  const { data } = useDbQuery(() => loadFood());
  const [input, setInput] = useState(params.text ?? '');
  const { data: suggestions } = useDbQuery(() => searchFoods(input), [input]);
  const [looking, setLooking] = useState(false);
  // Preview of the photo the text was recognized from, while it's being checked.
  const [photo, setPhoto] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const busy = looking || recognizing;
  const [pending, setPending] = useState<Pending | null>(null);
  // Name the manual form starts with; null while it's closed.
  const [manual, setManual] = useState<string | null>(null);
  const dialog = useDialog();

  // A dish entered by hand goes to the cache, then on to picking the amount like any other.
  const saveManual = async (food: ManualFood) => {
    const saved = await saveFood(food);
    setManual(null);
    setInput('');
    setPending(startPending(saved, true));
  };

  const showError = (title: string, e: unknown) => {
    const noKey = e instanceof GroqError && (e.kind === 'no-key' || e.kind === 'auth');
    dialog.show({
      title,
      message: (e as Error).message,
      icon: 'alert-circle',
      buttons: noKey
        ? [
            { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
            {
              text: tr('Налаштування', 'Settings'),
              onPress: () => router.push('/settings/integrations'),
            },
          ]
        : undefined,
    });
  };

  const lookup = async (text: string) => {
    if (!text.trim() || busy) return;
    setLooking(true);
    try {
      const result = await lookupFood(text);
      setPending(startPending(result.food, result.cached));
      setInput('');
      setPhoto(null);
    } catch (e) {
      showError(tr('Не вдалося порахувати', 'Couldn’t calculate'), e);
    } finally {
      setLooking(false);
    }
  };

  // The photo becomes a description in the field, to check and fix before calculating.
  const recognize = async (source: 'camera' | 'library') => {
    let image: Awaited<ReturnType<typeof captureForAi>>;
    try {
      image = await captureForAi(source);
    } catch (e) {
      showError(tr('Не вдалося зробити фото', 'Couldn’t take the photo'), e);
      return;
    }
    if (!image) return;
    setPhoto(image.uri);
    setRecognizing(true);
    try {
      setInput(await describeFoodPhoto(image));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setPhoto(null);
      showError(tr('Не вдалося розпізнати', 'Couldn’t recognize'), e);
    } finally {
      setRecognizing(false);
    }
  };

  const choosePhotoSource = () =>
    dialog.show({
      title: tr('Фото страви', 'Photo of the dish'),
      message: tr(
        'AI розпізнає їжу й оцінить порції. Найкраще знімати тарілку згори, цілком.',
        'AI recognizes the food and estimates the portions. Shoot the whole plate from above.',
      ),
      icon: 'camera-outline',
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        { text: tr('Камера', 'Camera'), onPress: () => recognize('camera') },
        { text: tr('Галерея', 'Gallery'), onPress: () => recognize('library') },
      ],
    });

  const pick = (food: Food) => {
    // Dishes cached before portions had a weight need a fresh estimate to scale by grams.
    if (!food.portionG) return lookup(food.query);
    setPending(startPending(food, true));
    setInput('');
  };

  const add = async () => {
    const amount = pending && parseAmount(pending.amount);
    if (!pending || !amount) return;
    await logFood(pending.food, amount, meal, pending.isDrink, eatenAt(params.day));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    goBack();
  };

  const pickTemplate = async (template: MealTemplate) => {
    await applyMealTemplate(template, meal, eatenAt(params.day));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    goBack();
  };

  const forgetTemplate = (template: MealTemplate) =>
    dialog.show({
      title: tr('Видалити шаблон?', 'Delete template?'),
      message: tr(
        `«${template.name}» зникне зі списку шаблонів. Записи в журналі залишаться.`,
        `“${template.name}” will disappear from templates. Log entries stay.`,
      ),
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Видалити', 'Delete'),
          style: 'destructive',
          onPress: () => deleteMealTemplate(template.id),
        },
      ],
    });

  // Removes the dish from the cache only; meals already logged keep their values.
  const forget = (food: Food) =>
    dialog.show({
      title: tr('Прибрати з нещодавніх?', 'Remove from recent?'),
      message: tr(
        `«${food.name}» зникне зі списку й підказок. Записи в журналі залишаться, а наступного разу страву порахує AI.`,
        `“${food.name}” will disappear from the list and suggestions. Log entries stay, and next time AI will calculate the dish.`,
      ),
      buttons: [
        { text: tr('Скасувати', 'Cancel'), style: 'cancel' },
        {
          text: tr('Прибрати', 'Remove'),
          style: 'destructive',
          onPress: () => deleteFood(food.id),
        },
      ],
    });

  const typed = normalizeDish(input);
  // Hide the suggestion that exactly matches: submitting already reuses it.
  const shownSuggestions = typed ? (suggestions ?? []).filter((f) => f.query !== typed) : [];
  const recent = data?.recent ?? [];
  const templates = data?.templates ?? [];

  return (
    <Screen title={MEAL_LABELS[meal]} mode="modal">
      {pending ? (
        <PendingCard
          pending={pending}
          onChange={(patch) => setPending({ ...pending, ...patch })}
          onAdd={add}
          onCancel={() => setPending(null)}
        />
      ) : manual !== null ? (
        <ManualCard initialName={manual} onSave={saveManual} onCancel={() => setManual(null)} />
      ) : (
        <>
          <Card>
            {photo && (
              <Row style={styles.photoRow}>
                <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
                <Text variant="muted" style={styles.flex}>
                  {recognizing
                    ? tr('Розпізнаю, що на фото…', 'Recognizing the photo…')
                    : tr(
                        'Ось що я бачу. Виправ назви чи вагу, якщо треба, і порахуй.',
                        'Here’s what I see. Fix the names or amounts if needed, then calculate.',
                      )}
                </Text>
                {!busy && <CircleButton icon="close" size={32} onPress={() => setPhoto(null)} />}
              </Row>
            )}
            <Field
              value={input}
              onChangeText={setInput}
              placeholder={tr(
                'Що з’їв чи випив? Напр. «2 яйця і тост з маслом»',
                'What did you eat or drink? E.g. “2 eggs and buttered toast”',
              )}
              multiline
              autoFocus
              editable={!busy}
            />
            {shownSuggestions.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => pick(f)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}>
                <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                <Text variant="body" style={styles.flex} numberOfLines={1}>
                  {f.name}
                </Text>
                <Text variant="muted">
                  {formatKcal(f.kcal)} {tr('ккал', 'kcal')}
                </Text>
              </Pressable>
            ))}
            <Button
              title={looking ? tr('Рахую…', 'Calculating…') : tr('Порахувати', 'Calculate')}
              icon="sparkles"
              onPress={() => lookup(input)}
              loading={looking}
              disabled={!input.trim() || recognizing}
            />
            <Row>
              <Button
                title={tr('Фото', 'Photo')}
                icon="camera-outline"
                variant="secondary"
                onPress={choosePhotoSource}
                loading={recognizing}
                disabled={looking}
                style={styles.flex}
              />
              <Button
                title={tr('Вручну', 'Manually')}
                icon="create-outline"
                variant="secondary"
                onPress={() => setManual(input.trim())}
                disabled={busy}
                style={styles.flex}
              />
            </Row>
          </Card>
          {templates.length > 0 && (
            <>
              <Text variant="caption">{tr('Шаблони', 'Templates')}</Text>
              <Card style={styles.templates}>
                {templates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onPick={() => pickTemplate(t)}
                    onRemove={() => forgetTemplate(t)}
                  />
                ))}
              </Card>
            </>
          )}
          {recent.length > 0 && (
            <>
              <Text variant="caption">{tr('Нещодавні', 'Recent')}</Text>
              <View style={styles.recentList}>
                {recent.map((f) => (
                  <RecentChip
                    key={f.id}
                    food={f}
                    onPick={() => pick(f)}
                    onRemove={() => forget(f)}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}
      {dialog.element}
    </Screen>
  );
}

function PendingCard({
  pending: { food, cached, amount: amountText, isDrink },
  onChange,
  onAdd,
  onCancel,
}: {
  pending: Pending;
  onChange: (patch: Partial<Pick<Pending, 'amount' | 'isDrink'>>) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const amount = parseAmount(amountText);
  const scaled = scaleNutrition(food, amount ?? 0);
  const per100 = scaleNutrition(food, 100);
  const unit = amountUnit({ isDrink });
  const stepSize = amountStep(isDrink);
  const step = (delta: number) => {
    const next = Math.min(Math.max((amount ?? 0) + delta, stepSize), MAX_AMOUNT);
    Haptics.selectionAsync();
    onChange({ amount: String(Math.round(next)) });
  };
  const setUnit = (drink: boolean) => onChange({ isDrink: drink });
  return (
    <Card style={styles.pending}>
      <Row style={styles.spaceBetween}>
        <View style={styles.flex}>
          <Text variant="heading">{food.name}</Text>
          <Text variant="muted">
            {cached ? tr('Зазвичай', 'Usually') : tr('Оцінка AI', 'AI estimate')}:{' '}
            {formatGrams(food.portionG ?? 100)} {unit} · {formatKcal(per100.kcal)}{' '}
            {tr('ккал', 'kcal')} / 100 {unit}
          </Text>
        </View>
        <Badge label={cached ? tr('З бази', 'Saved') : 'AI'} tone={cached ? 'muted' : 'accent'} />
      </Row>
      <Text style={styles.pendingKcal}>
        {formatKcal(scaled.kcal)}
        <Text style={styles.unit}> {tr('ккал', 'kcal')}</Text>
      </Text>
      <MacroRow macros={scaled} />
      {(scaled.fiberG !== null || scaled.sugarG !== null) && (
        <Text variant="muted">
          {scaled.fiberG !== null
            ? `${tr('Клітковина', 'Fiber')} ${formatGrams(scaled.fiberG)} ${tr('г', 'g')}`
            : ''}
          {scaled.fiberG !== null && scaled.sugarG !== null ? ' · ' : ''}
          {scaled.sugarG !== null
            ? `${tr('Цукор', 'Sugar')} ${formatGrams(scaled.sugarG)} ${tr('г', 'g')}`
            : ''}
        </Text>
      )}
      <HealthNote key={food.id} food={food} />
      <Row style={styles.spaceBetween}>
        <Text variant="body">{tr('Кількість', 'Amount')}</Text>
        <UnitSwitch isDrink={isDrink} onChange={setUnit} />
      </Row>
      <Row style={styles.amountRow}>
        <CircleButton
          icon="remove"
          size={40}
          disabled={!amount || amount <= stepSize}
          onPress={() => step(-stepSize)}
        />
        <Field
          value={amountText}
          onChangeText={(t) => onChange({ amount: t.replace(/[^\d.,]/g, '') })}
          keyboardType="decimal-pad"
          selectTextOnFocus
          maxLength={6}
          containerStyle={styles.flex}
          style={styles.amountInput}
        />
        <Text variant="heading" style={styles.amountUnit}>
          {unit}
        </Text>
        <CircleButton
          icon="add"
          size={40}
          disabled={amount !== null && amount >= MAX_AMOUNT}
          onPress={() => step(stepSize)}
        />
      </Row>
      <Row>
        <Button
          title={tr('Скасувати', 'Cancel')}
          variant="secondary"
          onPress={onCancel}
          style={styles.flex}
        />
        <Button
          title={tr('Додати', 'Add')}
          icon="add"
          onPress={onAdd}
          disabled={!amount}
          style={styles.flex}
        />
      </Row>
    </Card>
  );
}

const HEALTH: Record<HealthRating, { label: () => string; icon: IconName; color: string }> = {
  healthy: { label: () => tr('Корисно', 'Healthy'), icon: 'leaf', color: colors.success },
  moderate: {
    label: () => tr('У міру', 'In moderation'),
    icon: 'alert-circle',
    color: colors.warning,
  },
  unhealthy: {
    label: () => tr('Не дуже корисно', 'Not so healthy'),
    icon: 'warning',
    color: colors.danger,
  },
};

/**
 * How healthy the dish is. Dishes without a rating yet (entered by hand, or
 * cached before ratings existed) are rated by AI here; without AI the row stays hidden.
 */
function HealthNote({ food }: { food: Food }) {
  const [rated, setRated] = useState<Pick<Food, 'health' | 'healthNote'> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (food.health) return;
    let live = true;
    rateFood(food)
      .then((r) => live && setRated(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [food]);

  const { health, healthNote } = food.health ? food : (rated ?? {});
  if (!health) {
    if (failed || rated) return null;
    return (
      <Row style={styles.health}>
        <Ionicons name="sparkles" size={18} color={colors.textMuted} />
        <Text variant="muted">{tr('Оцінюю корисність…', 'Rating how healthy it is…')}</Text>
      </Row>
    );
  }
  const { label, icon, color } = HEALTH[health];
  return (
    <Row style={[styles.health, { borderColor: color }]}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={styles.flex}>
        <Text variant="body" style={[styles.healthLabel, { color }]}>
          {label()}
        </Text>
        {healthNote && <Text variant="muted">{healthNote}</Text>}
      </View>
    </Row>
  );
}

/** Grams or millilitres. */
function UnitSwitch({
  isDrink,
  onChange,
}: {
  isDrink: boolean;
  onChange: (isDrink: boolean) => void;
}) {
  return (
    <Row style={styles.units}>
      {[false, true].map((drink) => (
        <Pressable
          key={String(drink)}
          onPress={() => {
            if (drink === isDrink) return;
            Haptics.selectionAsync();
            onChange(drink);
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: drink === isDrink }}
          style={[styles.unitChip, drink === isDrink && styles.unitChipActive]}>
          <Text
            variant="body"
            style={[styles.unitText, drink === isDrink && styles.unitTextActive]}>
            {amountUnit({ isDrink: drink })}
          </Text>
        </Pressable>
      ))}
    </Row>
  );
}

const MACRO_FIELDS = [
  { key: 'kcal', label: () => tr('Ккал', 'Kcal') },
  { key: 'proteinG', label: () => tr('Білки, г', 'Protein, g') },
  { key: 'fatG', label: () => tr('Жири, г', 'Fat, g') },
  { key: 'carbsG', label: () => tr('Вуглеводи, г', 'Carbs, g') },
] as const;
type MacroKey = (typeof MACRO_FIELDS)[number]['key'];

/** A dish typed in by hand: its name and nutrition per 100 g (or ml). */
function ManualCard({
  initialName,
  onSave,
  onCancel,
}: {
  initialName: string;
  onSave: (food: ManualFood) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [isDrink, setIsDrink] = useState(false);
  const [values, setValues] = useState<Record<MacroKey, string>>({
    kcal: '',
    proteinG: '',
    fatG: '',
    carbsG: '',
  });
  const [saving, setSaving] = useState(false);
  const parsed = Object.fromEntries(
    MACRO_FIELDS.map(({ key }) => [key, parseDecimal(values[key]) ?? 0]),
  ) as Record<MacroKey, number>;
  // Calories are required; macros left empty count as zero.
  const valid =
    name.trim() !== '' &&
    parseDecimal(values.kcal) !== null &&
    MACRO_FIELDS.every(
      ({ key }) => values[key].trim() === '' || parseDecimal(values[key]) !== null,
    );
  const unit = amountUnit({ isDrink });

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave({ name, isDrink, ...parsed });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.pending}>
      <Field
        label={tr('Назва', 'Name')}
        value={name}
        onChangeText={setName}
        placeholder={tr('Напр. «Сирники»', 'E.g. “Pancakes”')}
        autoFocus={!initialName}
        maxLength={80}
      />
      <Row style={styles.spaceBetween}>
        <Text variant="body">
          {tr('На', 'Per')} 100 {unit}
        </Text>
        <UnitSwitch isDrink={isDrink} onChange={setIsDrink} />
      </Row>
      <View style={styles.macroGrid}>
        {MACRO_FIELDS.map(({ key, label }) => (
          <Field
            key={key}
            label={label()}
            value={values[key]}
            onChangeText={(t) => setValues({ ...values, [key]: t.replace(/[^\d.,]/g, '') })}
            keyboardType="decimal-pad"
            placeholder="0"
            maxLength={6}
            autoFocus={key === 'kcal' && !!initialName}
            containerStyle={styles.macroField}
          />
        ))}
      </View>
      <Row>
        <Button
          title={tr('Скасувати', 'Cancel')}
          variant="secondary"
          onPress={onCancel}
          style={styles.flex}
        />
        <Button
          title={tr('Зберегти', 'Save')}
          icon="checkmark"
          onPress={save}
          loading={saving}
          disabled={!valid}
          style={styles.flex}
        />
      </Row>
    </Card>
  );
}

/** A saved meal: tap to log all its dishes, the cross to delete the template. */
function TemplateRow({
  template,
  onPick,
  onRemove,
}: {
  template: MealTemplate;
  onPick: () => void;
  onRemove: () => void;
}) {
  const kcal = template.items.reduce((sum, i) => sum + i.kcal, 0);
  return (
    <Row style={styles.template}>
      <Pressable
        onPress={onPick}
        onLongPress={onRemove}
        accessibilityRole="button"
        style={({ pressed }) => [styles.templatePick, pressed && styles.pressed]}>
        <Ionicons name="bookmark" size={16} color={colors.accent} />
        <Text variant="body" style={styles.flex} numberOfLines={2}>
          {template.name}
        </Text>
        <Text variant="muted">
          {formatKcal(kcal)} {tr('ккал', 'kcal')}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityLabel={tr(
          `Видалити шаблон «${template.name}»`,
          `Delete template “${template.name}”`,
        )}
        style={({ pressed }) => pressed && styles.pressed}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </Row>
  );
}

/** A recent dish: tap the name to log it again, the cross to forget it. */
function RecentChip({
  food,
  onPick,
  onRemove,
}: {
  food: Food;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.recent}>
      <Pressable
        onPress={onPick}
        onLongPress={onRemove}
        style={({ pressed }) => [styles.recentName, pressed && styles.pressed]}>
        <Text variant="body" style={styles.recentText} numberOfLines={1}>
          {food.name}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityLabel={tr(
          `Прибрати «${food.name}» з нещодавніх`,
          `Remove “${food.name}” from recent`,
        )}
        style={({ pressed }) => [styles.recentRemove, pressed && styles.pressed]}>
        <Ionicons name="close" size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  spaceBetween: { justifyContent: 'space-between' },
  unit: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '600' },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  pending: { borderWidth: 1, borderColor: colors.accent },
  pendingKcal: { color: colors.text, fontSize: fontSize.xxl + 4, fontWeight: '800' },
  units: {
    gap: 2,
    padding: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.glass,
  },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  recentName: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm + 2,
  },
  recentText: { fontSize: fontSize.sm, fontWeight: '600', maxWidth: 180 },
  recentRemove: {
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  unitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  unitChipActive: { backgroundColor: colors.accent },
  unitText: { color: colors.textSecondary, fontWeight: '700' },
  unitTextActive: { color: colors.accentText },
  amountRow: { gap: spacing.sm },
  health: {
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  healthLabel: { fontWeight: '700' },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macroField: { flexBasis: '45%', flexGrow: 1 },
  amountInput: { textAlign: 'center', fontSize: fontSize.xl, fontWeight: '700' },
  amountUnit: { color: colors.textSecondary, minWidth: 28 },
  photoRow: { gap: spacing.md },
  templates: { gap: 0, paddingVertical: spacing.xs },
  template: { gap: spacing.md },
  templatePick: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  photo: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
});
