import * as SecureStore from 'expo-secure-store';

import { HEALTH_RATINGS, type HealthRating } from '@/db/schema';
import { mergeDishes, splitAmount, sumMacros, type Macros } from '@/lib/food';
import { locale, tr } from '@/lib/i18n';
import { MEAL_LABELS, MEALS, type Meal } from '@/lib/meals';
import { WEIGHT_GOAL, type WeightGoal } from '@/lib/profile';

const KEY_NAME = 'groq_api_key';
const API = 'https://api.groq.com/openai/v1';
// Supports strict JSON Schema output on Groq; low reasoning keeps it fast and cheap.
export const GROQ_MODEL = 'openai/gpt-oss-120b';
// Reads images and also supports strict JSON Schema output.
const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';

export const getGroqKey = () => SecureStore.getItemAsync(KEY_NAME);
export const setGroqKey = (key: string) => SecureStore.setItemAsync(KEY_NAME, key.trim());
export const deleteGroqKey = () => SecureStore.deleteItemAsync(KEY_NAME);

/** "gsk_ab…wxyz" so the user can tell which key is saved without exposing it. */
export const maskKey = (key: string) =>
  key.length <= 12 ? '••••' : `${key.slice(0, 6)}…${key.slice(-4)}`;

export type Nutrition = {
  name: string;
  portion: string | null;
  portionG: number;
  isDrink: boolean;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  fiberG: number | null;
  sugarG: number | null;
  health: HealthRating | null;
  healthNote: string | null;
};

export class GroqError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'auth' | 'not-food' | 'network' | 'bad-response',
  ) {
    super(message);
  }
}

const HEALTH_RULES_UK = `- health: наскільки страва корисна для щоденного харчування: "healthy" (цільні продукти, овочі, фрукти, нежирний білок, крупи, вода, несолодкі напої), "moderate" (нормально в міру: випічка з цільного зерна, сир, м'ясо з жиром, сухофрукти), "unhealthy" (багато цукру, транс- чи насичених жирів, солі або сильна обробка: фастфуд, солодощі, газовані солодкі напої, ковбаси, алкоголь);
- health_note: одне коротке речення українською (до 80 символів), чому саме така оцінка.`;

const HEALTH_RULES_EN = `- health: how good the dish is for everyday eating: "healthy" (whole foods, vegetables, fruit, lean protein, grains, water, unsweetened drinks), "moderate" (fine in moderation: wholegrain baking, cheese, fatty meat, dried fruit), "unhealthy" (much sugar, trans or saturated fat, salt, or heavily processed: fast food, sweets, sugary sodas, sausages, alcohol);
- health_note: one short sentence in English (up to 80 characters) on why.`;

const SYSTEM_PROMPT_UK = `Ти нутриціолог. Користувач описує страву, продукт або напій (часто українською).
Визнач кількість:
- якщо в тексті є вага чи об'єм (напр. "200 г", "0,5 л", "330 мл"), portion_g дорівнює саме їй;
- якщо вказано кількість штук чи посуду (напр. "2 яйця", "тарілка борщу"), переведи її в грами чи мл;
- якщо кількість не вказано, бери середню звичайну порцію для дорослого.
Поля:
- name: коротка назва українською з великої літери, без кількості;
- is_drink: true для напоїв (вода, чай, кава, сік, молоко, кефір, смузі, алкоголь тощо), false для їжі, зокрема для супів;
- portion_g: кількість у грамах, а для напоїв — у мілілітрах, число більше 0;
- kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g: числа саме для portion_g, округлені до 1 знака;
${HEALTH_RULES_UK}
- is_food: false, якщо текст не є їжею чи напоєм (тоді числа 0).`;

const SYSTEM_PROMPT_EN = `You are a nutritionist. The user describes a dish, product or drink (in any language).
Determine the amount:
- if the text has a weight or volume (e.g. "200 g", "0.5 l", "330 ml"), portion_g equals exactly that;
- if it gives a count of items or dishes (e.g. "2 eggs", "a bowl of soup"), convert it to grams or ml;
- if no amount is given, use an average regular adult portion.
Fields:
- name: a short name in English, capitalized, without the amount;
- is_drink: true for drinks (water, tea, coffee, juice, milk, kefir, smoothies, alcohol, etc.), false for food, including soups;
- portion_g: the amount in grams, or for drinks in millilitres, a number greater than 0;
- kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g: numbers for exactly portion_g, rounded to 1 decimal;
${HEALTH_RULES_EN}
- is_food: false if the text is not a food or drink (then all numbers are 0).`;

/** Dish names come back in the app's language, like the rest of the food log. */
const SYSTEM_PROMPT = tr(SYSTEM_PROMPT_UK, SYSTEM_PROMPT_EN);

const SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean' },
    name: { type: 'string' },
    portion_g: { type: 'number' },
    is_drink: { type: 'boolean' },
    kcal: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fiber_g: { type: 'number' },
    sugar_g: { type: 'number' },
    health: { type: 'string', enum: HEALTH_RATINGS },
    health_note: { type: 'string' },
  },
  required: [
    'is_food',
    'name',
    'portion_g',
    'is_drink',
    'kcal',
    'protein_g',
    'fat_g',
    'carbs_g',
    'fiber_g',
    'sugar_g',
    'health',
    'health_note',
  ],
  additionalProperties: false,
};

type GroqNutrition = {
  is_food: boolean;
  name: string;
  portion_g: number;
  is_drink: boolean;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  sugar_g: number;
  health: string;
  health_note: string;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

const healthRating = (v: unknown) => HEALTH_RATINGS.find((r) => r === v) ?? null;
const healthNote = (v: unknown) => (typeof v === 'string' && v.trim()) || null;

/** A user message with a photo: the text plus the image as a data URL. */
type UserContent =
  string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

export type GroqRequest<T> = {
  system: string;
  user: UserContent;
  /** Defaults to `GROQ_MODEL`. */
  model?: string;
  /** Strict JSON Schema the reply must follow. */
  schema: object;
  schemaName: string;
  temperature?: number;
  /** `none` turns thinking off on models that think by default. */
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  /** Room for reasoning plus the reply; a reply cut short fails the schema. */
  maxTokens?: number;
  /**
   * Whether the reply is good enough; a rejected one is asked for again. The
   * last attempt's reply is returned even when rejected, for the caller to judge.
   */
  accept?: (reply: T) => boolean;
  /** Called before each try, 1-based, e.g. to show that AI is trying again. */
  onAttempt?: (attempt: number) => void;
  apiKey?: string | null;
};

// AI that failed (a reply cut short, a server error, a weak answer) usually copes when asked again.
export const GROQ_ATTEMPTS = 3;

/** The key to call Groq with; throws `GroqError` when there is none. */
async function requireKey(apiKey?: string | null) {
  const key = apiKey ?? (await getGroqKey());
  if (!key)
    throw new GroqError(
      tr('Додай ключ Groq API у налаштуваннях.', 'Add a Groq API key in settings.'),
      'no-key',
    );
  return key;
}

/** One chat completion request; throws `GroqError` when Groq can't be reached or rejects the key. */
async function postCompletion(key: string, body: object) {
  let res: Response;
  try {
    res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GroqError(
      tr('Немає з’єднання з Groq. Перевір інтернет.', 'Can’t reach Groq. Check your internet.'),
      'network',
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new GroqError(
      tr(
        'Groq відхилив ключ. Перевір його в налаштуваннях.',
        'Groq rejected the key. Check it in settings.',
      ),
      'auth',
    );
  }
  return res;
}

/** One chat completion parsed as JSON; throws `GroqError` with a user-facing message. */
export async function groqJson<T>({
  system,
  user,
  model = GROQ_MODEL,
  schema,
  schemaName,
  temperature = 0,
  reasoningEffort = 'low',
  maxTokens,
  accept,
  onAttempt,
  apiKey,
}: GroqRequest<T>): Promise<T> {
  const key = await requireKey(apiKey);

  const badResponse = new GroqError(
    tr(
      'AI повернув неповну відповідь. Спробуй ще раз.',
      'AI returned an incomplete answer. Try again.',
    ),
    'bad-response',
  );

  for (let attempt = 1; ; attempt++) {
    const last = attempt === GROQ_ATTEMPTS;
    onAttempt?.(attempt);
    const res = await postCompletion(key, {
      model,
      temperature,
      reasoning_effort: reasoningEffort,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, schema, strict: true },
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const failedSchema = res.status === 400 && body.includes('json_validate_failed');
      if ((failedSchema || res.status >= 500) && !last) continue;
      if (failedSchema) throw badResponse;
      throw new GroqError(
        `${tr('Groq повернув помилку', 'Groq returned error')} ${res.status}. ${body.slice(0, 200)}`,
        'network',
      );
    }

    let reply: T;
    try {
      const json = await res.json();
      reply = JSON.parse(json.choices[0].message.content) as T;
    } catch {
      if (!last) continue;
      throw badResponse;
    }
    if (last || !accept || accept(reply)) return reply;
  }
}

/** Asks Groq for the nutrition of `dish`; throws `GroqError` with a user-facing message. */
export async function askGroqNutrition(dish: string, apiKey?: string | null): Promise<Nutrition> {
  const parsed = await groqJson<GroqNutrition>({
    system: SYSTEM_PROMPT,
    user: dish,
    schema: SCHEMA,
    schemaName: 'nutrition',
    apiKey,
  });
  return toNutrition(parsed, dish);
}

const LIST_PROMPT = tr(
  `${SYSTEM_PROMPT_UK}
Користувач перелічує кілька позицій, по одній на рядок. Поверни items: по одній відповіді з полями вище на кожен рядок, у тому самому порядку.`,
  `${SYSTEM_PROMPT_EN}
The user lists several items, one per line. Return items: one answer with the fields above for each line, in the same order.`,
);

const LIST_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: SCHEMA } },
  required: ['items'],
  additionalProperties: false,
};

/**
 * The nutrition of several dishes in one request, in their order. A dish AI
 * couldn't count (not food, no portion) is its `GroqError` instead; a failed
 * request throws one.
 */
export async function askGroqNutritionList(dishes: string[]): Promise<(Nutrition | GroqError)[]> {
  const parsed = await groqJson<{ items: GroqNutrition[] }>({
    system: LIST_PROMPT,
    user: dishes.join('\n'),
    schema: LIST_SCHEMA,
    schemaName: 'nutrition_list',
    accept: (r) => r.items.length === dishes.length,
  });
  if (parsed.items.length !== dishes.length) {
    throw new GroqError(
      tr(
        'AI повернув неповну відповідь. Спробуй ще раз.',
        'AI returned an incomplete answer. Try again.',
      ),
      'bad-response',
    );
  }
  return dishes.map((dish, i) => {
    try {
      return toNutrition(parsed.items[i], dish);
    } catch (e) {
      return e as GroqError;
    }
  });
}

/** One dish of AI's answer as `Nutrition`; throws `GroqError` when it isn't usable. */
function toNutrition(parsed: GroqNutrition, dish: string): Nutrition {
  if (parsed.is_food && !(num(parsed.portion_g) > 0)) {
    throw new GroqError(
      tr(
        'Groq не визначив вагу чи об’єм порції. Уточни опис.',
        'Groq couldn’t tell the portion size. Add more detail.',
      ),
      'bad-response',
    );
  }
  if (!parsed.is_food) {
    throw new GroqError(
      tr(
        'Схоже, це не страва. Опиши, що саме ти з’їв.',
        'That doesn’t look like food. Describe what you ate.',
      ),
      'not-food',
    );
  }
  return {
    name: parsed.name?.trim() || dish,
    portion: null,
    portionG: num(parsed.portion_g),
    isDrink: parsed.is_drink === true,
    kcal: num(parsed.kcal),
    proteinG: num(parsed.protein_g),
    fatG: num(parsed.fat_g),
    carbsG: num(parsed.carbs_g),
    fiberG: num(parsed.fiber_g),
    sugarG: num(parsed.sugar_g),
    health: healthRating(parsed.health),
    healthNote: healthNote(parsed.health_note),
  };
}

const HEALTH_SCHEMA = {
  type: 'object',
  properties: {
    health: { type: 'string', enum: HEALTH_RATINGS },
    health_note: { type: 'string' },
  },
  required: ['health', 'health_note'],
  additionalProperties: false,
};

const HEALTH_PROMPT = tr(
  `Ти нутриціолог. Користувач називає страву та її КБЖВ на 100 г. Оціни її:
${HEALTH_RULES_UK}`,
  `You are a nutritionist. The user names a dish and its nutrition per 100 g. Rate it:
${HEALTH_RULES_EN}`,
);

/**
 * Rates a dish that already has its nutrition (one entered by hand, or cached
 * before ratings existed); throws `GroqError` with a user-facing message.
 */
export async function askGroqHealth(dish: {
  name: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  sugarG: number | null;
}): Promise<Pick<Nutrition, 'health' | 'healthNote'>> {
  const r = (v: number) => Math.round(v * 10) / 10;
  const facts = [
    `${tr('ккал', 'kcal')} ${r(dish.kcal)}`,
    `${tr('білки', 'protein')} ${r(dish.proteinG)}`,
    `${tr('жири', 'fat')} ${r(dish.fatG)}`,
    `${tr('вуглеводи', 'carbs')} ${r(dish.carbsG)}`,
    dish.sugarG !== null ? `${tr('цукор', 'sugar')} ${r(dish.sugarG)}` : null,
  ].filter(Boolean);
  const parsed = await groqJson<{ health: string; health_note: string }>({
    system: HEALTH_PROMPT,
    user: `${dish.name}: ${facts.join(', ')}`,
    schema: HEALTH_SCHEMA,
    schemaName: 'health',
  });
  return { health: healthRating(parsed.health), healthNote: healthNote(parsed.health_note) };
}

const PHOTO_PROMPT = tr(
  `Ти нутриціолог. На фото або їжа чи напій (найчастіше тарілка зверху або збоку), або упаковка продукту чи її етикетка.
Спершу визнач kind:
- "label" — упаковка, етикетка чи таблиця харчової цінності продукту з магазину;
- "dish" — приготована їжа, тарілка, фрукти чи напій без етикетки;
- "none" — на фото немає їжі.
Для "dish" заповни items, а product залиш порожнім (рядки "", числа 0, false):
- назви все, що видно, і оціни кількість кожного за розміром тарілки, приборів, рук і упаковок;
- страву з кількох інгредієнтів (борщ, салат, піца, бутерброд) називай однією позицією;
- окремі страви на тарілці (гарнір, м'ясо, овочі, хліб, соус) — окремими позиціями;
- напиши, як приготовано, якщо це видно: смажене, варене, запечене;
- name — коротко українською з малої літери, без кількості; amount — число більше 0; unit — "g" для їжі, "ml" для напоїв і рідких страв у склянці.
Для "label" заповни product, а items залиш порожнім:
- name — назва продукту українською з великої літери, без бренду й ваги (напр. "Йогурт полуничний 2,5%");
- original_name — назва так, як надрукована на упаковці, без бренду;
- brand — торгова марка, "" якщо не видно;
- barcode — цифри штрихкоду, якщо їх видно повністю, інакше "";
- is_drink — true для напоїв;
- net_amount — вага чи об'єм нетто всієї упаковки в г чи мл, 0 якщо не видно;
- serving_amount — порція, вказана на етикетці, в г чи мл, 0 якщо не вказано;
- nutrition_visible — true, лише якщо на фото чітко видно калорійність або білки, жири й вуглеводи;
- kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g — саме з етикетки, на 100 г (чи 100 мл). Якщо вказано лише на порцію, перерахуй на 100 г. Калорії — в ккал, не в кДж. Чого не видно — 0.
Не вигадуй цифр: переписуй лише ті, що видно на фото.`,
  `You are a nutritionist. The photo shows either food or a drink (usually a plate from above or the side), or a product's packaging or its label.
First pick kind:
- "label": a shop product's packaging, label or nutrition facts table;
- "dish": cooked food, a plate, fruit or a drink without a label;
- "none": there is no food in the photo.
For "dish" fill items and leave product empty ("" strings, 0 numbers, false):
- name everything you can see and estimate the amount of each by the size of the plate, cutlery, hands and packaging;
- a dish made of several ingredients (soup, salad, pizza, sandwich) is one item;
- separate dishes on a plate (side, meat, vegetables, bread, sauce) are separate items;
- say how it is cooked if you can see it: fried, boiled, baked;
- name: short, in English, lowercase, without the amount; amount: a number greater than 0; unit: "g" for food, "ml" for drinks and liquids in a glass.
For "label" fill product and leave items empty:
- name: the product's name in English, capitalized, without the brand or weight (e.g. "Strawberry yogurt 2.5%");
- original_name: the name as printed on the package, without the brand;
- brand: the brand, "" if not visible;
- barcode: the barcode digits if all of them are visible, otherwise "";
- is_drink: true for drinks;
- net_amount: the net weight or volume of the whole package in g or ml, 0 if not visible;
- serving_amount: the serving the label states, in g or ml, 0 if none;
- nutrition_visible: true only if the calories, or protein, fat and carbs, are clearly visible in the photo;
- kcal, protein_g, fat_g, carbs_g, fiber_g, sugar_g: exactly from the label, per 100 g (or 100 ml). If it only gives them per serving, convert to per 100 g. Calories in kcal, not kJ. Anything not visible is 0.
Don't make numbers up: copy only those visible in the photo.`,
);

const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['dish', 'label', 'none'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          unit: { type: 'string', enum: ['g', 'ml'] },
        },
        required: ['name', 'amount', 'unit'],
        additionalProperties: false,
      },
    },
    product: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        original_name: { type: 'string' },
        brand: { type: 'string' },
        barcode: { type: 'string' },
        is_drink: { type: 'boolean' },
        net_amount: { type: 'number' },
        serving_amount: { type: 'number' },
        nutrition_visible: { type: 'boolean' },
        kcal: { type: 'number' },
        protein_g: { type: 'number' },
        fat_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fiber_g: { type: 'number' },
        sugar_g: { type: 'number' },
      },
      required: [
        'name',
        'original_name',
        'brand',
        'barcode',
        'is_drink',
        'net_amount',
        'serving_amount',
        'nutrition_visible',
        'kcal',
        'protein_g',
        'fat_g',
        'carbs_g',
        'fiber_g',
        'sugar_g',
      ],
      additionalProperties: false,
    },
  },
  required: ['kind', 'items', 'product'],
  additionalProperties: false,
};

type GroqPhoto = {
  kind: 'dish' | 'label' | 'none';
  items: { name: string; amount: number; unit: string }[];
  product: {
    name: string;
    original_name: string;
    brand: string;
    barcode: string;
    is_drink: boolean;
    net_amount: number;
    serving_amount: number;
    nutrition_visible: boolean;
    kcal: number;
    protein_g: number;
    fat_g: number;
    carbs_g: number;
    fiber_g: number;
    sugar_g: number;
  };
};

/** Nutrition per 100 g (or ml), as on a label or a product's page. */
export type Per100 = Pick<Nutrition, 'kcal' | 'proteinG' | 'fatG' | 'carbsG' | 'fiberG' | 'sugarG'>;

/** A packaged product read off its label. */
export type LabelProduct = {
  name: string;
  /** The name as printed, to search the web by. */
  originalName: string;
  brand: string;
  barcode: string | null;
  isDrink: boolean;
  /** What to log by default: the label's serving, a small package whole, or null. */
  amount: number | null;
  /** Null when the label's numbers aren't in the photo (or don't add up). */
  nutrition: Per100 | null;
};

export type FoodPhoto = { kind: 'dish'; text: string } | { kind: 'label'; product: LabelProduct };

/** Amounts guessed from a photo are rough, so round numbers read more honestly. */
const roundAmount = (v: number) => Math.max(10, Math.round(v / 10) * 10);

// A package up to this size is likely eaten whole (a yogurt, a bar, a can); a bigger one isn't.
const WHOLE_PACKAGE_MAX = 500;
// A serving bigger than this is a misread.
const MAX_AMOUNT = 5000;
// Nothing has more per 100 g than pure fat; more means kJ was read as kcal.
const MAX_KCAL_100G = 900;

type RawPer100 = Pick<
  GroqPhoto['product'],
  'kcal' | 'protein_g' | 'fat_g' | 'carbs_g' | 'fiber_g' | 'sugar_g'
>;

/** AI's numbers per 100 g, or null when they're missing or impossible. */
function toPer100(p: RawPer100): Per100 | null {
  const proteinG = num(p.protein_g);
  const fatG = num(p.fat_g);
  const carbsG = num(p.carbs_g);
  const fromMacros = proteinG * 4 + fatG * 9 + carbsG * 4;
  let kcal = num(p.kcal) || fromMacros;
  if (kcal > MAX_KCAL_100G) kcal /= 4.184;
  if (!(kcal > 0) || kcal > MAX_KCAL_100G || proteinG + fatG + carbsG > 100) return null;
  return {
    kcal: Math.round(kcal * 10) / 10,
    proteinG,
    fatG,
    carbsG,
    fiberG: num(p.fiber_g) || null,
    sugarG: num(p.sugar_g) || null,
  };
}

function toLabelProduct(p: GroqPhoto['product']): LabelProduct {
  const serving = num(p.serving_amount);
  const net = num(p.net_amount);
  const barcode = p.barcode.replace(/\D/g, '');
  return {
    name: p.name.trim() || p.original_name.trim(),
    originalName: p.original_name.trim() || p.name.trim(),
    brand: p.brand.trim(),
    // EAN-8, UPC-A, EAN-13 or ITF-14; anything else was misread.
    barcode: [8, 12, 13, 14].includes(barcode.length) ? barcode : null,
    isDrink: p.is_drink === true,
    amount:
      serving > 0 && serving <= MAX_AMOUNT
        ? serving
        : net > 0 && net <= WHOLE_PACKAGE_MAX
          ? net
          : null,
    nutrition: p.nutrition_visible ? toPer100(p) : null,
  };
}

/**
 * Recognizes a food photo. A plate comes back described the way the user would
 * type it, e.g. "гречка 180 г, курячий стейк 120 г", for the usual nutrition
 * lookup; a product's label comes back as the product with the label's numbers,
 * if they're in the photo. Throws `GroqError` with a user-facing message.
 */
export async function readFoodPhoto(image: {
  base64: string;
  mimeType: string;
}): Promise<FoodPhoto> {
  const usable = (r: GroqPhoto) =>
    r.kind === 'label'
      ? !!(r.product.name.trim() || r.product.original_name.trim())
      : r.items.some((i) => i.name.trim() && num(i.amount) > 0);
  const parsed = await groqJson<GroqPhoto>({
    model: GROQ_VISION_MODEL,
    system: PHOTO_PROMPT,
    user: [
      { type: 'text', text: tr('Що на фото?', 'What is in the photo?') },
      { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
    ],
    schema: PHOTO_SCHEMA,
    schemaName: 'food_photo',
    reasoningEffort: 'none',
    accept: (r) => r.kind === 'none' || usable(r),
  });
  if (parsed.kind === 'label' && usable(parsed)) {
    return { kind: 'label', product: toLabelProduct(parsed.product) };
  }
  const items =
    parsed.kind === 'dish' ? parsed.items.filter((i) => i.name.trim() && num(i.amount) > 0) : [];
  if (items.length === 0) {
    throw new GroqError(
      tr(
        'Не бачу на фото їжі. Спробуй інше фото або опиши страву текстом.',
        'I can’t see any food in the photo. Try another one or describe the dish.',
      ),
      'not-food',
    );
  }
  const text = items
    .map(
      (i) =>
        `${i.name.trim()} ${roundAmount(i.amount)} ${i.unit === 'ml' ? tr('мл', 'ml') : tr('г', 'g')}`,
    )
    .join(', ');
  return { kind: 'dish', text };
}

const SEARCH_PROMPT = tr(
  `Користувач сфотографував упаковку продукту з магазину, але харчової цінності на фото не видно. Знайди в інтернеті харчову цінність саме цього продукту: той самий бренд і вид, а також смак і жирність, якщо вони відомі. Найкраще — сайт виробника чи магазину.
Відповідай коротко: ккал, білки, жири, вуглеводи, клітковина й цукор на 100 г (чи 100 мл) і сайт, де це знайдено. Якщо саме цього продукту не знайшов, так і напиши, не підставляй схожий.`,
  `The user photographed a shop product's package, but its nutrition isn't in the photo. Find this exact product's nutrition on the web: the same brand and kind, and the flavor and fat content when known. The maker's or a shop's site is best.
Answer briefly: kcal, protein, fat, carbs, fiber and sugar per 100 g (or 100 ml), and the site it's from. If you can't find this exact product, say so; don't substitute a similar one.`,
);

const FOUND_PROMPT = tr(
  `Ось результат пошуку харчової цінності продукту в інтернеті. Перепиши числа на 100 г (чи 100 мл):
- found: true, лише якщо знайдено калорійність або білки, жири й вуглеводи саме цього продукту;
- kcal — у ккал (кДж поділи на 4,184); protein_g, fat_g, carbs_g, fiber_g, sugar_g — у грамах; чого немає — 0;
- source: домен сайту, звідки числа (напр. "silpo.ua"), "" якщо невідомо.`,
  `Here is the result of a web search for a product's nutrition. Copy the numbers per 100 g (or 100 ml):
- found: true only if the calories, or protein, fat and carbs, of this exact product were found;
- kcal in kcal (divide kJ by 4.184); protein_g, fat_g, carbs_g, fiber_g, sugar_g in grams; anything missing is 0;
- source: the domain of the site the numbers are from (e.g. "tesco.com"), "" if unknown.`,
);

const FOUND_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    kcal: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fiber_g: { type: 'number' },
    sugar_g: { type: 'number' },
    source: { type: 'string' },
  },
  required: ['found', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'fiber_g', 'sugar_g', 'source'],
  additionalProperties: false,
};

/**
 * The product's nutrition per 100 g as found on the web, with the site it came
 * from, or null when AI didn't find this exact product. Web search can't reply
 * in a JSON schema, so a second request reads its answer. Throws `GroqError`.
 */
export async function searchProductNutrition(
  product: Pick<LabelProduct, 'name' | 'originalName' | 'brand' | 'barcode'>,
): Promise<(Per100 & { source: string | null }) | null> {
  const key = await requireKey();
  const wanted = [
    product.brand && `${tr('Бренд', 'Brand')}: ${product.brand}`,
    `${tr('Назва на упаковці', 'Name on the package')}: ${product.originalName}`,
    product.name !== product.originalName && `${tr('Переклад', 'Translation')}: ${product.name}`,
    product.barcode && `${tr('Штрихкод', 'Barcode')}: ${product.barcode}`,
  ]
    .filter(Boolean)
    .join('\n');
  const res = await postCompletion(key, {
    model: GROQ_MODEL,
    temperature: 0,
    // Higher effort makes the search browse much longer for little gain.
    reasoning_effort: 'low',
    tool_choice: 'required',
    tools: [{ type: 'browser_search' }],
    messages: [
      { role: 'system', content: SEARCH_PROMPT },
      { role: 'user', content: wanted },
    ],
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GroqError(
      `${tr('Groq повернув помилку', 'Groq returned error')} ${res.status}. ${body.slice(0, 200)}`,
      'network',
    );
  }
  const answer: unknown = (await res.json().catch(() => null))?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) return null;
  const parsed = await groqJson<RawPer100 & { found: boolean; source: string }>({
    system: FOUND_PROMPT,
    user: `${wanted}\n\n${answer}`,
    schema: FOUND_SCHEMA,
    schemaName: 'product_nutrition',
    apiKey: key,
  });
  const per100 = parsed.found ? toPer100(parsed) : null;
  return per100 && { ...per100, source: parsed.source.trim() || null };
}

/**
 * A food AI suggests, with its numbers for the amount in `text`, so tapping it
 * opens its card without asking AI again. Ones stored before that lack some.
 */
export type SuggestedFood = Pick<Macros, 'kcal' | 'proteinG'> &
  Partial<Pick<Macros, 'fatG' | 'carbsG'>> & {
    text: string;
    isDrink?: boolean;
    health?: HealthRating | null;
  };
export type DaySnack = SuggestedFood;
/** One food of a set that closes all of the day's gaps at once. */
export type DayFill = Macros & SuggestedFood;
/** A dish worth a word: good for the day's goal or one to cut back on. */
export type DayFood = { name: string; good: boolean; note: string };
/** What the day is most short of, for the numbers shown next to a suggestion. */
export type DayLacking = 'protein' | 'fat' | 'carbs' | 'kcal' | 'none';
export type DayReview = {
  headline: string;
  comment: string;
  /** Up to 3 foods that close the day's main gap. */
  snacks: DaySnack[];
  /** Missing from comments written before it was asked. */
  lacking?: DayLacking;
  /** Missing from comments written before dishes were judged. */
  foods?: DayFood[];
  /**
   * A set of foods closing all of the day's gaps, from comments written before
   * it was folded into `snacks`.
   */
  fill?: DayFill[];
  /** AI's caption over `fill`, from those comments. */
  fillTitle?: string;
};

export type DayReviewInput = {
  /** Today: the day is still going, so `now` matters. */
  isToday: boolean;
  now: number;
  goal: WeightGoal;
  targets: Macros;
  entries: (Macros & {
    meal: Meal;
    name: string;
    portion: string | null;
    fiberG: number | null;
    sugarG: number | null;
  })[];
};

const DAY_REVIEW_PROMPT = tr(
  `Ти уважний нутриціолог у застосунку для тренувань. Користувач дає підсумок харчування за день: ціль, що з'їв і скільки лишилось. Напиши короткий коментар до дня.
- Бери числа лише з підсумку, не рахуй їх заново. «Лишилось» додатне — ще треба добрати, від'ємне — перебір.
- Знайди головне: найбільший недобір чи перебір відносно цілі (білок важливіший за жири й вуглеводи) або похвали, якщо все в межах 10% від цілі.
- Якщо це сьогодні, зважай на час: зранку чи вдень недобір нормальний, тож підкажи, на що звернути увагу далі, а не дорікай.
- Оціни якість їжі з журналу з огляду на мету: що пішло на користь (білок, клітковина, овочі, цільні продукти), а що ні (багато цукру, смажене, фастфуд, солодощі, солодкі напої, порожні калорії).
Поля:
- headline: одне речення до 70 символів з головним числом, напр. «Мало білка — до цілі ще 40 г»; слово «сьогодні» лише якщо це сьогодні;
- comment: одне речення до 140 символів, дружньо й конкретно, без моралізування; не повторюй числа з headline, не називай поточний час і не перелічуй продуктів, які радиш у snacks — краще скажи, що змінити, згадавши страви з журналу;
- foods: до 4 найпомітніших страв із журналу — і корисні, і ні; name — назва страви так, як у журналі; good — true, якщо страва пішла на користь меті, false, якщо варто обмежити; note — чому, до 60 символів, напр. «багато білка й мало жиру» чи «майже весь цукор за день». Спершу корисні. Порожній список, якщо журнал порожній;
- lacking: чого найбільше бракує до цілі: "protein", "fat", "carbs" чи "kcal"; "none", якщо нічого помітно не бракує;
- snacks: якщо лишилось щонайменше 150 ккал і є помітний недобір — до 3 різних простих продуктів, які найкраще закривають головну нестачу (при недоборі білка — щонайменше 15 г білка на продукт) і разом не перевищують залишку ккал; для сьогодні — що з'їсти далі, для минулого дня — що можна було б з'їсти; прості продукти, які легко купити в Україні; text — рівно один продукт, як користувач написав би сам, з малої літери і з кількістю в грамах чи мл (не в штуках), без ком і переліків, напр. «грецький йогурт 200 г» чи «яйця варені 120 г»; kcal, protein_g, fat_g, carbs_g — для цієї кількості; is_drink — true для напоїв; health — наскільки продукт корисний: "healthy", "moderate" чи "unhealthy". Інакше порожній список.`,
  `You are an attentive nutritionist in a training app. The user gives a summary of a day of eating: the goal, what they ate and how much is left. Write a short comment on the day.
- Take the numbers from the summary only, don't recalculate them. A positive "left" means still to eat, a negative one is over the goal.
- Find the main point: the biggest shortfall or excess against the goal (protein matters more than fat and carbs), or praise if everything is within 10% of the goal.
- If it is today, mind the time: a shortfall in the morning or afternoon is normal, so suggest what to focus on next rather than scold.
- Judge the quality of the food in the log against the goal: what helped (protein, fiber, vegetables, whole foods) and what didn't (a lot of sugar, fried food, fast food, sweets, sugary drinks, empty calories).
Fields:
- headline: one sentence up to 70 characters with the key number, e.g. "Low on protein: 40 g to go"; the word "today" only if it is today;
- comment: one sentence up to 140 characters, friendly and specific, no moralizing; don't repeat the headline's numbers, name the current time or list the foods you suggest in snacks; rather say what to change, mentioning dishes from the log;
- foods: up to 4 of the most notable dishes from the log, both good and bad; name: the dish as named in the log; good: true if it helped the goal, false if it is worth cutting back; note: why, up to 60 characters, e.g. "lots of protein, little fat" or "almost all of the day's sugar". Good ones first. An empty list if the log is empty;
- lacking: what is most missing from the goal: "protein", "fat", "carbs" or "kcal"; "none" if nothing is clearly missing;
- snacks: if at least 150 kcal are left and there is a clear shortfall, up to 3 different simple foods that best close the main gap (when short on protein, at least 15 g of protein each) and together fit the kcal left; for today, what to eat next; for a past day, what could have been eaten; simple foods that are easy to buy; text: exactly one food, the way the user would type it, lowercase, with the amount in grams or ml (not in pieces), no commas or lists, e.g. "greek yogurt 200 g" or "boiled eggs 120 g"; kcal, protein_g, fat_g, carbs_g for that amount; is_drink: true for drinks; health: how good the food is, "healthy", "moderate" or "unhealthy". Otherwise an empty list.`,
);

const SUGGESTED_FOOD_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    kcal: { type: 'number' },
    protein_g: { type: 'number' },
    fat_g: { type: 'number' },
    carbs_g: { type: 'number' },
    is_drink: { type: 'boolean' },
    health: { type: 'string', enum: HEALTH_RATINGS },
  },
  required: ['text', 'kcal', 'protein_g', 'fat_g', 'carbs_g', 'is_drink', 'health'],
  additionalProperties: false,
};

type GroqSuggestedFood = {
  text: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  is_drink: boolean;
  health: string;
};

const suggestedFood = (f: GroqSuggestedFood) => ({
  text: f.text.trim(),
  kcal: num(f.kcal),
  proteinG: num(f.protein_g),
  fatG: num(f.fat_g),
  carbsG: num(f.carbs_g),
  isDrink: f.is_drink === true,
  health: healthRating(f.health),
});

const DAY_LACKING: DayLacking[] = ['protein', 'fat', 'carbs', 'kcal', 'none'];

const DAY_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    comment: { type: 'string' },
    snacks: { type: 'array', items: SUGGESTED_FOOD_SCHEMA },
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          good: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['name', 'good', 'note'],
        additionalProperties: false,
      },
    },
    lacking: { type: 'string', enum: DAY_LACKING },
  },
  required: ['headline', 'comment', 'snacks', 'foods', 'lacking'],
  additionalProperties: false,
};

type GroqDayReview = {
  headline: string;
  comment: string;
  snacks: GroqSuggestedFood[];
  foods?: { name: string; good: boolean; note: string }[];
  lacking?: string;
};

/** A dish's numbers: macros, plus fiber and sugar when the food has them. */
function describeDish(e: DayReviewInput['entries'][number]) {
  const g = tr('г', 'g');
  return [
    `${Math.round(e.kcal)} ${tr('ккал', 'kcal')}`,
    `${tr('Б', 'P')} ${Math.round(e.proteinG)} ${g}`,
    `${tr('Ж', 'F')} ${Math.round(e.fatG)} ${g}`,
    `${tr('В', 'C')} ${Math.round(e.carbsG)} ${g}`,
    e.fiberG != null && `${tr('клітковина', 'fiber')} ${Math.round(e.fiberG)} ${g}`,
    e.sugarG != null && `${tr('цукор', 'sugar')} ${Math.round(e.sugarG)} ${g}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The day's numbers as text, already subtracted, so the model doesn't do the arithmetic. */
function describeDay({ isToday, now, goal, targets, entries }: DayReviewInput) {
  const g = tr('г', 'g');
  const kcal = tr('ккал', 'kcal');
  const eaten = sumMacros(entries);
  const macros = [
    { label: tr('Калорії', 'Calories'), key: 'kcal', unit: kcal },
    { label: tr('Білки', 'Protein'), key: 'proteinG', unit: g },
    { label: tr('Жири', 'Fat'), key: 'fatG', unit: g },
    { label: tr('Вуглеводи', 'Carbs'), key: 'carbsG', unit: g },
  ] as const;
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
  const lines = [
    isToday
      ? tr(`День: сьогодні, зараз ${time}.`, `Day: today, now ${time}.`)
      : tr('День: минулий, вже завершений.', 'Day: a past one, already over.'),
    `${tr('Мета', 'Goal')}: ${WEIGHT_GOAL[goal].label}.`,
    '',
    ...macros.map((m) => {
      const left = Math.round(targets[m.key] - eaten[m.key]);
      return `${m.label}: ${tr('ціль', 'goal')} ${Math.round(targets[m.key])} ${m.unit}, ${tr('з’їдено', 'eaten')} ${Math.round(eaten[m.key])} ${m.unit}, ${tr('лишилось', 'left')} ${left} ${m.unit}.`;
    }),
    '',
    tr(
      'Журнал (однакові страви за день об’єднані, кількість і поживність підсумовані):',
      'Log (the same dishes of the day merged, amounts and nutrition summed):',
    ),
    ...mergeDishes(entries).map((e) => {
      const meals = MEALS.filter((meal) => e.parts.some((p) => p.meal === meal))
        .map((meal) => MEAL_LABELS[meal].toLocaleLowerCase(locale))
        .join(', ');
      return `- ${e.name}${e.portion ? ` ${e.portion}` : ''} — ${meals} (${describeDish(e)})`;
    }),
  ];
  return lines.join('\n');
}

/** A short AI comment on a day of eating, with foods to close its main gap. */
export async function askGroqDayReview(input: DayReviewInput): Promise<DayReview> {
  const parsed = await groqJson<GroqDayReview>({
    system: DAY_REVIEW_PROMPT,
    user: describeDay(input),
    schema: DAY_REVIEW_SCHEMA,
    schemaName: 'day_review',
    temperature: 0.4,
    accept: (r) => !!r.headline?.trim(),
  });
  const headline = parsed.headline?.trim();
  if (!headline)
    throw new GroqError(tr('AI не написав коментар.', 'AI wrote no comment.'), 'bad-response');
  return {
    headline,
    comment: parsed.comment?.trim() ?? '',
    snacks: parsed.snacks
      .filter((s) => s.text.trim() && num(s.kcal) > 0)
      .slice(0, 3)
      .map(suggestedFood),
    foods: (parsed.foods ?? [])
      .filter((f) => f.name?.trim())
      .slice(0, 4)
      .map((f) => ({ name: f.name.trim(), good: !!f.good, note: f.note?.trim() ?? '' })),
    lacking: DAY_LACKING.find((l) => l === parsed.lacking) ?? 'none',
  };
}

export type MacroKey = 'proteinG' | 'fatG' | 'carbsG';
/** `grams`: of the macro the food was picked for. */
export type MacroFood = SuggestedFood & { grams: number };
export type MacroTips = { comment: string; foods: MacroFood[] };

export type MacroTipsInput = {
  macro: MacroKey;
  target: number;
  /** The day's dishes with this macro in each. */
  entries: { name: string; portion: string | null; grams: number }[];
};

// Genitive, as in "rich in …".
const MACRO_NAMES: Record<MacroKey, string> = {
  proteinG: tr('білка', 'protein'),
  fatG: tr('жирів', 'fat'),
  carbsG: tr('вуглеводів', 'carbs'),
};

const MACRO_TIPS_PROMPT = tr(
  `Ти нутриціолог у застосунку для тренувань. Користувач дивиться, звідки за день у нього береться один макронутрієнт, і хоче знати, у чому його багато. Дано: макронутрієнт, ціль, з'їдено, лишилось і страви дня з його вмістом.
- Бери числа лише з підсумку, не рахуй їх заново.
Поля:
- comment: 1–2 речення до 180 символів, дружньо й конкретно: що з журналу дало найбільше і що з цим робити далі (добрати чи притримати); без моралізування;
- foods: рівно 6 різних простих продуктів чи страв, у яких цього макронутрієнту найбільше на звичайну порцію і які легко купити в Україні; не повторюй страви з журналу; text — як користувач написав би сам, з малої літери і з кількістю звичайної порції в грамах чи мл (не в штуках), напр. «куряче філе 150 г»; kcal, protein_g, fat_g, carbs_g — для цієї порції; is_drink — true для напоїв; health — наскільки продукт корисний: "healthy", "moderate" чи "unhealthy". Від найбагатшого до найбіднішого.`,
  `You are a nutritionist in a training app. The user is looking at where one macronutrient comes from in their day and wants to know what is rich in it. Given: the macronutrient, the goal, eaten, left and the day's dishes with their content of it.
- Take the numbers from the summary only, don't recalculate them.
Fields:
- comment: 1–2 sentences up to 180 characters, friendly and specific: what in the log gave the most and what to do next (eat more or hold back); no moralizing;
- foods: exactly 6 different simple foods or dishes with the most of this macronutrient per usual serving, easy to buy; don't repeat dishes from the log; text: the way the user would type it, lowercase, with the usual serving in grams or ml (not in pieces), e.g. "chicken breast 150 g"; kcal, protein_g, fat_g, carbs_g for that serving; is_drink: true for drinks; health: how good the food is, "healthy", "moderate" or "unhealthy". Richest first.`,
);

const MACRO_TIPS_SCHEMA = {
  type: 'object',
  properties: {
    comment: { type: 'string' },
    foods: { type: 'array', items: SUGGESTED_FOOD_SCHEMA },
  },
  required: ['comment', 'foods'],
  additionalProperties: false,
};

function describeMacroDay({ macro, target, entries }: MacroTipsInput) {
  const g = tr('г', 'g');
  const eaten = entries.reduce((s, e) => s + e.grams, 0);
  return [
    `${tr('Макронутрієнт', 'Macronutrient')}: ${MACRO_NAMES[macro]}.`,
    `${tr('Ціль', 'Goal')} ${Math.round(target)} ${g}, ${tr('з’їдено', 'eaten')} ${Math.round(eaten)} ${g}, ${tr('лишилось', 'left')} ${Math.round(target - eaten)} ${g}.`,
    '',
    tr('Страви дня:', 'The day’s dishes:'),
    ...(entries.length
      ? entries.map(
          (e) =>
            `${e.name}${e.portion ? ` ${e.portion}` : ''}: ${Math.round(e.grams * 10) / 10} ${g}`,
        )
      : [tr('нічого', 'nothing')]),
  ].join('\n');
}

/** Foods rich in one macro, with a word on where the day's amount came from. */
export async function askGroqMacroTips(input: MacroTipsInput): Promise<MacroTips> {
  const parsed = await groqJson<{ comment: string; foods: GroqSuggestedFood[] }>({
    system: MACRO_TIPS_PROMPT,
    user: describeMacroDay(input),
    schema: MACRO_TIPS_SCHEMA,
    schemaName: 'macro_tips',
    temperature: 0.4,
    accept: (r) => r.foods?.some((f) => f.text?.trim()),
  });
  const foods = (parsed.foods ?? [])
    .map((f) => {
      const food = suggestedFood(f);
      return { ...food, grams: food[input.macro] };
    })
    .filter((f) => f.text && f.grams > 0)
    .slice(0, 6)
    .sort((a, b) => b.grams - a.grams);
  if (foods.length === 0)
    throw new GroqError(tr('AI не підібрав продуктів.', 'AI suggested no foods.'), 'bad-response');
  return { comment: parsed.comment?.trim() ?? '', foods };
}

/** Cheapest call that proves the key works: lists the models it can use. */
export async function checkGroqKey(apiKey: string) {
  try {
    const res = await fetch(`${API}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    return res.ok ? 'ok' : res.status === 401 || res.status === 403 ? 'invalid' : 'error';
  } catch {
    return 'error';
  }
}

export type MealAdvice = { comment: string; dishes: SuggestedFood[] };

export type MealAdviceInput = Omit<DayReviewInput, 'isToday'> & {
  meal: Meal;
  /** Main meals after this one with nothing logged yet, sharing what's left with it. */
  later: Meal[];
};

const MEAL_ADVICE_PROMPT = tr(
  `Ти нутриціолог у застосунку для тренувань. Користувач хоче знати, що з'їсти на конкретний прийом їжі, щоб добрати решту денної норми. Дано: ціль, з'їдено, лишилось за день, журнал і частка залишку на цей прийом.
- Бери числа лише з підсумку, не рахуй їх заново.
- Не повторюй страви, які вже були сьогодні в журналі: день має бути різноманітним.
- Запропонуй 1–3 готові страви, які зазвичай їдять саме на цей прийом (сніданок, обід чи вечеря), напр. омлет з овочами, сирники, вівсянка з ягодами, гречка з курячим філе, борщ, салат з тунцем, запечена риба з картоплею. Це справжні страви з рецептом, які легко приготувати вдома, а не окремі інгредієнти: не пропонуй олію, спеції, окремі овочі чи сирі продукти. Можна додати гарнір, салат чи напій окремою стравою, але не склеюй різні страви в одну (не «шейк з рисом і салатом»).
- Разом страви закривають частку залишку на цей прийом: сума ккал — у межах ±10% від частки (не менше!), білок якомога ближче до частки, потім жири й вуглеводи. Підбери порції так, щоб сума сходилась. Віддавай перевагу корисним стравам з цільних продуктів, які легко купити в Україні; зважай на мету.
- Якщо частка залишку на цей прийом невелика чи від'ємна, запропонуй легкий варіант, багатий на те, чого бракує, з мінімумом калорій.
Поля:
- comment: одне речення до 140 символів: чому саме такі страви, з огляду на те, чого бракує; без чисел з підсумку;
- dishes: 1–3 страви, кожна — окремий елемент: text — рівно одна страва з малої літери і лише одна вага — всієї порції, в кінці, в грамах чи мл (не в штуках); інгредієнти — через «з» і без ваги, без ком і «+», напр. «гречка з курячим філе 350 г», а не «гречка 200 г з філе 150 г»; kcal, protein_g, fat_g, carbs_g — для цієї порції; is_drink — true для напоїв; health — наскільки продукт корисний: "healthy", "moderate" чи "unhealthy".`,
  `You are a nutritionist in a training app. The user wants to know what to eat for a particular meal to cover the rest of the day's goal. Given: the goal, eaten, left for the day, the log and this meal's share of what is left.
- Take the numbers from the summary only, don't recalculate them.
- Don't repeat dishes already in today's log: the day should be varied.
- Suggest 1–3 ready dishes usually eaten for exactly this meal (breakfast, lunch or dinner), e.g. an omelette with vegetables, oatmeal with berries, buckwheat with chicken breast, a tuna salad, baked fish with potatoes. These are real dishes with a recipe, easy to cook at home, not separate ingredients: don't suggest oil, spices, single vegetables or raw foods. A side, salad or drink may be added as its own dish, but don't glue different dishes into one (not "a shake with rice and salad").
- Together the dishes cover this meal's share of what is left: the kcal sum within ±10% of the share (not less!), protein as close to the share as possible, then fat and carbs. Pick portions so the sum adds up. Prefer healthy dishes of whole foods that are easy to buy; mind the goal.
- If this meal's share is small or negative, suggest a light option rich in what is missing, with minimal calories.
Fields:
- comment: one sentence up to 140 characters on why this meal, given what is missing; no numbers from the summary;
- dishes: 1–3 dishes, each its own item: text is exactly one dish, lowercase, with only one weight, of the whole portion, at the end, in grams or ml (not in pieces); ingredients joined with "with" and without weights, no commas or "+", e.g. "buckwheat with chicken breast 350 g", not "buckwheat 200 g with chicken 150 g"; kcal, protein_g, fat_g, carbs_g for that portion; is_drink: true for drinks; health: how good the food is, "healthy", "moderate" or "unhealthy".`,
);

const MEAL_ADVICE_SCHEMA = {
  type: 'object',
  properties: {
    comment: { type: 'string' },
    dishes: { type: 'array', items: SUGGESTED_FOOD_SCHEMA },
  },
  required: ['comment', 'dishes'],
  additionalProperties: false,
};

/** How much of what's left of the day `meal` should take: an even split with the meals still to come. */
function mealShare({ later, targets, entries }: MealAdviceInput) {
  const eaten = sumMacros(entries);
  const share = 1 / (1 + later.length);
  const part = (key: keyof Macros) => Math.round((targets[key] - eaten[key]) * share);
  return { share, part };
}

/** The day so far, plus how much of what's left this meal should take. */
function describeMeal(input: MealAdviceInput) {
  const { meal, later, ...day } = input;
  const g = tr('г', 'g');
  const { share, part } = mealShare(input);
  const name = (m: Meal) => MEAL_LABELS[m].toLocaleLowerCase(locale);
  return [
    describeDay({ ...day, isToday: true }),
    '',
    `${tr('Прийом їжі', 'Meal')}: ${name(meal)}.`,
    later.length
      ? tr(
          `Далі ще ${later.map(name).join(', ')}, тож на цей прийом — ${Math.round(share * 100)}% залишку.`,
          `Still to come: ${later.map(name).join(', ')}, so this meal takes ${Math.round(share * 100)}% of what is left.`,
        )
      : tr(
          'Це останній прийом за день: на нього — весь залишок.',
          'This is the last meal of the day: it takes all that is left.',
        ),
    part('kcal') > 0
      ? tr(
          `Сума ккал усіх страв має бути від ${Math.round(part('kcal') * 0.9)} до ${Math.round(part('kcal') * 1.1)} ккал.`,
          `The kcal sum of all dishes must be ${Math.round(part('kcal') * 0.9)} to ${Math.round(part('kcal') * 1.1)} kcal.`,
        )
      : '',
    `${tr('Частка на цей прийом', 'This meal’s share')}: ${part('kcal')} ${tr('ккал', 'kcal')}, ${tr('Б', 'P')} ${part('proteinG')} ${g}, ${tr('Ж', 'F')} ${part('fatG')} ${g}, ${tr('В', 'C')} ${part('carbsG')} ${g}.`,
  ].join('\n');
}

/** What to eat for `meal` to cover its share of what's left of the day. */
export async function askGroqMealAdvice(input: MealAdviceInput): Promise<MealAdvice> {
  const parsed = await groqJson<{ comment: string; dishes: GroqSuggestedFood[] }>({
    system: MEAL_ADVICE_PROMPT,
    user: describeMeal(input),
    schema: MEAL_ADVICE_SCHEMA,
    schemaName: 'meal_advice',
    temperature: 0.5,
    // Asked again when portions can't be fitted to the share: weights per ingredient
    // instead of one per dish, or a sum too far from it to scale.
    accept: (r) => {
      const dishes = (r.dishes ?? []).filter((d) => d.text?.trim());
      const kcal = dishes.reduce((s, d) => s + num(d.kcal), 0);
      const share = mealShare(input).part('kcal');
      return (
        dishes.length > 0 &&
        dishes.every((d) => splitAmount(d.text)) &&
        (share <= 0 || (kcal * MAX_PORTION_SCALE >= share && kcal * MIN_PORTION_SCALE <= share))
      );
    },
  });
  const dishes = (parsed.dishes ?? [])
    .filter((d) => d.text?.trim() && num(d.kcal) > 0)
    .slice(0, 3)
    .map(suggestedFood);
  if (dishes.length === 0)
    throw new GroqError(tr('AI не підібрав страву.', 'AI suggested no meal.'), 'bad-response');
  const comment = parsed.comment?.trim() ?? '';
  return {
    comment: comment.charAt(0).toLocaleUpperCase(locale) + comment.slice(1),
    dishes: fitPortions(dishes, mealShare(input).part('kcal')),
  };
}

// How far portions are scaled to meet the meal's kcal share: beyond that they stop looking like one meal.
const MIN_PORTION_SCALE = 0.7;
const MAX_PORTION_SCALE = 1.6;

/**
 * The model rarely gets the sum right, so portions are scaled together to land
 * on `kcal` when they're more than 10% off (within sane bounds). Dishes without
 * a weight in their text keep theirs.
 */
function fitPortions(dishes: SuggestedFood[], kcal: number): SuggestedFood[] {
  const total = dishes.reduce((s, d) => s + d.kcal, 0);
  if (kcal <= 0 || total <= 0 || Math.abs(total / kcal - 1) <= 0.1) return dishes;
  const k = Math.min(MAX_PORTION_SCALE, Math.max(MIN_PORTION_SCALE, kcal / total));
  return dishes.map((d) => {
    const split = splitAmount(d.text);
    if (!split) return d;
    // Rounded to 10 g, and the macros follow the rounded portion.
    const grams = Math.max(10, Math.round((split.grams * k) / 10) * 10);
    const r = grams / split.grams;
    return {
      ...d,
      text: `${split.dish} ${grams} ${d.isDrink ? tr('мл', 'ml') : tr('г', 'g')}`,
      kcal: d.kcal * r,
      proteinG: d.proteinG * r,
      fatG: d.fatG === undefined ? undefined : d.fatG * r,
      carbsG: d.carbsG === undefined ? undefined : d.carbsG * r,
    };
  });
}
