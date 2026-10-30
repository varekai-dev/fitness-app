import { t } from '@lingui/core/macro';
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
  key: 'kind' | 'goal' | 'level' | 'days' | 'duration' | 'equipment' | 'focus' | 'limits';
  title: string;
  hint?: string;
  /** Several options can be picked. */
  multi?: boolean;
  /** Can be left empty. */
  optional?: boolean;
  /** Label of the answer in the prompt, in English. */
  prompt: string;
  options: Option[];
  /** Asked only for these kinds of program; for every kind when unset. */
  kinds?: ProgramKind[];
};

export type ProgramAnswers = Record<ProgramQuestion['key'], string[]>;

/** A training program, or a warm-up or cool-down routine of one day. */
export type ProgramKind = 'training' | 'warmup' | 'cooldown';

export const programKind = (answers: ProgramAnswers): ProgramKind =>
  answers.kind[0] === 'warmup' || answers.kind[0] === 'cooldown' ? answers.kind[0] : 'training';

const MUSCLE_OPTIONS: Option[] = [
  { value: 'chest', label: t`Груди`, prompt: 'chest' },
  { value: 'back', label: t`Спина`, prompt: 'back' },
  { value: 'legs', label: t`Ноги`, prompt: 'legs' },
  { value: 'glutes', label: t`Сідниці`, prompt: 'glutes' },
  { value: 'shoulders', label: t`Плечі`, prompt: 'shoulders' },
  { value: 'arms', label: t`Руки`, prompt: 'arms (biceps and triceps)' },
  { value: 'abs', label: t`Прес`, prompt: 'abs and core' },
];

/**
 * Some questions come in a version for training and one for warm-ups and
 * cool-downs; only the one for the picked kind is asked.
 */
export const PROGRAM_QUESTIONS: ProgramQuestion[] = [
  {
    key: 'kind',
    title: t`Що складаємо?`,
    prompt: 'Program type',
    options: [
      {
        value: 'training',
        label: t`Тренування`,
        hint: t`Програма на тиждень під твою мету`,
        prompt: 'training program',
      },
      {
        value: 'warmup',
        label: t`Розминка`,
        hint: t`Розігріти тіло й суглоби перед тренуванням`,
        prompt: 'warm-up before a workout',
      },
      {
        value: 'cooldown',
        label: t`Заминка`,
        hint: t`Заспокоїти пульс і розтягнутися після`,
        prompt: 'cool-down after a workout',
      },
    ],
  },
  {
    key: 'goal',
    kinds: ['training'],
    title: t`Яка головна мета?`,
    prompt: 'Main goal',
    options: [
      {
        value: 'tone',
        label: t`Тримати себе в тонусі`,
        hint: t`Загальна форма, сила й витривалість`,
        prompt: 'stay fit and toned, general fitness',
      },
      {
        value: 'strength',
        label: t`Сила`,
        hint: t`Важкі базові вправи, менше повторень`,
        prompt: 'get stronger, emphasis on heavy compound strength training',
      },
      {
        value: 'muscle',
        label: t`Набір м’язів`,
        hint: t`Об’єм і форма м’язів`,
        prompt: 'build muscle (hypertrophy)',
      },
      {
        value: 'fat_loss',
        label: t({ message: 'Схуднення', context: 'Lose fat' }),
        hint: t`Більше руху, короткий відпочинок`,
        prompt: 'lose fat while keeping muscle',
      },
      {
        value: 'endurance',
        label: t`Витривалість`,
        hint: t`Кардіо й робота в багатьох повтореннях`,
        prompt: 'improve endurance and conditioning',
      },
    ],
  },
  {
    key: 'goal',
    kinds: ['warmup'],
    title: t`Перед чим розминка?`,
    prompt: 'Warm-up before',
    options: [
      {
        value: 'strength',
        label: t`Силове тренування`,
        hint: t`Штанга, гантелі, тренажери`,
        prompt: 'strength training with weights',
      },
      {
        value: 'cardio',
        label: t`Біг чи кардіо`,
        hint: t`Біг, велосипед, скакалка`,
        prompt: 'running or other cardio',
      },
      {
        value: 'intense',
        label: t`Інтенсивне тренування`,
        hint: t`HIIT, кросфіт, ігрові види спорту`,
        prompt: 'intense workout: HIIT, CrossFit or team sports',
      },
      {
        value: 'morning',
        label: t`Ранкова зарядка`,
        hint: t`Просто прокинутися й розім’ятися`,
        prompt: 'a morning routine on its own, no workout after it',
      },
    ],
  },
  {
    key: 'goal',
    kinds: ['cooldown'],
    title: t`Після чого заминка?`,
    prompt: 'Cool-down after',
    options: [
      {
        value: 'strength',
        label: t`Силове тренування`,
        hint: t`Штанга, гантелі, тренажери`,
        prompt: 'strength training with weights',
      },
      {
        value: 'cardio',
        label: t`Біг чи кардіо`,
        hint: t`Біг, велосипед, скакалка`,
        prompt: 'running or other cardio',
      },
      {
        value: 'intense',
        label: t`Інтенсивне тренування`,
        hint: t`HIIT, кросфіт, ігрові види спорту`,
        prompt: 'intense workout: HIIT, CrossFit or team sports',
      },
      {
        value: 'relax',
        label: t`Просто розтягнутися`,
        hint: t`Увечері чи після дня за столом`,
        prompt: 'a relaxing stretch on its own, after a day of sitting',
      },
    ],
  },
  {
    key: 'focus',
    kinds: ['warmup'],
    title: t`Що працюватиме найбільше?`,
    hint: t`Можна пропустити — тоді все тіло`,
    multi: true,
    optional: true,
    prompt: 'Muscles the workout trains',
    options: MUSCLE_OPTIONS,
  },
  {
    key: 'focus',
    kinds: ['cooldown'],
    title: t`Що найбільше втомилося?`,
    hint: t`Можна пропустити — тоді все тіло`,
    multi: true,
    optional: true,
    prompt: 'Muscles the workout trained',
    options: MUSCLE_OPTIONS,
  },
  {
    key: 'level',
    kinds: ['warmup', 'cooldown'],
    title: t`Яка в тебе гнучкість?`,
    prompt: 'Flexibility',
    options: [
      {
        value: 'stiff',
        label: t`Скутий`,
        hint: t`Важко дотягнутися до пальців ніг`,
        prompt: 'stiff, keep the range of motion small and easy',
      },
      {
        value: 'average',
        label: t`Середня`,
        hint: t`Дотягуюся до пальців з прямими ногами`,
        prompt: 'average',
      },
      {
        value: 'flexible',
        label: t`Гнучкий`,
        hint: t`Долоні легко лягають на підлогу`,
        prompt: 'flexible, deeper positions are fine',
      },
    ],
  },
  {
    key: 'level',
    kinds: ['training'],
    title: t`Який у тебе досвід?`,
    prompt: 'Training experience',
    options: [
      {
        value: 'beginner',
        label: t`Новачок`,
        hint: t`Менше пів року або давно не тренувався`,
        prompt: 'beginner (under 6 months)',
      },
      {
        value: 'intermediate',
        label: t({ message: 'Середній', context: 'Intermediate' }),
        hint: t`Від пів року до 2 років`,
        prompt: 'intermediate (6 months to 2 years)',
      },
      {
        value: 'advanced',
        label: t`Досвідчений`,
        hint: t`Понад 2 роки регулярних тренувань`,
        prompt: 'advanced (over 2 years)',
      },
    ],
  },
  {
    key: 'days',
    kinds: ['training'],
    title: t`Скільки разів на тиждень?`,
    prompt: 'Workouts per week',
    options: [2, 3, 4, 5, 6].map((n) => ({
      value: String(n),
      label: String(n),
      prompt: String(n),
    })),
  },
  {
    key: 'duration',
    kinds: ['training'],
    title: t`Скільки триває тренування?`,
    prompt: 'Workout length',
    options: [
      { value: '15', label: t`15 хв`, prompt: '15 minutes (about 3 exercises)' },
      { value: '30', label: t`30 хв`, prompt: '30 minutes (about 3–4 exercises)' },
      { value: '45', label: t`45 хв`, prompt: '45 minutes (about 4–5 exercises)' },
      { value: '60', label: t`1 год`, prompt: '60 minutes (about 5–6 exercises)' },
      {
        value: '90',
        label: t`1,5 год`,
        prompt: '90 minutes (about 6–8 exercises)',
      },
    ],
  },
  {
    key: 'duration',
    kinds: ['warmup', 'cooldown'],
    title: t`Скільки часу є?`,
    prompt: 'Routine length',
    options: [5, 10, 15].map((n) => ({
      value: String(n),
      label: t`${n} хв`,
      prompt: `${n} minutes`,
    })),
  },
  {
    key: 'equipment',
    kinds: ['warmup', 'cooldown'],
    title: t`Що є під рукою?`,
    hint: t`Познач усе, що маєш`,
    multi: true,
    prompt: 'Available equipment (use nothing else)',
    options: [
      {
        value: 'bodyweight',
        label: t`Нічого, лише килимок`,
        prompt: 'bodyweight only, a wall or a chair',
      },
      { value: 'bands', label: t`Резинки`, prompt: 'resistance bands' },
      {
        value: 'foam_roller',
        label: t`Масажний ролик`,
        prompt: 'foam roller',
      },
      { value: 'dumbbells', label: t`Легкі гантелі`, prompt: 'dumbbells' },
      { value: 'kettlebell', label: t`Гиря`, prompt: 'kettlebell' },
      {
        value: 'gym',
        label: t`Спортзал`,
        prompt: 'full gym: cardio machines, cables, balls, foam rollers, bars',
      },
    ],
  },
  {
    key: 'equipment',
    kinds: ['training'],
    title: t`Що є з обладнання?`,
    hint: t`Познач усе, що маєш`,
    multi: true,
    prompt: 'Available equipment (use nothing else)',
    options: [
      {
        value: 'gym',
        label: t`Повний спортзал`,
        prompt: 'full gym: barbells, dumbbells, machines, cables, benches, pull-up bar',
      },
      { value: 'dumbbells', label: t`Гантелі`, prompt: 'dumbbells' },
      { value: 'barbell', label: t`Штанга`, prompt: 'barbell with plates and rack' },
      { value: 'bench', label: t`Лава`, prompt: 'adjustable bench' },
      { value: 'pullup_bar', label: t`Турнік`, prompt: 'pull-up bar' },
      { value: 'dip_bars', label: t`Бруси`, prompt: 'dip bars' },
      { value: 'kettlebell', label: t`Гиря`, prompt: 'kettlebell' },
      { value: 'bands', label: t`Резинки`, prompt: 'resistance bands' },
      {
        value: 'bodyweight',
        label: t`Нічого, власна вага`,
        prompt: 'bodyweight only',
      },
    ],
  },
  {
    key: 'focus',
    kinds: ['training'],
    title: t`На що зробити акцент?`,
    hint: t`Можна пропустити — тоді все рівномірно`,
    multi: true,
    optional: true,
    prompt: 'Extra focus',
    options: [
      ...MUSCLE_OPTIONS,
      { value: 'cardio', label: t`Кардіо`, prompt: 'cardio' },
    ],
  },
  {
    key: 'limits',
    title: t`Щось обмежує?`,
    hint: t`AI не дасть вправ, що навантажують ці місця. Пропусти, якщо нічого не турбує`,
    multi: true,
    optional: true,
    prompt: 'Limitations, avoid loading them',
    options: [
      { value: 'knees', label: t`Коліна`, prompt: 'knees' },
      { value: 'lower_back', label: t`Поперек`, prompt: 'lower back' },
      { value: 'shoulders', label: t`Плечі`, prompt: 'shoulders' },
      { value: 'wrists', label: t`Зап’ястя`, prompt: 'wrists' },
      { value: 'neck', label: t`Шия`, prompt: 'neck' },
      { value: 'no_jumps', label: t`Без стрибків`, prompt: 'no jumping' },
    ],
  },
];

/** The questions asked for the kind of program picked so far. */
export const questionsFor = (answers: ProgramAnswers) =>
  PROGRAM_QUESTIONS.filter((q) => !q.kinds || q.kinds.includes(programKind(answers)));

export const EMPTY_ANSWERS: ProgramAnswers = {
  kind: [],
  goal: [],
  level: [],
  days: [],
  duration: [],
  equipment: [],
  focus: [],
  limits: [],
};

/** Ready-made wishes the user can tap into the text field. */
export const WISH_SUGGESTIONS: Record<ProgramKind, string[]> = {
  training: [
    t({ message: 'Тримати себе в тонусі', context: 'Stay in shape' }),
    t`Уклон на силові`,
    t`Більше кардіо`,
    t`Тренуюся вдома`,
    t`Хочу більше підтягуватися`,
  ],
  warmup: [
    t`Усе стоячи, без підлоги`,
    t`Суглоби скуті зранку`,
    t`Тихо, щоб не заважати сусідам`,
    t`Більше на плечі`,
  ],
  cooldown: [
    t`Хочу стати гнучкішим`,
    t`Затерплі спина й шия`,
    t`Спокійно, щоб розслабитися`,
    t`Більше на ноги`,
  ],
};

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

/** Sets, reps and rest for each kind of program. */
const TARGET_RULES: Record<ProgramKind, string> = {
  training:
    '- Pick reps and rest for the goal: strength 3–6 reps and 120–180 s rest, muscle 6–12 reps and 60–120 s, toning 10–15 reps and 45–75 s, fat loss and endurance 12–20 reps and 30–60 s. Beginners get fewer sets.',
  warmup:
    '- Keep it easy: mostly timed exercises of 30–90 s, or 10–15 light reps; 1 set (2 for one done on each side, a set per side); rest_sec 0–15. No heavy loads, nothing to failure.',
  cooldown:
    '- Keep it easy: mostly stretches held 30–60 s, timed; 1 set (2 for one done on each side, a set per side); rest_sec 0–15. No intense work.',
};

/** What the program and a replacement have to follow alike. */
const exerciseRules = (
  kind: ProgramKind,
) => `- Use only the listed equipment. Never give exercises that load the listed limitations.
${TARGET_RULES[kind]}
- Use only exercises from the two lists below, copying their names exactly; never invent others. Prefer the library where it suits the goal and equipment; when the equipment allows better choices the library lacks (barbell, machines, cables, kettlebell, bands…) or the focus needs them, add exercises from the list of more exercises.
- muscle_group: the main muscle worked; tracking_type: weight_reps for exercises with external load, reps for bodyweight reps, weighted_reps for bodyweight exercises that can take added weight (pull-ups, dips), duration for holds and timed work, distance_duration for running, cycling, rowing and similar.
- Targets: sets; reps_min and reps_max for rep exercises, else 0; duration_sec for timed exercises (and optionally for distance ones), else 0; distance_km for distance exercises when it makes sense, else 0; rest_sec between sets.
- notes: for an exercise from the list of more exercises, 1–2 sentences on technique in ${t`Ukrainian`}; empty for library exercises.`;

const TRAINING_PROMPT = `You are an experienced strength and conditioning coach. Design a training program for the user.
A program is a cycle of workout days that repeat in order (e.g. Push / Pull / Legs); one day is one workout.
Rules:
- The user's wishes come first, then the main goal; also follow the experience level, workouts per week, workout length and focus.
- Take the profile into account (sex, age, body weight, activity, weight goal).
- Make exactly as many days as workouts per week, each a different workout.
- Fill every day, the last one included, with as many exercises as the workout length allows. Compound exercises first, isolation and core last.
${exerciseRules('training')}
- summary: 1–2 sentences on how the program is built and why it suits the user.
- name: a short program name of 2–4 words, without numbers of days or minutes.
- Day names: a few words on what the day trains (e.g. ${t`"Груди й трицепс", "Верх тіла"`}), without "Day 1" numbering.
- Write the program name, day names, summary and notes in natural, grammatical ${t`Ukrainian`}.`;

/** What a warm-up and a cool-down are made of, in order. */
const ROUTINE_STEPS = {
  warmup:
    '- Start with 1–2 minutes of easy cardio to raise the pulse, then dynamic mobility for the joints (circles, swings, inchworms), then light activation of the focus muscles. No long static stretches.',
  cooldown:
    '- Start with 1–2 minutes of easy cardio or walking to bring the pulse down, then static stretches for the focus muscles; foam rolling suits too if the equipment has it.',
};

const routinePrompt = (kind: 'warmup' | 'cooldown') => {
  const warmup = kind === 'warmup';
  return `You are an experienced strength and conditioning coach. Design a ${warmup ? 'warm-up before' : 'cool-down after'} a workout for the user: one day of short, easy exercises done in order.
Rules:
- The user's wishes come first; also follow what the routine goes with, its length, the user's flexibility and the muscles given (the whole body when there are none).
- Take the profile into account (sex, age, body weight, activity).
- Make exactly one day. Fit the length: about 3–4 exercises for 5 minutes, 5–6 for 10, 6–8 for 15.
${ROUTINE_STEPS[kind]}
${exerciseRules(kind)}
- summary: 1–2 sentences on what the routine does and why it suits the user.
- name: a short name of 2–4 words (e.g. ${warmup ? t`"Розминка для ніг"` : t`"Заминка після верху тіла"`}), without minutes.
- Day name: a few words on what it is for (e.g. ${warmup ? t`"Перед тренуванням ніг"` : t`"Розтяжка всього тіла"`}).
- Write the name, day name, summary and notes in natural, grammatical ${t`Ukrainian`}.`;
};

const systemPrompt = (kind: ProgramKind) =>
  kind === 'training' ? TRAINING_PROMPT : routinePrompt(kind);

const WHAT_IS_REPLACED: Record<ProgramKind, string> = {
  training: 'a workout day of their program',
  warmup: 'their warm-up',
  cooldown: 'their cool-down',
};

const replacePrompt = (
  kind: ProgramKind,
) => `You are an experienced strength and conditioning coach. The user wants to swap one exercise in ${WHAT_IS_REPLACED[kind]} for a similar one.
Rules:
- Train the same main muscles in the same role: a compound lift for a compound lift, an isolation for an isolation, core for core, a stretch for a stretch, a mobility drill for a mobility drill.
- Never suggest an exercise already in the day or in the list to avoid.
- Keep the sets, reps, duration and rest close to the replaced exercise unless the new one needs otherwise.
${exerciseRules(kind)}`;

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
    // Rounded to the 15 s steps the editor uses; no rest is fine (warm-ups).
    restSec: e.rest_sec === 0 ? 0 : Math.round(clamp(e.rest_sec, 0, 600, 90) / 15) * 15,
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
 * Stretches only go into warm-ups and cool-downs.
 */
function choicesFor({ answers, library }: Pick<ProgramRequest, 'answers' | 'library'>): Choices {
  const catalog = new Map<string, Choice>();
  const equipment = new Set(answers.equipment);
  const noJumps = answers.limits.includes('no_jumps');
  const routine = programKind(answers) !== 'training';
  for (const [name, photo, muscleGroup, needs, jumps, stretch] of EXERCISE_CATALOG) {
    // Bodyweight exercises need nothing; the prompt rules out what needs a bar or bench.
    const fits = equipment.has('gym') || equipment.has(needs) || needs === 'bodyweight';
    if (!fits || (noJumps && jumps) || (stretch && !routine)) continue;
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
  const answerLines = questionsFor(answers).map((q) => {
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
  const kind = programKind(request.answers);
  const requestedDays = kind === 'training' ? Number(request.answers.days[0]) || null : 1;
  const choices = choicesFor(request);
  const withPhoto = (e: GroqExercise) => choices.byName.has(nameKey(e.name ?? ''));
  const raw = await groqJson<GroqPlan>({
    system: systemPrompt(kind),
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
      name: d.name?.trim() || `${t`День`} ${i + 1}`,
      // An exercise without a photo is left out even on the last try.
      exercises: (d.exercises ?? []).flatMap((e) => toPlanExercise(e, choices) ?? []),
    }))
    .filter((d) => d.exercises.length > 0);

  if (days.length === 0) {
    throw new Error(
      t`AI не склав жодного дня. Спробуй ще раз або зміни відповіді.`,
    );
  }
  return {
    name: raw.name?.trim() || t`Програма від AI`,
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
    system: replacePrompt(programKind(request.answers)),
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
      t`AI не знайшов іншої схожої вправи. Спробуй ще раз.`,
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
