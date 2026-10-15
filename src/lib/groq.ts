import * as SecureStore from 'expo-secure-store';

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

const SYSTEM_PROMPT = `Ти нутриціолог. Користувач описує страву, продукт або напій (часто українською).
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

/** Asks Groq for the nutrition of `dish`; throws `GroqError` with a user-facing message. */
export async function askGroqNutrition(dish: string, apiKey?: string | null): Promise<Nutrition> {
  const key = apiKey ?? (await getGroqKey());
  if (!key) throw new GroqError('Додай ключ Groq API у налаштуваннях.', 'no-key');

  let res: Response;
  try {
    res = await fetch(`${API}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        reasoning_effort: 'low',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: dish },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'nutrition', schema: SCHEMA, strict: true },
        },
      }),
    });
  } catch {
    throw new GroqError('Немає з’єднання з Groq. Перевір інтернет.', 'network');
  }

  if (res.status === 401 || res.status === 403) {
    throw new GroqError('Groq відхилив ключ. Перевір його в налаштуваннях.', 'auth');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GroqError(`Groq повернув помилку ${res.status}. ${body.slice(0, 200)}`, 'network');
  }

  let parsed: GroqNutrition;
  try {
    const json = await res.json();
    parsed = JSON.parse(json.choices[0].message.content);
  } catch {
    throw new GroqError('Не вдалося прочитати відповідь Groq.', 'bad-response');
  }
  if (parsed.is_food && !(num(parsed.portion_g) > 0)) {
    throw new GroqError('Groq не визначив вагу чи об’єм порції. Уточни опис.', 'bad-response');
  }
  if (!parsed.is_food) {
    throw new GroqError('Схоже, це не страва. Опиши, що саме ти з’їв.', 'not-food');
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
