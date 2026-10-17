import {
  MUSCLE_GROUPS,
  TRACKING_TYPES,
  type Exercise,
  type MuscleGroup,
  type Targets,
  type TrackingType,
} from '@/db/schema';
import { EXERCISE_CATALOG } from '@/lib/exercise-catalog';
import { bundledImageUri, DEFAULT_EXERCISE_IMAGES } from '@/lib/exercise-images';
import { groqJson } from '@/lib/groq';
import { tr } from '@/lib/i18n';
import { downloadImage } from '@/lib/images';
import { formatTargets } from '@/lib/labels';
import { ACTIVITY, ageOn, WEIGHT_GOAL, type Profile } from '@/lib/profile';

type Option = {
  value: string;
  label: string;
  hint?: string;
  /** How the answer reads in the prompt, in English. */
  prompt: string;
};

export type ProgramQuestion = {
  key: 'goal' | 'level' | 'days' | 'duration' | 'equipment' | 'focus' | 'limits';
  title: string;
  hint?: string;
  /** Several options can be picked. */
  multi?: boolean;
  /** Can be left empty. */
  optional?: boolean;
  /** Label of the answer in the prompt, in English. */
  prompt: string;
  options: Option[];
};

export type ProgramAnswers = Record<ProgramQuestion['key'], string[]>;

export const PROGRAM_QUESTIONS: ProgramQuestion[] = [
  {
    key: 'goal',
    title: tr('Яка головна мета?', 'What is your main goal?'),
    prompt: 'Main goal',
    options: [
      {
        value: 'tone',
        label: tr('Тримати себе в тонусі', 'Stay fit and toned'),
        hint: tr('Загальна форма, сила й витривалість', 'General fitness, strength and stamina'),
        prompt: 'stay fit and toned, general fitness',
      },
      {
        value: 'strength',
        label: tr('Сила', 'Strength'),
        hint: tr('Важкі базові вправи, менше повторень', 'Heavy compound lifts, fewer reps'),
        prompt: 'get stronger, emphasis on heavy compound strength training',
      },
      {
        value: 'muscle',
        label: tr('Набір м’язів', 'Build muscle'),
        hint: tr('Об’єм і форма м’язів', 'Muscle size and shape'),
        prompt: 'build muscle (hypertrophy)',
      },
      {
        value: 'fat_loss',
        label: tr('Схуднення', 'Lose fat'),
        hint: tr('Більше руху, короткий відпочинок', 'More movement, short rests'),
        prompt: 'lose fat while keeping muscle',
      },
      {
        value: 'endurance',
        label: tr('Витривалість', 'Endurance'),
        hint: tr('Кардіо й робота в багатьох повтореннях', 'Cardio and high-rep work'),
        prompt: 'improve endurance and conditioning',
      },
    ],
  },
  {
    key: 'level',
    title: tr('Який у тебе досвід?', 'How experienced are you?'),
    prompt: 'Training experience',
    options: [
      {
        value: 'beginner',
        label: tr('Новачок', 'Beginner'),
        hint: tr('Менше пів року або давно не тренувався', 'Under 6 months, or a long break'),
        prompt: 'beginner (under 6 months)',
      },
      {
        value: 'intermediate',
        label: tr('Середній', 'Intermediate'),
        hint: tr('Від пів року до 2 років', '6 months to 2 years'),
        prompt: 'intermediate (6 months to 2 years)',
      },
      {
        value: 'advanced',
        label: tr('Досвідчений', 'Advanced'),
        hint: tr('Понад 2 роки регулярних тренувань', 'Over 2 years of regular training'),
        prompt: 'advanced (over 2 years)',
      },
    ],
  },
  {
    key: 'days',
    title: tr('Скільки разів на тиждень?', 'How many times a week?'),
    prompt: 'Workouts per week',
    options: [2, 3, 4, 5, 6].map((n) => ({
      value: String(n),
      label: String(n),
      prompt: String(n),
    })),
  },
  {
    key: 'duration',
    title: tr('Скільки триває тренування?', 'How long is a workout?'),
    prompt: 'Workout length',
    options: [
      { value: '30', label: tr('30 хв', '30 min'), prompt: '30 minutes (about 3–4 exercises)' },
      { value: '45', label: tr('45 хв', '45 min'), prompt: '45 minutes (about 4–5 exercises)' },
      { value: '60', label: tr('1 год', '1 hour'), prompt: '60 minutes (about 5–6 exercises)' },
      {
        value: '90',
        label: tr('1,5 год', '1.5 hours'),
        prompt: '90 minutes (about 6–8 exercises)',
      },
    ],
  },
  {
    key: 'equipment',
    title: tr('Що є з обладнання?', 'What equipment do you have?'),
    hint: tr('Познач усе, що маєш', 'Pick everything you have'),
    multi: true,
    prompt: 'Available equipment (use nothing else)',
    options: [
      {
        value: 'gym',
        label: tr('Повний спортзал', 'Full gym'),
        prompt: 'full gym: barbells, dumbbells, machines, cables, benches, pull-up bar',
      },
      { value: 'dumbbells', label: tr('Гантелі', 'Dumbbells'), prompt: 'dumbbells' },
      { value: 'barbell', label: tr('Штанга', 'Barbell'), prompt: 'barbell with plates and rack' },
      { value: 'bench', label: tr('Лава', 'Bench'), prompt: 'adjustable bench' },
      { value: 'pullup_bar', label: tr('Турнік', 'Pull-up bar'), prompt: 'pull-up bar' },
      { value: 'dip_bars', label: tr('Бруси', 'Dip bars'), prompt: 'dip bars' },
      { value: 'kettlebell', label: tr('Гиря', 'Kettlebell'), prompt: 'kettlebell' },
      { value: 'bands', label: tr('Резинки', 'Resistance bands'), prompt: 'resistance bands' },
      {
        value: 'bodyweight',
        label: tr('Нічого, власна вага', 'None, bodyweight'),
        prompt: 'bodyweight only',
      },
    ],
  },
  {
    key: 'focus',
    title: tr('На що зробити акцент?', 'What should it focus on?'),
    hint: tr('Можна пропустити — тоді все рівномірно', 'Skip it for an even split'),
    multi: true,
    optional: true,
    prompt: 'Extra focus',
    options: [
      { value: 'chest', label: tr('Груди', 'Chest'), prompt: 'chest' },
      { value: 'back', label: tr('Спина', 'Back'), prompt: 'back' },
      { value: 'legs', label: tr('Ноги', 'Legs'), prompt: 'legs' },
      { value: 'glutes', label: tr('Сідниці', 'Glutes'), prompt: 'glutes' },
      { value: 'shoulders', label: tr('Плечі', 'Shoulders'), prompt: 'shoulders' },
      { value: 'arms', label: tr('Руки', 'Arms'), prompt: 'arms (biceps and triceps)' },
      { value: 'abs', label: tr('Прес', 'Abs'), prompt: 'abs and core' },
      { value: 'cardio', label: tr('Кардіо', 'Cardio'), prompt: 'cardio' },
    ],
  },
  {
    key: 'limits',
    title: tr('Щось обмежує?', 'Anything to be careful with?'),
    hint: tr(
      'AI не дасть вправ, що навантажують ці місця. Пропусти, якщо нічого не турбує',
      'AI will avoid exercises that load these. Skip it if nothing bothers you',
    ),
    multi: true,
    optional: true,
    prompt: 'Limitations, avoid loading them',
    options: [
      { value: 'knees', label: tr('Коліна', 'Knees'), prompt: 'knees' },
      { value: 'lower_back', label: tr('Поперек', 'Lower back'), prompt: 'lower back' },
      { value: 'shoulders', label: tr('Плечі', 'Shoulders'), prompt: 'shoulders' },
      { value: 'wrists', label: tr('Зап’ястя', 'Wrists'), prompt: 'wrists' },
      { value: 'neck', label: tr('Шия', 'Neck'), prompt: 'neck' },
      { value: 'no_jumps', label: tr('Без стрибків', 'No jumping'), prompt: 'no jumping' },
    ],
  },
];

export const EMPTY_ANSWERS: ProgramAnswers = {
  goal: [],
  level: [],
  days: [],
  duration: [],
  equipment: [],
  focus: [],
  limits: [],
};

/** Ready-made wishes the user can tap into the text field. */
export const WISH_SUGGESTIONS = [
  tr('Тримати себе в тонусі', 'Stay in shape'),
  tr('Уклон на силові', 'Lean towards strength'),
  tr('Більше кардіо', 'More cardio'),
  tr('Тренуюся вдома', 'I train at home'),
  tr('Хочу більше підтягуватися', 'Want to do more pull-ups'),
];

export type PlanExercise = {
  name: string;
  /** Library exercise with this name, or null when the plan adds a new one. */
  exerciseId: number | null;
  muscleGroup: MuscleGroup;
  trackingType: TrackingType;
  notes: string | null;
  /** Every exercise has a photo: the library's, a bundled one or one from the catalog. */
  imageUri: string;
  targets: Targets;
};

export type ProgramPlan = {
  name: string;
  summary: string;
  days: { name: string; exercises: PlanExercise[] }[];
};

type Library = Pick<Exercise, 'id' | 'name' | 'muscleGroup' | 'trackingType' | 'imageUri'>[];

/** What the program and a replacement have to follow alike. */
const EXERCISE_RULES = `- Use only the listed equipment. Never give exercises that load the listed limitations.
- Pick reps and rest for the goal: strength 3–6 reps and 120–180 s rest, muscle 6–12 reps and 60–120 s, toning 10–15 reps and 45–75 s, fat loss and endurance 12–20 reps and 30–60 s. Beginners get fewer sets.
- Use only exercises from the two lists below, copying their names exactly; never invent others. Prefer the library where it suits the goal and equipment; when the equipment allows better choices the library lacks (barbell, machines, cables, kettlebell, bands…) or the focus needs them, add exercises from the list of more exercises.
- muscle_group: the main muscle worked; tracking_type: weight_reps for exercises with external load, reps for bodyweight reps, weighted_reps for bodyweight exercises that can take added weight (pull-ups, dips), duration for holds and timed work, distance_duration for running, cycling, rowing and similar.
- Targets: sets; reps_min and reps_max for rep exercises, else 0; duration_sec for timed exercises (and optionally for distance ones), else 0; distance_km for distance exercises when it makes sense, else 0; rest_sec between sets.
- notes: for an exercise from the list of more exercises, 1–2 sentences on technique in ${tr('Ukrainian', 'English')}; empty for library exercises.`;

const SYSTEM_PROMPT = `You are an experienced strength and conditioning coach. Design a training program for the user.
A program is a cycle of workout days that repeat in order (e.g. Push / Pull / Legs); one day is one workout.
Rules:
- The user's wishes come first, then the main goal; also follow the experience level, workouts per week, workout length and focus.
- Take the profile into account (sex, age, body weight, activity, weight goal).
- Make exactly as many days as workouts per week, each a different workout.
- Fill every day, the last one included, with as many exercises as the workout length allows. Compound exercises first, isolation and core last.
${EXERCISE_RULES}
- summary: 1–2 sentences on how the program is built and why it suits the user.
- name: a short program name of 2–4 words, without numbers of days or minutes.
- Day names: a few words on what the day trains (e.g. ${tr('"Груди й трицепс", "Верх тіла"', '"Chest and triceps", "Upper body"')}), without "Day 1" numbering.
- Write the program name, day names, summary and notes in natural, grammatical ${tr('Ukrainian', 'English')}.`;

const REPLACE_PROMPT = `You are an experienced strength and conditioning coach. The user wants to swap one exercise in a workout day of their program for a similar one.
Rules:
- Train the same main muscles in the same role: a compound lift for a compound lift, an isolation for an isolation, core for core.
- Never suggest an exercise already in the day or in the list to avoid.
- Keep the sets, reps and rest close to the replaced exercise unless the new one needs otherwise.
${EXERCISE_RULES}`;

const EXERCISE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    muscle_group: { type: 'string', enum: [...MUSCLE_GROUPS] },
    tracking_type: { type: 'string', enum: [...TRACKING_TYPES] },
    notes: { type: 'string' },
    sets: { type: 'integer' },
    reps_min: { type: 'integer' },
    reps_max: { type: 'integer' },
    duration_sec: { type: 'integer' },
    distance_km: { type: 'number' },
    rest_sec: { type: 'integer' },
  },
  required: [
    'name',
    'muscle_group',
    'tracking_type',
    'notes',
    'sets',
    'reps_min',
    'reps_max',
    'duration_sec',
    'distance_km',
    'rest_sec',
  ],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    summary: { type: 'string' },
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          exercises: { type: 'array', items: EXERCISE_SCHEMA },
        },
        required: ['name', 'exercises'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'summary', 'days'],
  additionalProperties: false,
};

type GroqExercise = {
  name: string;
  muscle_group: string;
  tracking_type: string;
  notes: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  duration_sec: number;
  distance_km: number;
  rest_sec: number;
};

type GroqPlan = {
  name: string;
  summary: string;
  days: { name: string; exercises: GroqExercise[] }[];
};

/** Fewer than this in a day means the AI didn't finish the plan. */
const MIN_DAY_EXERCISES = 3;

const nameKey = (name: string) => name.trim().toLowerCase();

const clamp = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const oneOf = <T extends string>(options: readonly T[], value: string, fallback: T) =>
  options.find((o) => o === value) ?? fallback;

/** Keeps only the targets that the tracking type uses, within sane limits. */
function toTargets(type: TrackingType, e: GroqExercise): Targets {
  const base = {
    targetSets: clamp(e.sets, 1, 10, 3),
    targetRepsMin: null,
    targetRepsMax: null,
    targetDurationSec: null,
    targetDistanceKm: null,
    // Rounded to the 15 s steps the editor uses.
    restSec: Math.round(clamp(e.rest_sec, 0, 600, 90) / 15) * 15,
  };
  switch (type) {
    case 'weight_reps':
    case 'reps':
    case 'weighted_reps': {
      const min = clamp(e.reps_min, 1, 100, 10);
      return { ...base, targetRepsMin: min, targetRepsMax: clamp(e.reps_max, min, 100, min) };
    }
    case 'duration':
      return { ...base, targetDurationSec: clamp(e.duration_sec, 5, 3600, 60) };
    case 'distance_duration':
      return {
        ...base,
        targetDurationSec: e.duration_sec > 0 ? clamp(e.duration_sec, 60, 6 * 3600, 1200) : null,
        targetDistanceKm:
          typeof e.distance_km === 'number' && e.distance_km > 0
            ? Math.round(Math.min(e.distance_km, 200) * 10) / 10
            : null,
      };
  }
}

const CATALOG_PHOTOS = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/** An exercise the AI may use: one from the library, or a new one with a photo. */
type Choice = {
  name: string;
  imageUri: string;
  /** Library exercise, or undefined for a new one. */
  known?: Library[number];
  muscleGroup?: MuscleGroup;
};

type Choices = {
  library: (Choice & { known: Library[number] })[];
  more: Choice[];
  byName: Map<string, Choice>;
};

/**
 * Only exercises with a photo: library ones that have one (or whose photo is
 * bundled or in the catalog), then new ones the equipment and limitations allow.
 */
function choicesFor({ answers, library }: Pick<ProgramRequest, 'answers' | 'library'>): Choices {
  const catalog = new Map<string, Choice>();
  const equipment = new Set(answers.equipment);
  const noJumps = answers.limits.includes('no_jumps');
  for (const [name, photo, muscleGroup, needs, jumps] of EXERCISE_CATALOG) {
    // Bodyweight exercises need nothing; the prompt rules out what needs a bar or bench.
    const fits = equipment.has('gym') || equipment.has(needs) || needs === 'bodyweight';
    if (!fits || (noJumps && jumps)) continue;
    catalog.set(nameKey(name), { name, imageUri: encodeURI(CATALOG_PHOTOS + photo), muscleGroup });
  }
  for (const [name, key] of Object.entries(DEFAULT_EXERCISE_IMAGES)) {
    catalog.set(nameKey(name), { name, imageUri: bundledImageUri(key) });
  }

  const known = new Set(library.map((l) => nameKey(l.name)));
  const libraryChoices = library.flatMap((l) => {
    const imageUri = l.imageUri ?? catalog.get(nameKey(l.name))?.imageUri;
    return imageUri ? [{ name: l.name, imageUri, known: l }] : [];
  });
  const more = [...catalog.values()].filter((c) => !known.has(nameKey(c.name)));
  const byName = new Map([...more, ...libraryChoices].map((c) => [nameKey(c.name), c]));
  return { library: libraryChoices, more, byName };
}

/** The AI's exercise matched by name; null when it isn't one with a photo. */
function toPlanExercise(e: GroqExercise, choices: Choices): PlanExercise | null {
  const choice = choices.byName.get(nameKey(e.name ?? ''));
  if (!choice) return null;
  const { known } = choice;
  // A library exercise keeps its own type, so its targets match how it is logged.
  const trackingType = known?.trackingType ?? oneOf(TRACKING_TYPES, e.tracking_type, 'weight_reps');
  return {
    name: choice.name,
    exerciseId: known?.id ?? null,
    muscleGroup:
      known?.muscleGroup ?? choice.muscleGroup ?? oneOf(MUSCLE_GROUPS, e.muscle_group, 'chest'),
    trackingType,
    notes: known ? null : e.notes?.trim() || null,
    imageUri: choice.imageUri,
    targets: toTargets(trackingType, e),
  };
}

function profileText(profile: Profile, weightKg: number | null | undefined) {
  const parts = [
    profile.sex ?? 'sex not given',
    profile.birthDate ? `${ageOn(profile.birthDate)} years old` : 'age not given',
    profile.heightCm ? `${profile.heightCm} cm` : 'height not given',
    weightKg ? `${weightKg} kg` : 'weight not given',
    `daily activity: ${ACTIVITY[profile.activity].hint}`,
    `weight goal: ${WEIGHT_GOAL[profile.goal].label}`,
  ];
  return parts.join(', ');
}

export type ProgramRequest = {
  answers: ProgramAnswers;
  wishes: string;
  profile: Profile;
  weightKg: number | null | undefined;
  library: Library;
  onAttempt?: (attempt: number) => void;
};

/** The user's profile, answers and the exercises to pick from, as the prompt sees them. */
function userContext({ answers, wishes, profile, weightKg }: ProgramRequest, choices: Choices) {
  const answerLines = PROGRAM_QUESTIONS.map((q) => {
    const picked = q.options.filter((o) => answers[q.key].includes(o.value));
    return `${q.prompt}: ${picked.map((o) => o.prompt).join(', ') || 'none'}`;
  });
  // Grouped by muscle, which keeps the long list short in tokens.
  const more = new Map<string, string[]>();
  for (const c of choices.more) {
    const group = c.muscleGroup ?? 'other';
    more.set(group, [...(more.get(group) ?? []), c.name]);
  }
  return [
    `Profile: ${profileText(profile, weightKg)}`,
    ...answerLines,
    `Wishes: ${wishes.trim() || 'none'}`,
    '',
    'Exercise library (name | muscle group | tracking type):',
    ...choices.library.map(({ known: e }) => `${e.name} | ${e.muscleGroup} | ${e.trackingType}`),
    '',
    'More exercises you may add, by muscle group (names separated by ";"):',
    ...[...more].map(([group, names]) => `${group}: ${names.join('; ')}`),
  ].join('\n');
}

/** Asks Groq for a program; throws `GroqError` with a user-facing message. */
export async function askProgramPlan(request: ProgramRequest): Promise<ProgramPlan> {
  const requestedDays = Number(request.answers.days[0]) || null;
  const choices = choicesFor(request);
  const withPhoto = (e: GroqExercise) => choices.byName.has(nameKey(e.name ?? ''));
  const raw = await groqJson<GroqPlan>({
    system: SYSTEM_PROMPT,
    user: userContext(request, choices),
    schema: SCHEMA,
    schemaName: 'program',
    // Some variety, so asking again gives a different program.
    temperature: 0.7,
    reasoningEffort: 'medium',
    // A 6-day plan with reasoning runs to several thousand tokens.
    maxTokens: 16000,
    // Sometimes it drops a day, leaves one nearly empty or makes up an exercise
    // without a photo; ask again then.
    accept: (reply) =>
      (!requestedDays || reply.days?.length === requestedDays) &&
      (reply.days ?? []).every(
        (d) => (d.exercises?.length ?? 0) >= MIN_DAY_EXERCISES && d.exercises.every(withPhoto),
      ),
    onAttempt: request.onAttempt,
  });

  const days = (raw.days ?? [])
    .map((d, i) => ({
      name: d.name?.trim() || `${tr('День', 'Day')} ${i + 1}`,
      // An exercise without a photo is left out even on the last try.
      exercises: (d.exercises ?? []).flatMap((e) => toPlanExercise(e, choices) ?? []),
    }))
    .filter((d) => d.exercises.length > 0);

  if (days.length === 0) {
    throw new Error(
      tr(
        'AI не склав жодного дня. Спробуй ще раз або зміни відповіді.',
        'AI didn’t come up with any days. Try again or change the answers.',
      ),
    );
  }
  return {
    name: raw.name?.trim() || tr('Програма від AI', 'AI program'),
    summary: raw.summary?.trim() ?? '',
    days,
  };
}

const describe = (e: PlanExercise) => `${e.name} (${e.muscleGroup}, ${formatTargets(e.targets)})`;

/**
 * Asks Groq for an exercise similar to `exercise` in `day`, other than those
 * already there and the ones in `avoid` (earlier suggestions for that slot).
 */
export async function askReplacement({
  day,
  exercise,
  avoid,
  ...request
}: ProgramRequest & {
  day: ProgramPlan['days'][number];
  exercise: PlanExercise;
  avoid: string[];
}): Promise<PlanExercise> {
  const taken = new Set([...day.exercises.map((e) => e.name), ...avoid].map(nameKey));
  const choices = choicesFor(request);
  const user = [
    userContext(request, choices),
    '',
    `Workout day "${day.name}":`,
    ...day.exercises.map((e) => `- ${describe(e)}`),
    '',
    `Replace: ${describe(exercise)}`,
    `Avoid: ${avoid.join(', ') || 'none'}`,
  ].join('\n');

  const pick = (reply: GroqExercise) =>
    taken.has(nameKey(reply.name ?? '')) ? null : toPlanExercise(reply, choices);
  const raw = await groqJson<GroqExercise>({
    system: REPLACE_PROMPT,
    user,
    schema: EXERCISE_SCHEMA,
    schemaName: 'exercise',
    // Variety, so asking again for the same slot brings something else.
    temperature: 0.9,
    accept: (reply) => pick(reply) !== null,
  });
  const next = pick(raw);
  if (!next) {
    throw new Error(
      tr(
        'AI не знайшов іншої схожої вправи. Спробуй ще раз.',
        'AI couldn’t find another similar exercise. Try again.',
      ),
    );
  }
  return next;
}

/**
 * Saves catalog photos of the plan's exercises into app storage, so they work
 * offline. A photo that fails to download stays a link, cached once it is shown.
 */
export async function downloadPlanPhotos(plan: ProgramPlan): Promise<ProgramPlan> {
  const urls = new Set(
    plan.days.flatMap((d) => d.exercises.map((e) => e.imageUri)).filter((u) => /^https?:/.test(u)),
  );
  const saved = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        saved.set(url, await downloadImage(url));
      } catch {}
    }),
  );
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => ({ ...e, imageUri: saved.get(e.imageUri) ?? e.imageUri })),
    })),
  };
}
