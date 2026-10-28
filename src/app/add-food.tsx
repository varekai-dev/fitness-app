import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import {
  FoodPhotoScanner,
  type PhotoResult,
  type PhotoScan,
} from '@/components/food-photo-scanner';
import {
  KcalInput,
  MacroInputRow,
  NameInput,
  type MacroInputKey,
  type MacroInputValues,
} from '@/components/food-card-inputs';
import { MacroRow } from '@/components/macro-row';
import { MealPicker } from '@/components/meal-picker';
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
  cacheSuggestion,
  deleteFood,
  deleteMealTemplate,
  loadFood,
  logFood,
  lookupFood,
  lookupFoods,
  lookupProduct,
  rateFood,
  saveFood,
  searchFoods,
  type FailedFood,
  type FoundFood,
  type FoundProduct,
  type ManualFood,
  type ProductSource,
} from '@/db/food';
import type { Food, HealthRating, MealTemplate } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import {
  amountUnit,
  formatGrams,
  formatKcal,
  normalizeDish,
  scaleNutrition,
  splitDishes,
  sumMacros,
} from '@/lib/food';
import { GroqError, readFoodPhoto, type SuggestedFood } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { captureForAi, readForAi } from '@/lib/images';
import { MEALS, mealAt, type Meal } from '@/lib/meals';
import { parseDecimal } from '@/lib/metrics';
import { timeOnDay } from '@/lib/water';
import { colors, fontSize, radius, spacing } from '@/theme';

// Drinks come in bigger round volumes, so they step faster.
const amountStep = (isDrink: boolean) => (isDrink ? 50 : 10);
const MAX_AMOUNT = 5000;

/**
 * A dish waiting to be logged. `amount` is the raw field text (grams, or ml when
 * `isDrink`), so the user can clear it while typing; `isDrink` starts from the
 * AI's guess and the user can flip it.
 */
type Pending = {
  food: Food;
  cached: boolean;
  amount: string;
  isDrink: boolean;
  /** Set for a product photographed by its label. */
  source?: ProductSource;
};

const startPending = (
  food: Food,
  cached: boolean,
  amount: number | null = null,
  source?: ProductSource,
): Pending => ({
  food,
  cached,
  amount: String(Math.round(amount ?? food.portionG ?? 100)),
  isDrink: food.isDrink,
  source,
});

/** What a photo turned into: dishes to check in the field, or a product to log. */
type Scanned = { kind: 'dish'; text: string } | { kind: 'product'; found: FoundProduct };

const SOURCE_LABELS: Record<ProductSource, () => string> = {
  label: () => tr('З етикетки', 'From the label'),
  web: () => tr('Знайдено в інтернеті', 'Found on the web'),
  ai: () => tr('Оцінка AI за назвою', 'AI estimate by name'),
};

/** The chips the scanner shows for what it found. */
function scannedResult(scanned: Scanned): PhotoResult {
  if (scanned.kind === 'dish') {
    return {
      title: tr('Ось що на тарілці', 'Here’s what’s on the plate'),
      items: scanned.text.split(', '),
    };
  }
  const { food, source, site } = scanned.found;
  const per100 = scaleNutrition(food, 100);
  const unit = amountUnit(food);
  const g = tr('г', 'g');
  return {
    title: food.name,
    items: [
      `${formatKcal(per100.kcal)} ${tr('ккал', 'kcal')} / 100 ${unit}`,
      `${tr('Б', 'P')} ${formatGrams(per100.proteinG)} ${g} · ${tr('Ж', 'F')} ${formatGrams(per100.fatG)} ${g} · ${tr('В', 'C')} ${formatGrams(per100.carbsG)} ${g}`,
      site ? `${SOURCE_LABELS[source]()}: ${site}` : SOURCE_LABELS[source](),
    ],
  };
}

function parseSuggestion(json: string | undefined): SuggestedFood | undefined {
  try {
    const food = json ? (JSON.parse(json) as SuggestedFood) : undefined;
    return typeof food?.text === 'string' ? food : undefined;
  } catch {
    return undefined;
  }
}

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
  // `text` is a dish to calculate right away, e.g. a snack AI suggested for the day;
  // `food` is that suggestion with its numbers (SuggestedFood as JSON), to skip asking AI.
  const params = useLocalSearchParams<{
    meal?: string;
    day?: string;
    text?: string;
    food?: string;
  }>();
  // Opened without a meal (e.g. a deep link): pick it by the time of day. Switchable on screen.
  const [meal, setMeal] = useState<Meal>(
    () => MEALS.find((m) => m === params.meal) ?? mealAt(Date.now()),
  );
  const { data } = useDbQuery(() => loadFood());
  const [input, setInput] = useState(params.text ?? '');
  const { data: suggestions } = useDbQuery(() => searchFoods(input), [input]);
  // On from the start when a dish was passed in, calculated on mount.
  const [looking, setLooking] = useState(!!params.text);
  // Preview of the photo the text was recognized from, while it's being checked.
  const [photo, setPhoto] = useState<string | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  // The full-screen scan of the photo being recognized; null while it's closed.
  const [scan, setScan] = useState<PhotoScan | null>(null);
  // Bumped when a scan is closed, so its late answer is ignored.
  const scanRun = useRef(0);
  // What the open scan found, handed over once it has shown it.
  const scanned = useRef<Scanned | null>(null);
  const busy = looking || recognizing;
  // Dishes waiting to be logged: one, or each dish of a list like "яйця 150 г, курка 100 г".
  const [pending, setPending] = useState<Pending[]>([]);
  // Name the manual form starts with; null while it's closed.
  const [manual, setManual] = useState<string | null>(null);
  const dialog = useDialog();

  // A dish entered by hand goes to the cache, then on to picking the amount like any other.
  const saveManual = async (food: ManualFood) => {
    const saved = await saveFood(food);
    setManual(null);
    setInput('');
    setPending([startPending(saved, true)]);
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

  // A list with a weight for each dish becomes a card per dish.
  const findDishes = async (text: string, suggested?: SuggestedFood) => {
    const found = suggested ? await cacheSuggestion(suggested) : null;
    if (found) return [found];
    const dishes = splitDishes(text);
    return dishes.length > 1 ? lookupFoods(dishes) : [await lookupFood(text)];
  };

  // Calculates the dishes and opens their cards; `looking` is already on. Dishes
  // AI couldn't count stay in the field, there after cancelling to fix.
  const calculate = (text: string, suggested?: SuggestedFood) =>
    findDishes(text, suggested)
      .then((results) => {
        const found = results.filter((r): r is FoundFood => 'food' in r);
        const failed = results.filter((r): r is FailedFood => 'error' in r);
        if (found.length === 0) throw failed[0].error;
        setPending(found.map((r) => startPending(r.food, r.cached, r.amount)));
        setInput(failed.map((f) => f.text).join(', '));
        setPhoto(null);
        if (failed.length > 0) {
          dialog.show({
            title: tr('Не все пораховано', 'Not everything was counted'),
            message: failed.map((f) => `«${f.text}»: ${f.error.message}`).join('\n'),
            icon: 'alert-circle',
          });
        }
      })
      .catch((e) => showError(tr('Не вдалося порахувати', 'Couldn’t calculate'), e))
      .finally(() => setLooking(false));

  const lookup = (text: string) => {
    if (!text.trim() || busy) return;
    setLooking(true);
    return calculate(text);
  };

  // A dish passed in opens straight on its card; on failure it stays in the field to fix.
  useEffect(() => {
    if (params.text) calculate(params.text, parseSuggestion(params.food));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A plate becomes a description in the field, to check and fix before calculating;
  // a product's label opens straight on its card.
  const recognize = async (source: 'camera' | 'library') => {
    let image: Awaited<ReturnType<typeof captureForAi>>;
    try {
      image = await captureForAi(source);
    } catch (e) {
      showError(tr('Не вдалося зробити фото', 'Couldn’t take the photo'), e);
      return;
    }
    if (!image) return;
    const run = ++scanRun.current;
    const uri = image.uri;
    setPhoto(null);
    setScan({ uri });
    setRecognizing(true);
    let mode: PhotoScan['mode'];
    try {
      const photo = await readFoodPhoto(await readForAi(image));
      // A label: the scan reads text while the product's numbers are looked up.
      if (photo.kind === 'label') {
        mode = 'label';
        if (run === scanRun.current) setScan({ uri, mode });
      }
      const result: Scanned =
        photo.kind === 'dish'
          ? photo
          : { kind: 'product', found: await lookupProduct(photo.product) };
      if (run === scanRun.current) {
        scanned.current = result;
        setScan({ uri, mode, result: scannedResult(result) });
      }
    } catch (e) {
      const noKey = e instanceof GroqError && (e.kind === 'no-key' || e.kind === 'auth');
      if (run === scanRun.current) {
        setScan({ uri, mode, error: { message: (e as Error).message, settings: noKey } });
      }
    } finally {
      if (run === scanRun.current) setRecognizing(false);
    }
  };

  // The found dishes land in the field, under the photo they came from; a product on its card.
  const finishScan = () => {
    const result = scanned.current;
    if (!scan || !result) return;
    scanned.current = null;
    if (result.kind === 'dish') {
      setInput(result.text);
      setPhoto(scan.uri);
    } else {
      const { food, cached, amount, source } = result.found;
      setInput('');
      setPending([startPending(food, cached, amount, source)]);
    }
    setScan(null);
  };

  const closeScan = () => {
    scanRun.current++;
    scanned.current = null;
    setRecognizing(false);
    setScan(null);
  };

  const choosePhotoSource = () =>
    dialog.show({
      title: tr('Фото їжі чи етикетки', 'Photo of food or a label'),
      message: tr(
        'AI розпізнає страви й оцінить порції або прочитає КБЖВ з етикетки. Тарілку знімай згори, цілком; етикетку — так, щоб було видно назву й таблицю харчової цінності.',
        'AI recognizes the dishes and estimates the portions, or reads the nutrition off a label. Shoot the whole plate from above; a label so its name and nutrition table show.',
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
    setPending([startPending(food, true)]);
    setInput('');
  };

  const add = async () => {
    const ready = pending.flatMap((p) => {
      const amount = parseAmount(p.amount);
      return amount ? [{ ...p, amount }] : [];
    });
    if (ready.length === 0 || ready.length < pending.length) return;
    const at = eatenAt(params.day);
    for (const p of ready) await logFood(p.food, p.amount, meal, p.isDrink, at);
    goBack();
  };

  const pickTemplate = async (template: MealTemplate) => {
    await applyMealTemplate(template, meal, eatenAt(params.day));
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
    <Screen title={tr('Додати їжу', 'Add food')} mode="modal">
      <FoodPhotoScanner
        scan={scan}
        onFinish={finishScan}
        onClose={closeScan}
        onSettings={() => {
          closeScan();
          router.push('/settings/integrations');
        }}
      />
      <MealPicker meal={meal} onChange={setMeal} />
      {pending.length > 0 ? (
        <PendingList
          pending={pending}
          onChange={(i, patch) =>
            setPending(pending.map((p, j) => (j === i ? { ...p, ...patch } : p)))
          }
          onRemove={(i) => setPending(pending.filter((_, j) => j !== i))}
          onAdd={add}
          onCancel={() => setPending([])}
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

type PendingPatch = Partial<Pending>;

/**
 * The dishes waiting to be logged. One dish has its buttons on its card; a list
 * has a card per dish, each removable, and the total with the buttons below.
 */
function PendingList({
  pending,
  onChange,
  onRemove,
  onAdd,
  onCancel,
}: {
  pending: Pending[];
  onChange: (index: number, patch: PendingPatch) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  // The dish being fixed by hand, shown as the manual form in place of its card.
  const [editing, setEditing] = useState<number | null>(null);
  const amounts = pending.map((p) => parseAmount(p.amount));
  const many = pending.length > 1;
  const card = (p: Pending, i: number, children?: ReactNode) =>
    editing === i ? (
      <ManualCard
        key={`${i}-${p.food.id}`}
        initial={p}
        onSave={async (food) => {
          const saved = await saveFood(food, p.food.id);
          onChange(i, { food: saved, cached: true, isDrink: food.isDrink, source: undefined });
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    ) : (
      <PendingCard
        key={`${i}-${p.food.id}`}
        pending={p}
        onChange={(patch) => onChange(i, patch)}
        onEdit={editing === null ? () => setEditing(i) : undefined}
        onRemove={many ? () => onRemove(i) : undefined}>
        {children}
      </PendingCard>
    );
  // While a dish is being fixed, only its form's buttons show.
  const actions = editing === null && (
    <Row>
      <Button
        title={tr('Скасувати', 'Cancel')}
        variant="secondary"
        onPress={onCancel}
        style={styles.flex}
      />
      <Button
        title={
          many
            ? tr(`Додати все (${pending.length})`, `Add all (${pending.length})`)
            : tr('Додати', 'Add')
        }
        icon="add"
        onPress={onAdd}
        disabled={amounts.some((a) => !a)}
        style={styles.flex}
      />
    </Row>
  );
  if (!many) return card(pending[0], 0, actions);
  const total = sumMacros(pending.map((p, i) => scaleNutrition(p.food, amounts[i] ?? 0)));
  return (
    <>
      {pending.map((p, i) => card(p, i))}
      <Card>
        <Text variant="caption">{tr('Разом', 'Total')}</Text>
        <Text style={styles.pendingKcal}>
          {formatKcal(total.kcal)}
          <Text style={styles.unit}> {tr('ккал', 'kcal')}</Text>
        </Text>
        <MacroRow macros={total} />
        {actions}
      </Card>
    </>
  );
}

function PendingCard({
  pending: { food, cached, amount: amountText, isDrink, source },
  onChange,
  onEdit,
  onRemove,
  children,
}: {
  pending: Pending;
  onChange: (patch: PendingPatch) => void;
  /** Shown as a pencil: opens the dish's numbers in the manual form. */
  onEdit?: () => void;
  /** Shown as a close button on a dish of a list. */
  onRemove?: () => void;
  children?: ReactNode;
}) {
  const amount = parseAmount(amountText);
  const scaled = scaleNutrition(food, amount ?? 0);
  const per100 = scaleNutrition(food, 100);
  const unit = amountUnit({ isDrink });
  const stepSize = amountStep(isDrink);
  const step = (delta: number) => {
    const next = Math.min(Math.max((amount ?? 0) + delta, stepSize), MAX_AMOUNT);
    onChange({ amount: String(Math.round(next)) });
  };
  const setUnit = (drink: boolean) => onChange({ isDrink: drink });
  return (
    <Card style={styles.pending}>
      <Row style={styles.spaceBetween}>
        <View style={styles.flex}>
          <Text variant="heading">{food.name}</Text>
          <Text variant="muted">
            {source && source !== 'ai' ? (
              <>
                {SOURCE_LABELS[source]()}: {formatKcal(per100.kcal)} {tr('ккал', 'kcal')} / 100{' '}
                {unit}
              </>
            ) : (
              <>
                {cached ? tr('Зазвичай', 'Usually') : tr('Оцінка AI', 'AI estimate')}:{' '}
                {formatGrams(food.portionG ?? 100)} {unit} · {formatKcal(per100.kcal)}{' '}
                {tr('ккал', 'kcal')} / 100 {unit}
              </>
            )}
          </Text>
        </View>
        {source === 'label' ? (
          <Badge label={tr('Етикетка', 'Label')} tone="accent" />
        ) : source === 'web' ? (
          <Badge label={tr('Інтернет', 'Web')} tone="muted" />
        ) : (
          <Badge label={cached ? tr('З бази', 'Saved') : 'AI'} tone={cached ? 'muted' : 'accent'} />
        )}
        {onEdit && <CircleButton icon="pencil" size={32} onPress={onEdit} />}
        {onRemove && <CircleButton icon="close" size={32} onPress={onRemove} />}
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
      {children}
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

const MACRO_KEYS = ['kcal', 'proteinG', 'fatG', 'carbsG'] as const;

/** A number for a field: whole above 10, one decimal below. */
const fieldText = (n: number) => String(n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

/**
 * A dish typed in by hand: its name and nutrition per 100 g (or ml). With
 * `initial`, a dish already counted (by AI, a label or before) to fix.
 */
function ManualCard({
  initialName = '',
  initial,
  onSave,
  onCancel,
}: {
  initialName?: string;
  initial?: Pending;
  onSave: (food: ManualFood) => Promise<void>;
  onCancel: () => void;
}) {
  const per100 = initial && scaleNutrition(initial.food, 100);
  const [name, setName] = useState(initial?.food.name ?? initialName);
  const [isDrink, setIsDrink] = useState(initial?.isDrink ?? false);
  const [values, setValues] = useState<MacroInputValues>(() =>
    per100
      ? {
          kcal: fieldText(per100.kcal),
          proteinG: fieldText(per100.proteinG),
          fatG: fieldText(per100.fatG),
          carbsG: fieldText(per100.carbsG),
        }
      : { kcal: '', proteinG: '', fatG: '', carbsG: '' },
  );
  const [saving, setSaving] = useState(false);
  const parsed = Object.fromEntries(
    MACRO_KEYS.map((key) => [key, parseDecimal(values[key]) ?? 0]),
  ) as Record<MacroInputKey, number>;
  // Calories are required; macros left empty count as zero.
  const valid =
    name.trim() !== '' &&
    parseDecimal(values.kcal) !== null &&
    MACRO_KEYS.every((key) => values[key].trim() === '' || parseDecimal(values[key]) !== null);
  const unit = amountUnit({ isDrink });

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      // Fiber and sugar have no fields: a fixed dish keeps its own.
      await onSave({
        name,
        isDrink,
        fiberG: per100?.fiberG,
        sugarG: per100?.sugarG,
        ...parsed,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.pending}>
      <Row style={styles.spaceBetween}>
        <View style={styles.flex}>
          <NameInput
            value={name}
            onChangeText={setName}
            placeholder={tr('Напр. «Сирники»', 'E.g. “Pancakes”')}
            autoFocus={!initial && !initialName}
          />
        </View>
        <Badge label={initial ? tr('Редагую', 'Editing') : tr('Вручну', 'Manual')} tone="muted" />
      </Row>
      <Row style={styles.spaceBetween}>
        <Text variant="muted">
          {tr('На', 'Per')} 100 {unit}
        </Text>
        <UnitSwitch isDrink={isDrink} onChange={setIsDrink} />
      </Row>
      <KcalInput
        value={values.kcal}
        onChangeText={(t) => setValues({ ...values, kcal: t })}
        autoFocus={!initial && !!initialName}
      />
      <MacroInputRow values={values} onChange={(key, t) => setValues({ ...values, [key]: t })} />
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
