import { plural, t } from '@lingui/core/macro';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useDialog } from '@/components/dialog';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { PlanExerciseSheet } from '@/components/plan-exercise-sheet';
import { ProgramAiLoader, type LoaderStage } from '@/components/program-ai-loader';
import { ReportAiButton } from '@/components/report-ai';
import { Spinner } from '@/components/spinner';
import {
  Badge,
  Button,
  Card,
  Chip,
  Field,
  goBack,
  IndexMarker,
  Loading,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { listExercises } from '@/db/exercises';
import { loadProfile } from '@/db/profile';
import { saveProgramPlan } from '@/db/programs';
import type { Exercise } from '@/db/schema';
import { useDbQuery } from '@/hooks/use-db-query';
import { GROQ_ATTEMPTS, GroqError } from '@/lib/groq';
import { formatTargets, MUSCLE_GROUP_LABELS } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import { ACTIVITY, ageOn, SEX_LABELS, WEIGHT_GOAL, type Profile } from '@/lib/profile';
import {
  askProgramPlan,
  askReplacement,
  downloadPlanPhotos,
  EMPTY_ANSWERS,
  programKind,
  questionsFor,
  WISH_SUGGESTIONS,
  type ProgramAnswers,
  type ProgramKind,
  type ProgramPlan,
  type ProgramQuestion,
} from '@/lib/program-ai';
import { cmToDisplay, HEIGHT_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { colors, radius, spacing } from '@/theme';

/** What a finished plan is called, by kind. */
const READY_LABEL: Record<ProgramKind, string> = {
  training: t`Програма готова`,
  warmup: t`Розминка готова`,
  cooldown: t`Заминка готова`,
};

const WISHES_HINT: Record<ProgramKind, string> = {
  training: t`Напиши своїми словами, що хочеш від тренувань. Можна пропустити.`,
  warmup: t`Напиши своїми словами, що хочеш від розминки. Можна пропустити.`,
  cooldown: t`Напиши своїми словами, що хочеш від заминки. Можна пропустити.`,
};

const WISHES_PLACEHOLDER: Record<ProgramKind, string> = {
  training: t`Напр. «тримати себе в тонусі» або «уклон на силові»`,
  warmup: t`Напр. «усе стоячи» або «суглоби скуті зранку»`,
  cooldown: t`Напр. «стати гнучкішим» або «затерпла спина»`,
};

/**
 * Builds a program with AI: a few questions with ready answers, the user's own
 * wishes and their profile go to Groq; the plan is shown before it is saved.
 * `?programId=` fills that (empty) program instead of creating a new one.
 */
export default function AiProgramScreen() {
  const params = useLocalSearchParams<{ programId?: string }>();
  const intoProgramId = params.programId ? Number(params.programId) : undefined;
  const { data: profileData } = useDbQuery(loadProfile);
  const { data: library } = useDbQuery(listExercises);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ProgramAnswers>(EMPTY_ANSWERS);
  const [wishes, setWishes] = useState('');
  const [plan, setPlan] = useState<ProgramPlan | null>(null);
  // The answer, held while the loader finishes its checklist.
  const [readyPlan, setReadyPlan] = useState<ProgramPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [attempt, setAttempt] = useState(1);
  // Exercises being swapped right now, as "day-index" keys.
  const [replacing, setReplacing] = useState<string[]>([]);
  // Every exercise a slot has held, so asking again brings something new.
  const [tried, setTried] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const dialog = useDialog();

  if (!profileData || !library) return <Loading />;

  const request = {
    answers,
    wishes,
    profile: profileData.profile,
    weightKg: profileData.latestWeight?.weightKg,
    library,
  };

  const showError = (title: string, e: unknown) => {
    const signedOut = e instanceof GroqError && e.kind === 'auth';
    dialog.show({
      title,
      message: (e as Error).message,
      icon: 'alert-circle',
      buttons: signedOut
        ? [
            { text: t`Скасувати`, style: 'cancel' },
            {
              text: t`Акаунт`,
              onPress: () => router.push('/settings/account'),
            },
          ]
        : undefined,
    });
  };

  const generate = async () => {
    if (generating) return;
    setAttempt(1);
    setGenerating(true);
    try {
      setReadyPlan(await askProgramPlan({ ...request, onAttempt: setAttempt }));
    } catch (e) {
      setGenerating(false);
      showError(t`Не вдалося скласти програму`, e);
    }
  };

  const showPlan = () => {
    setPlan(readyPlan);
    setReadyPlan(null);
    setTried({});
    setGenerating(false);
  };

  // Swaps one exercise for a similar one AI picks.
  const replace = async (dayIndex: number, index: number) => {
    const day = plan?.days[dayIndex];
    const exercise = day?.exercises[index];
    const key = `${dayIndex}-${index}`;
    if (!day || !exercise || replacing.includes(key)) return;
    const avoid = [...(tried[key] ?? []), exercise.name];
    setReplacing((r) => [...r, key]);
    try {
      const next = await askReplacement({ ...request, day, exercise, avoid });
      setTried((t) => ({ ...t, [key]: avoid }));
      // Only if the slot still holds what was replaced; the plan may have changed meanwhile.
      setPlan((p) =>
        p?.days[dayIndex]?.exercises[index]?.name === exercise.name
          ? {
              ...p,
              days: p.days.map((d, i) =>
                i === dayIndex
                  ? { ...d, exercises: d.exercises.map((e, j) => (j === index ? next : e)) }
                  : d,
              ),
            }
          : p,
      );
    } catch (e) {
      showError(t`Не вдалося замінити вправу`, e);
    } finally {
      setReplacing((r) => r.filter((k) => k !== key));
    }
  };

  const save = async () => {
    if (!plan || saving) return;
    let id: number;
    setSaving(true);
    try {
      id = saveProgramPlan(await downloadPlanPhotos(plan), intoProgramId);
    } catch (e) {
      dialog.show({
        title: t`Не вдалося зберегти`,
        message: (e as Error).message,
        icon: 'alert-circle',
      });
      return;
    } finally {
      setSaving(false);
    }
    if (intoProgramId !== undefined) goBack();
    else router.replace({ pathname: '/program/[id]', params: { id } });
  };

  const kind = programKind(answers);
  // The questions for the kind picked, then a last step with free-text wishes.
  const questions = questionsFor(answers);
  const question = questions[step];
  // A required multi-choice question with nothing picked yet can't move on.
  const needsAnswer = !!question?.multi && !question.optional && answers[question.key].length === 0;

  return (
    <Screen title={t`Програма з AI`} mode="modal">
      {generating ? (
        <ProgramAiLoader
          stages={loaderStages(
            answers,
            wishes,
            profileFacts(profileData.profile, profileData.latestWeight?.weightKg),
            library.length,
          )}
          exerciseNames={library.map((e) => e.name)}
          attempt={attempt}
          attempts={GROQ_ATTEMPTS}
          done={readyPlan !== null}
          onFinish={showPlan}
        />
      ) : plan ? (
        <PlanPreview
          plan={plan}
          kind={kind}
          library={library}
          replacing={replacing}
          onReplace={replace}
          saving={saving}
          onSave={save}
          onRegenerate={generate}
          onEdit={() => setPlan(null)}
        />
      ) : (
        <>
          <Progress step={step} steps={questions.length + 1} />
          {question ? (
            <QuestionStep
              key={question.key}
              question={question}
              value={answers[question.key]}
              onChange={(value) => {
                // Training and routines ask their own questions; only limits carry over.
                const kindChanged = question.key === 'kind' && value[0] !== answers.kind[0];
                setAnswers({
                  ...(kindChanged ? { ...EMPTY_ANSWERS, limits: answers.limits } : answers),
                  [question.key]: value,
                });
                // One answer is all a single-choice question needs.
                if (!question.multi) setStep(step + 1);
              }}
            />
          ) : (
            <WishesStep
              kind={kind}
              wishes={wishes}
              onChange={setWishes}
              profile={profileData.profile}
              weightKg={profileData.latestWeight?.weightKg}
            />
          )}
          {needsAnswer && (
            <Text variant="muted" style={styles.center}>
              {t`Обери хоча б один варіант`}
            </Text>
          )}
          <Row>
            {step > 0 && (
              <Button
                title={t`Назад`}
                icon="chevron-back"
                variant="secondary"
                onPress={() => setStep(step - 1)}
                style={styles.flex}
              />
            )}
            {question ? (
              (question.multi || answers[question.key].length > 0) && (
                <Button
                  title={
                    question.optional && answers[question.key].length === 0
                      ? t`Пропустити`
                      : t`Далі`
                  }
                  trailingIcon="chevron-forward"
                  onPress={() => setStep(step + 1)}
                  // Grey rather than a dimmed accent, so it doesn't look tappable.
                  variant={needsAnswer ? 'secondary' : 'primary'}
                  disabled={needsAnswer}
                  style={styles.flex}
                />
              )
            ) : (
              <Button
                title={t`Скласти`}
                icon="sparkles"
                onPress={generate}
                style={styles.flex}
              />
            )}
          </Row>
        </>
      )}
      {dialog.element}
    </Screen>
  );
}

/** Profile in a few words: "Чоловік · 36 років · 175 см · …". */
function profileFacts(profile: Profile, weightKg: number | undefined) {
  return [
    profile.sex && SEX_LABELS[profile.sex],
    profile.birthDate &&
      `${ageOn(profile.birthDate)} ${plural(ageOn(profile.birthDate), { one: 'рік', few: 'роки', many: 'років', other: 'роки' })}`,
    profile.heightCm && `${formatNumber(cmToDisplay(profile.heightCm), 0)} ${HEIGHT_UNIT}`,
    weightKg && `${formatWeight(weightKg, 1)} ${WEIGHT_UNIT}`,
    `${t`активність`}: ${ACTIVITY[profile.activity].label.toLowerCase()}`,
    WEIGHT_GOAL[profile.goal].label.toLowerCase(),
  ].filter(Boolean) as string[];
}

/** Labels of the picked answers to a question, joined. */
function picked(answers: ProgramAnswers, key: ProgramQuestion['key']) {
  const question = questionsFor(answers).find((q) => q.key === key);
  return (question?.options ?? [])
    .filter((o) => answers[key].includes(o.value))
    .map((o) => o.label)
    .join(', ');
}

/** What the loader says AI is doing, built from the user's own answers. */
function loaderStages(
  answers: ProgramAnswers,
  wishes: string,
  facts: string[],
  libraryCount: number,
): LoaderStage[] {
  const days = Number(answers.days[0]) || 3;
  const routine = programKind(answers) !== 'training';
  return [
    { title: t`Аналізую профіль`, detail: facts.join(' · ') },
    {
      title: routine
        ? t`Враховую побажання`
        : t`Враховую мету й побажання`,
      detail: [picked(answers, 'goal'), wishes.trim()].filter(Boolean).join(' · '),
    },
    {
      title: routine
        ? `${t`Вкладаю в`} ${picked(answers, 'duration')}`
        : `${t`Розподіляю`} ${days} ${plural(days, { one: 'тренування', few: 'тренування', many: 'тренувань', other: 'тренування' })} ${t`на тиждень`}`,
      detail: [routine ? '' : picked(answers, 'duration'), picked(answers, 'focus')]
        .filter(Boolean)
        .join(' · '),
    },
    {
      title: t`Підбираю вправи`,
      detail: t`${libraryCount} у бібліотеці · ${picked(answers, 'equipment')}`,
    },
    {
      title: routine
        ? t`Розраховую час на вправи`
        : t`Розраховую підходи й відпочинок`,
      detail: picked(answers, 'level'),
    },
    {
      title: t`Перевіряю план`,
      detail: picked(answers, 'limits') || undefined,
    },
  ];
}

function Progress({ step, steps }: { step: number; steps: number }) {
  return (
    <View style={styles.progress}>
      <Text variant="overline">
        {/* "з" in capitals reads like a 3, so a slash instead. */}
        {t`Крок`} {step + 1}/{steps}
      </Text>
      <View style={styles.progressBar}>
        {Array.from({ length: steps }, (_, i) => (
          <View key={i} style={[styles.progressPart, i <= step && styles.progressPartDone]} />
        ))}
      </View>
    </View>
  );
}

function QuestionStep({
  question,
  value,
  onChange,
}: {
  question: ProgramQuestion;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const toggle = (option: string) => {
    if (!question.multi) return onChange([option]);
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };
  // Short answers without hints: "3" or "45 min" fit in one row, the rest in two columns.
  const short = question.options.every((o) => !o.hint);
  const compact = short && !question.multi;
  const grid = short && question.multi;

  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <Text variant="title">{question.title}</Text>
        {question.hint && <Text variant="secondary">{question.hint}</Text>}
      </View>
      <View style={compact ? styles.row : grid ? styles.grid : styles.list}>
        {question.options.map((o) => {
          const selected = value.includes(o.value);
          return (
            <Pressable
              key={o.value}
              onPress={() => toggle(o.value)}
              style={({ pressed }) => [
                styles.option,
                compact && styles.optionCompact,
                grid && styles.optionGrid,
                selected && styles.optionSelected,
                pressed && styles.pressed,
              ]}>
              <View style={styles.flex}>
                <Text
                  variant="body"
                  style={[compact && styles.center, selected && styles.selectedText]}>
                  {o.label}
                </Text>
                {o.hint && (
                  <Text variant="muted" style={selected && styles.selectedHint}>
                    {o.hint}
                  </Text>
                )}
              </View>
              {question.multi && (
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={selected ? colors.accentText : colors.textMuted}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WishesStep({
  kind,
  wishes,
  onChange,
  profile,
  weightKg,
}: {
  kind: ProgramKind;
  wishes: string;
  onChange: (text: string) => void;
  profile: Profile;
  weightKg: number | undefined;
}) {
  const append = (wish: string) => {
    const text = wishes.trim();
    onChange(text ? `${text.replace(/[.,;]$/, '')}, ${wish.toLowerCase()}` : wish);
  };
  const facts = profileFacts(profile, weightKg);
  const incomplete = !profile.sex || !profile.birthDate || !profile.heightCm || !weightKg;

  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <Text variant="title">{t`Твої побажання`}</Text>
        <Text variant="secondary">{WISHES_HINT[kind]}</Text>
      </View>
      <Field
        value={wishes}
        onChangeText={onChange}
        placeholder={WISHES_PLACEHOLDER[kind]}
        multiline
      />
      <View style={styles.chips}>
        {WISH_SUGGESTIONS[kind].map((w) => (
          <Chip key={w} label={`+ ${w}`} selected={false} onPress={() => append(w)} />
        ))}
      </View>
      <Card onPress={() => router.push('/profile')} style={styles.profile}>
        <Ionicons name="person-circle-outline" size={28} color={colors.accent} />
        <View style={styles.flex}>
          <Text variant="body">{t`AI врахує профіль`}</Text>
          <Text variant="muted">{facts.join(' · ')}</Text>
          {incomplete && (
            <Text variant="muted" style={styles.warning}>
              {t`Заповни профіль, щоб програма була точнішою`}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </View>
  );
}

function PlanPreview({
  plan,
  kind,
  library,
  replacing,
  onReplace,
  saving,
  onSave,
  onRegenerate,
  onEdit,
}: {
  plan: ProgramPlan;
  kind: ProgramKind;
  library: Exercise[];
  replacing: string[];
  onReplace: (dayIndex: number, index: number) => void;
  saving: boolean;
  onSave: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
}) {
  const total = plan.days.reduce((n, d) => n + d.exercises.length, 0);
  const newCount = new Set(
    plan.days.flatMap((d) => d.exercises.filter((e) => e.exerciseId === null).map((e) => e.name)),
  ).size;
  // The exercise shown on the whole screen.
  const [open, setOpen] = useState<{ dayIndex: number; index: number } | null>(null);
  const opened = open ? (plan.days[open.dayIndex]?.exercises[open.index] ?? null) : null;
  const known = opened?.exerciseId != null ? library.find((l) => l.id === opened.exerciseId) : null;

  return (
    <>
      <PlanExerciseSheet
        exercise={opened}
        notes={known ? known.notes : (opened?.notes ?? null)}
        youtubeUrl={known?.youtubeUrl ?? null}
        onReplace={() => {
          if (!open) return;
          setOpen(null);
          onReplace(open.dayIndex, open.index);
        }}
        onClose={() => setOpen(null)}
      />
      <View style={styles.stepHeader}>
        <Row style={styles.readyRow}>
          <Text variant="overline">{READY_LABEL[kind]}</Text>
          <ReportAiButton feature="program_plan" content={plan} />
        </Row>
        <Text variant="title">{plan.name}</Text>
        {plan.summary !== '' && <Text variant="secondary">{plan.summary}</Text>}
      </View>
      <Row style={styles.badges}>
        {kind === 'training' && (
          <Badge
            label={`${plan.days.length} ${plural(plan.days.length, { one: 'дн.', other: 'дн.' })}`}
            tone="muted"
          />
        )}
        <Badge
          label={`${total} ${plural(total, { one: 'вправа', few: 'вправи', many: 'вправ', other: 'вправи' })}`}
          tone="muted"
        />
        {newCount > 0 && (
          <Badge
            label={`${newCount} ${plural(newCount, { one: 'нова', few: 'нові', many: 'нових', other: 'нові' })}`}
          />
        )}
      </Row>
      {newCount > 0 && (
        <Text variant="muted">
          {t`Нових вправ ще немає в бібліотеці — вони додадуться туди з фото, описом техніки й відео.`}
        </Text>
      )}

      {plan.days.map((day, dayIndex) => (
        <Card key={dayIndex}>
          <Row>
            <IndexMarker n={dayIndex + 1} />
            <Text variant="heading" style={styles.flex}>
              {day.name}
            </Text>
          </Row>
          {day.exercises.map((e, j) => (
            // Keyed by name, so a replacement fades in.
            <Animated.View key={`${j}-${e.name}`} entering={FadeIn} style={styles.exercise}>
              <Pressable
                onPress={() => setOpen({ dayIndex, index: j })}
                style={({ pressed }) => [styles.exerciseRow, pressed && styles.pressed]}>
                <ExerciseThumb uri={e.imageUri} size={44} />
                <View style={styles.exerciseText}>
                  <Row>
                    <Text variant="body" style={styles.flexShrink} numberOfLines={2}>
                      {e.name}
                    </Text>
                    {e.exerciseId === null && <Badge label={t`Нова`} />}
                  </Row>
                  <Text variant="muted">
                    {MUSCLE_GROUP_LABELS[e.muscleGroup]} · {formatTargets(e.targets)}
                  </Text>
                </View>
              </Pressable>
              {/* The whole height of the row, so the swap is easy to hit. */}
              <Pressable
                onPress={() => onReplace(dayIndex, j)}
                disabled={replacing.includes(`${dayIndex}-${j}`)}
                hitSlop={{ top: spacing.sm, bottom: spacing.sm, right: spacing.md }}
                style={({ pressed }) => [styles.replace, pressed && styles.replacePressed]}>
                {replacing.includes(`${dayIndex}-${j}`) ? (
                  <Spinner color={colors.accent} />
                ) : (
                  <Ionicons name="swap-horizontal" size={24} color={colors.accent} />
                )}
              </Pressable>
            </Animated.View>
          ))}
        </Card>
      ))}

      <Button
        title={t`Зберегти програму`}
        icon="checkmark-circle"
        loading={saving}
        onPress={onSave}
      />
      <Button
        title={t`Скласти інакше`}
        icon="refresh"
        variant="secondary"
        onPress={onRegenerate}
      />
      <Button title={t`Змінити відповіді`} variant="ghost" onPress={onEdit} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.7 },
  progress: { gap: spacing.sm },
  progressBar: { flexDirection: 'row', gap: spacing.xs },
  progressPart: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  progressPartDone: { backgroundColor: colors.accent },
  step: { gap: spacing.lg },
  stepHeader: { gap: spacing.xs },
  readyRow: { justifyContent: 'space-between' },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  optionCompact: { flex: 1, paddingHorizontal: spacing.xs, paddingVertical: spacing.lg },
  optionGrid: { flexBasis: '40%', flexGrow: 1, paddingRight: spacing.md },
  optionSelected: { backgroundColor: colors.accent },
  selectedText: { color: colors.accentText },
  selectedHint: { color: colors.onAccentMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  warning: { color: colors.warning },
  badges: { flexWrap: 'wrap' },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  exerciseRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exerciseText: { flex: 1, gap: 2 },
  // Same size with the spinner as with the icon, so the row doesn't shift.
  replace: {
    width: 52,
    alignSelf: 'stretch',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  replacePressed: { backgroundColor: colors.surface },
});
