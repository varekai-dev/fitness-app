import * as SecureStore from 'expo-secure-store';

import { HEALTH_RATINGS, type HealthRating } from '@/db/schema';
import { sumMacros, type Macros } from '@/lib/food';
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
export type DayReview = { headline: string; comment: string; snacks: DaySnack[] };

export type DayReviewInput = {
  /** Today: the day is still going, so `now` matters. */
  isToday: boolean;
  now: number;
  goal: WeightGoal;
  targets: Macros;
  entries: (Macros & { meal: Meal; name: string; portion: string | null })[];
};

const DAY_REVIEW_PROMPT = tr(
  `Ти уважний нутриціолог у застосунку для тренувань. Користувач дає підсумок харчування за день: ціль, що з'їв і скільки лишилось. Напиши короткий коментар до дня.
- Бери числа лише з підсумку, не рахуй їх заново. «Лишилось» додатне — ще треба добрати, від'ємне — перебір.
- Знайди головне: найбільший недобір чи перебір відносно цілі (білок важливіший за жири й вуглеводи) або похвали, якщо все в межах 10% від цілі.
- Якщо це сьогодні, зважай на час: зранку чи вдень недобір нормальний, тож підкажи, на що звернути увагу далі, а не дорікай.
Поля:
- headline: одне речення до 70 символів з головним числом, напр. «Сьогодні мало білка — до цілі ще 40 г»;
- comment: 1–2 речення до 200 символів, дружньо й конкретно, без моралізування; не повторюй числа з headline і не називай поточний час; краще порадь, що змінити, згадавши страви з журналу;
- snacks: лише якщо це сьогодні, лишилось щонайменше 150 ккал і є помітний недобір — рівно 3 різні варіанти перекусу, що багаті саме на те, чого бракує (при недоборі білка — щонайменше 15 г білка на перекус), і вкладаються в залишок ккал; прості продукти, які легко купити в Україні; text — як користувач написав би сам, з малої літери і з кількістю, напр. «грецький йогурт 200 г»; kcal і protein_g — для цієї кількості. Інакше порожній список.`,
  `You are an attentive nutritionist in a training app. The user gives a summary of a day of eating: the goal, what they ate and how much is left. Write a short comment on the day.
- Take the numbers from the summary only, don't recalculate them. A positive "left" means still to eat, a negative one is over the goal.
- Find the main point: the biggest shortfall or excess against the goal (protein matters more than fat and carbs), or praise if everything is within 10% of the goal.
- If it is today, mind the time: a shortfall in the morning or afternoon is normal, so suggest what to focus on next rather than scold.
Fields:
- headline: one sentence up to 70 characters with the key number, e.g. "Low on protein today: 40 g to go";
- comment: 1–2 sentences up to 200 characters, friendly and specific, no moralizing; don't repeat the headline's numbers or name the current time; rather suggest what to change, mentioning dishes from the log;
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
  },
  required: ['headline', 'comment', 'snacks'],
  additionalProperties: false,
};

type GroqDayReview = {
  headline: string;
  comment: string;
  snacks: { text: string; kcal: number; protein_g: number }[];
};

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
    tr('Журнал:', 'Log:'),
    ...MEALS.flatMap((meal) => {
      const dishes = entries.filter((e) => e.meal === meal);
      if (dishes.length === 0) return [];
      return [
        `${MEAL_LABELS[meal]}: ${dishes
          .map(
            (e) =>
              `${e.name}${e.portion ? ` ${e.portion}` : ''} (${Math.round(e.kcal)} ${kcal}, ${tr('Б', 'P')} ${Math.round(e.proteinG)} ${g})`,
          )
          .join('; ')}`,
      ];
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
    accept: (r) => !!r.headline?.trim(),
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
  };
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
