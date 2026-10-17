import * as SecureStore from 'expo-secure-store';

import { HEALTH_RATINGS, type HealthRating } from '@/db/schema';
import { mergeDishes, sumMacros, type Macros } from '@/lib/food';
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
  const key = apiKey ?? (await getGroqKey());
  if (!key)
    throw new GroqError(
      tr('Додай ключ Groq API у налаштуваннях.', 'Add a Groq API key in settings.'),
      'no-key',
    );

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
    let res: Response;
    try {
      res = await fetch(`${API}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
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
        }),
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
  `Ти нутриціолог. На фото їжа чи напій, найчастіше тарілка зверху або збоку.
Назви все, що видно, і оціни кількість кожного за розміром тарілки, приборів, рук і упаковок.
- Страву з кількох інгредієнтів (борщ, салат, піца, бутерброд) називай однією позицією.
- Окремі страви на тарілці (гарнір, м'ясо, овочі, хліб, соус) — окремими позиціями.
- Напиши, як приготовано, якщо це видно: смажене, варене, запечене.
Поля:
- is_food: false, якщо на фото немає їжі чи напою;
- items: позиції; name — коротко українською з малої літери, без кількості; amount — число більше 0; unit — "g" для їжі, "ml" для напоїв і рідких страв у склянці.`,
  `You are a nutritionist. The photo shows food or a drink, usually a plate from above or the side.
Name everything you can see and estimate the amount of each by the size of the plate, cutlery, hands and packaging.
- A dish made of several ingredients (soup, salad, pizza, sandwich) is one item.
- Separate dishes on a plate (side, meat, vegetables, bread, sauce) are separate items.
- Say how it is cooked if you can see it: fried, boiled, baked.
Fields:
- is_food: false if there is no food or drink in the photo;
- items: the items; name: short, in English, lowercase, without the amount; amount: a number greater than 0; unit: "g" for food, "ml" for drinks and liquids in a glass.`,
);

const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean' },
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
  },
  required: ['is_food', 'items'],
  additionalProperties: false,
};

type GroqPhoto = { is_food: boolean; items: { name: string; amount: number; unit: string }[] };

/** Amounts guessed from a photo are rough, so round numbers read more honestly. */
const roundAmount = (v: number) => Math.max(10, Math.round(v / 10) * 10);

/**
 * Recognizes the food in a photo and describes it the way the user would type
 * it, e.g. "гречка 180 г, курячий стейк 120 г", for the usual nutrition lookup.
 * Throws `GroqError` with a user-facing message.
 */
export async function describeFoodPhoto(image: { base64: string; mimeType: string }) {
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
    accept: (r) => !r.is_food || r.items.some((i) => i.name.trim() && num(i.amount) > 0),
  });
  const items = parsed.is_food
    ? parsed.items.filter((i) => i.name.trim() && num(i.amount) > 0)
    : [];
  if (items.length === 0) {
    throw new GroqError(
      tr(
        'Не бачу на фото їжі. Спробуй інше фото або опиши страву текстом.',
        'I can’t see any food in the photo. Try another one or describe the dish.',
      ),
      'not-food',
    );
  }
  return items
    .map(
      (i) =>
        `${i.name.trim()} ${roundAmount(i.amount)} ${i.unit === 'ml' ? tr('мл', 'ml') : tr('г', 'g')}`,
    )
    .join(', ');
}

export type DaySnack = { text: string; kcal: number; proteinG: number };
/** One food of a set that closes all of the day's gaps at once. */
export type DayFill = Macros & { text: string };
/** A dish worth a word: good for the day's goal or one to cut back on. */
export type DayFood = { name: string; good: boolean; note: string };
export type DayReview = {
  headline: string;
  comment: string;
  snacks: DaySnack[];
  /** Missing from comments written before dishes were judged. */
  foods?: DayFood[];
  /** Missing from comments written before the day's set was picked. */
  fill?: DayFill[];
  /** AI's own caption over `fill`, worded differently each time. */
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
- comment: 1–2 речення до 200 символів, дружньо й конкретно, без моралізування; не повторюй числа з headline і не називай поточний час; краще порадь, що змінити, згадавши страви з журналу;
- foods: до 4 найпомітніших страв із журналу — і корисні, і ні; name — назва страви так, як у журналі; good — true, якщо страва пішла на користь меті, false, якщо варто обмежити; note — чому, до 60 символів, напр. «багато білка й мало жиру» чи «майже весь цукор за день». Спершу корисні. Порожній список, якщо журнал порожній;
- fill: якщо лишилось щонайменше 150 ккал — набір з 2–4 простих продуктів, які разом закривають одразу все, що лишилось: ккал, білки, жири й вуглеводи якомога ближче до залишку, без перебору калорій. Для сьогодні — що з'їсти до кінця дня, для минулого дня — що можна було б з'їсти. Підбери кількості так, щоб сума сходилась. Кожен продукт — окремий елемент списку: text — рівно один продукт з кількістю, без ком і переліків, як у snacks; kcal, protein_g, fat_g, carbs_g — для цієї кількості. Інакше порожній список;
- fill_title: короткий підпис над fill до 45 символів, без чисел, щоразу сформульований по-своєму й живо, під настрій дня (для минулого дня — у минулому часі), напр. «Ось чим можна було закрити день» чи «Цього не вистачило до норми»; порожній рядок, якщо fill порожній;
- snacks: лише якщо це сьогодні, лишилось щонайменше 150 ккал і є помітний недобір — рівно 3 різні варіанти перекусу, що багаті саме на те, чого бракує (при недоборі білка — щонайменше 15 г білка на перекус), і вкладаються в залишок ккал; прості продукти, які легко купити в Україні; text — як користувач написав би сам, з малої літери і з кількістю, напр. «грецький йогурт 200 г»; kcal і protein_g — для цієї кількості. Інакше порожній список.`,
  `You are an attentive nutritionist in a training app. The user gives a summary of a day of eating: the goal, what they ate and how much is left. Write a short comment on the day.
- Take the numbers from the summary only, don't recalculate them. A positive "left" means still to eat, a negative one is over the goal.
- Find the main point: the biggest shortfall or excess against the goal (protein matters more than fat and carbs), or praise if everything is within 10% of the goal.
- If it is today, mind the time: a shortfall in the morning or afternoon is normal, so suggest what to focus on next rather than scold.
- Judge the quality of the food in the log against the goal: what helped (protein, fiber, vegetables, whole foods) and what didn't (a lot of sugar, fried food, fast food, sweets, sugary drinks, empty calories).
Fields:
- headline: one sentence up to 70 characters with the key number, e.g. "Low on protein: 40 g to go"; the word "today" only if it is today;
- comment: 1–2 sentences up to 200 characters, friendly and specific, no moralizing; don't repeat the headline's numbers or name the current time; rather suggest what to change, mentioning dishes from the log;
- foods: up to 4 of the most notable dishes from the log, both good and bad; name: the dish as named in the log; good: true if it helped the goal, false if it is worth cutting back; note: why, up to 60 characters, e.g. "lots of protein, little fat" or "almost all of the day's sugar". Good ones first. An empty list if the log is empty;
- fill: if at least 150 kcal are left, a set of 2–4 simple foods that together close everything left at once: kcal, protein, fat and carbs as close to what is left as possible, without going over on calories. For today, what to eat by the end of the day; for a past day, what could have been eaten. Pick amounts so the sum adds up. Each food is its own list item: text is exactly one food with its amount, no commas or lists, as in snacks; kcal, protein_g, fat_g, carbs_g for that amount. Otherwise an empty list;
- fill_title: a short caption over fill, up to 45 characters, no numbers, worded freshly and in your own way each time to suit the day (past tense for a past day), e.g. "Here's what would have closed the day" or "This was missing from your goal"; an empty string if fill is empty;
- snacks: only if it is today, at least 150 kcal are left and there is a clear shortfall: exactly 3 different snack options rich in exactly what is missing (when short on protein, at least 15 g of protein per snack) and fitting the kcal left; simple foods that are easy to buy; text: the way the user would type it, lowercase, with the amount, e.g. "greek yogurt 200 g"; kcal and protein_g for that amount. Otherwise an empty list.`,
);

const DAY_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    comment: { type: 'string' },
    snacks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
        },
        required: ['text', 'kcal', 'protein_g'],
        additionalProperties: false,
      },
    },
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
    fill: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          fat_g: { type: 'number' },
          carbs_g: { type: 'number' },
        },
        required: ['text', 'kcal', 'protein_g', 'fat_g', 'carbs_g'],
        additionalProperties: false,
      },
    },
    fill_title: { type: 'string' },
  },
  required: ['headline', 'comment', 'snacks', 'foods', 'fill', 'fill_title'],
  additionalProperties: false,
};

type GroqDayReview = {
  headline: string;
  comment: string;
  snacks: { text: string; kcal: number; protein_g: number }[];
  foods?: { name: string; good: boolean; note: string }[];
  fill?: { text: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number }[];
  fill_title?: string;
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

/** A short AI comment on a day of eating, with snacks to close today's gap. */
export async function askGroqDayReview(input: DayReviewInput): Promise<DayReview> {
  const parsed = await groqJson<GroqDayReview>({
    system: DAY_REVIEW_PROMPT,
    user: describeDay(input),
    schema: DAY_REVIEW_SCHEMA,
    schemaName: 'day_review',
    temperature: 0.4,
    // A retry when the model packs several foods into one item of the set.
    accept: (r) => !!r.headline?.trim() && !(r.fill ?? []).some((f) => /,\s|\s\+\s/.test(f.text)),
  });
  const headline = parsed.headline?.trim();
  if (!headline)
    throw new GroqError(tr('AI не написав коментар.', 'AI wrote no comment.'), 'bad-response');
  return {
    headline,
    comment: parsed.comment?.trim() ?? '',
    snacks: (input.isToday ? parsed.snacks : [])
      .filter((s) => s.text.trim() && num(s.kcal) > 0)
      .slice(0, 3)
      .map((s) => ({ text: s.text.trim(), kcal: num(s.kcal), proteinG: num(s.protein_g) })),
    foods: (parsed.foods ?? [])
      .filter((f) => f.name?.trim())
      .slice(0, 4)
      .map((f) => ({ name: f.name.trim(), good: !!f.good, note: f.note?.trim() ?? '' })),
    fill: (parsed.fill ?? [])
      .filter((f) => f.text?.trim() && num(f.kcal) > 0)
      .slice(0, 4)
      .map((f) => ({
        text: f.text.trim(),
        kcal: num(f.kcal),
        proteinG: num(f.protein_g),
        fatG: num(f.fat_g),
        carbsG: num(f.carbs_g),
      })),
    fillTitle: parsed.fill_title?.trim() || undefined,
  };
}

export type MacroKey = 'proteinG' | 'fatG' | 'carbsG';
export type MacroFood = { text: string; grams: number; kcal: number };
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
- foods: рівно 6 різних простих продуктів чи страв, у яких цього макронутрієнту найбільше на звичайну порцію і які легко купити в Україні; не повторюй страви з журналу; text — як користувач написав би сам, з малої літери і з кількістю звичайної порції, напр. «куряче філе 150 г»; grams — грамів цього макронутрієнту в цій порції; kcal — для цієї порції. Від найбагатшого до найбіднішого.`,
  `You are a nutritionist in a training app. The user is looking at where one macronutrient comes from in their day and wants to know what is rich in it. Given: the macronutrient, the goal, eaten, left and the day's dishes with their content of it.
- Take the numbers from the summary only, don't recalculate them.
Fields:
- comment: 1–2 sentences up to 180 characters, friendly and specific: what in the log gave the most and what to do next (eat more or hold back); no moralizing;
- foods: exactly 6 different simple foods or dishes with the most of this macronutrient per usual serving, easy to buy; don't repeat dishes from the log; text: the way the user would type it, lowercase, with the usual serving, e.g. "chicken breast 150 g"; grams: grams of this macronutrient in that serving; kcal for that serving. Richest first.`,
);

const MACRO_TIPS_SCHEMA = {
  type: 'object',
  properties: {
    comment: { type: 'string' },
    foods: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          grams: { type: 'number' },
          kcal: { type: 'number' },
        },
        required: ['text', 'grams', 'kcal'],
        additionalProperties: false,
      },
    },
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
  const parsed = await groqJson<{ comment: string; foods: MacroFood[] }>({
    system: MACRO_TIPS_PROMPT,
    user: describeMacroDay(input),
    schema: MACRO_TIPS_SCHEMA,
    schemaName: 'macro_tips',
    temperature: 0.4,
    accept: (r) => r.foods?.some((f) => f.text?.trim()),
  });
  const foods = (parsed.foods ?? [])
    .filter((f) => f.text?.trim() && num(f.grams) > 0)
    .slice(0, 6)
    .map((f) => ({ text: f.text.trim(), grams: num(f.grams), kcal: num(f.kcal) }))
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
