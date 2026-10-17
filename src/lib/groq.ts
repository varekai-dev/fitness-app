import * as SecureStore from 'expo-secure-store';

import { tr } from '@/lib/i18n';

const KEY_NAME = 'groq_api_key';
const API = 'https://api.groq.com/openai/v1';
// Supports strict JSON Schema output on Groq; low reasoning keeps it fast and cheap.
export const GROQ_MODEL = 'openai/gpt-oss-120b';

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
};

export class GroqError extends Error {
  constructor(
    message: string,
    readonly kind: 'no-key' | 'auth' | 'not-food' | 'network' | 'bad-response',
  ) {
    super(message);
  }
}

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
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

export type GroqRequest<T> = {
  system: string;
  user: string;
  /** Strict JSON Schema the reply must follow. */
  schema: object;
  schemaName: string;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
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
          model: GROQ_MODEL,
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
