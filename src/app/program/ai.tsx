import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDialog } from '@/components/dialog';
import { ProgramAiLoader, type LoaderStage } from '@/components/program-ai-loader';
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
import { useDbQuery } from '@/hooks/use-db-query';
import { GROQ_ATTEMPTS, GroqError } from '@/lib/groq';
import { plural, tr } from '@/lib/i18n';
import { formatTargets, MUSCLE_GROUP_LABELS } from '@/lib/labels';
import { formatNumber, formatWeight } from '@/lib/metrics';
import { ACTIVITY, ageOn, SEX_LABELS, WEIGHT_GOAL, type Profile } from '@/lib/profile';
import {
  askProgramPlan,
  EMPTY_ANSWERS,
  PROGRAM_QUESTIONS,
  WISH_SUGGESTIONS,
  type ProgramAnswers,
  type ProgramPlan,
  type ProgramQuestion,
} from '@/lib/program-ai';
import { cmToDisplay, HEIGHT_UNIT, WEIGHT_UNIT } from '@/lib/units';
import { colors, radius, spacing } from '@/theme';

/** The questions, then a last step with free-text wishes. */
const STEPS = PROGRAM_QUESTIONS.length + 1;

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
  const dialog = useDialog();

  if (!profileData || !library) return <Loading />;

  const generate = async () => {
    if (generating) return;
    setAttempt(1);
    setGenerating(true);
    try {
      const next = await askProgramPlan({
        answers,
        wishes,
        profile: profileData.profile,
        weightKg: profileData.latestWeight?.weightKg,
        library,
        onAttempt: setAttempt,
      });
      setReadyPlan(next);
    } catch (e) {
      setGenerating(false);
      const noKey = e instanceof GroqError && (e.kind === 'no-key' || e.kind === 'auth');
      dialog.show({
        title: tr('Не вдалося скласти програму', 'Couldn’t build the program'),
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
    }
  };

  const showPlan = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPlan(readyPlan);
    setReadyPlan(null);
    setGenerating(false);
  };

  const save = () => {
    if (!plan) return;
    let id: number;
    try {
      id = saveProgramPlan(plan, intoProgramId);
    } catch (e) {
      dialog.show({
        title: tr('Не вдалося зберегти', 'Couldn’t save'),
        message: (e as Error).message,
        icon: 'alert-circle',
      });
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (intoProgramId !== undefined) goBack();
    else router.replace({ pathname: '/program/[id]', params: { id } });
  };

  const question = PROGRAM_QUESTIONS[step];

  return (
    <Screen title={tr('Програма з AI', 'AI program')} mode="modal">
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
          onSave={save}
          onRegenerate={generate}
          onEdit={() => setPlan(null)}
        />
      ) : (
        <>
          <Progress step={step} />
          {question ? (
            <QuestionStep
              key={question.key}
              question={question}
              value={answers[question.key]}
              onChange={(value) => {
                setAnswers({ ...answers, [question.key]: value });
                // One answer is all a single-choice question needs.
                if (!question.multi) setStep(step + 1);
              }}
            />
          ) : (
            <WishesStep
              wishes={wishes}
              onChange={setWishes}
              profile={profileData.profile}
              weightKg={profileData.latestWeight?.weightKg}
            />
          )}
          <Row>
            {step > 0 && (
              <Button
                title={tr('Назад', 'Back')}
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
                      ? tr('Пропустити', 'Skip')
                      : tr('Далі', 'Next')
                  }
                  trailingIcon="chevron-forward"
                  onPress={() => setStep(step + 1)}
                  disabled={!question.optional && answers[question.key].length === 0}
                  style={styles.flex}
                />
              )
            ) : (
              <Button
                title={tr('Скласти', 'Build')}
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
      `${ageOn(profile.birthDate)} ${plural(ageOn(profile.birthDate), ['рік', 'роки', 'років'], ['year', 'years'])}`,
    profile.heightCm && `${formatNumber(cmToDisplay(profile.heightCm), 0)} ${HEIGHT_UNIT}`,
    weightKg && `${formatWeight(weightKg, 1)} ${WEIGHT_UNIT}`,
    `${tr('активність', 'activity')}: ${ACTIVITY[profile.activity].label.toLowerCase()}`,
    WEIGHT_GOAL[profile.goal].label.toLowerCase(),
  ].filter(Boolean) as string[];
}

/** Labels of the picked answers to a question, joined. */
function picked(answers: ProgramAnswers, key: ProgramQuestion['key']) {
  const question = PROGRAM_QUESTIONS.find((q) => q.key === key);
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
  return [
    { title: tr('Аналізую профіль', 'Reading your profile'), detail: facts.join(' · ') },
    {
      title: tr('Враховую мету й побажання', 'Weighing your goal and wishes'),
      detail: [picked(answers, 'goal'), wishes.trim()].filter(Boolean).join(' · '),
    },
    {
      title: `${tr('Розподіляю', 'Spreading')} ${days} ${plural(days, ['тренування', 'тренування', 'тренувань'], ['workout', 'workouts'])} ${tr('на тиждень', 'over the week')}`,
      detail: [picked(answers, 'duration'), picked(answers, 'focus')].filter(Boolean).join(' · '),
    },
    {
      title: tr('Підбираю вправи', 'Picking exercises'),
      detail: tr(
        `${libraryCount} у бібліотеці · ${picked(answers, 'equipment')}`,
        `${libraryCount} in the library · ${picked(answers, 'equipment')}`,
      ),
    },
    {
      title: tr('Розраховую підходи й відпочинок', 'Setting sets and rest'),
      detail: picked(answers, 'level'),
    },
    {
      title: tr('Перевіряю план', 'Checking the plan'),
      detail: picked(answers, 'limits') || undefined,
    },
  ];
}

function Progress({ step }: { step: number }) {
  return (
    <View style={styles.progress}>
      <Text variant="overline">
        {/* "з" in capitals reads like a 3, so a slash instead. */}
        {tr('Крок', 'Step')} {step + 1}/{STEPS}
      </Text>
      <View style={styles.progressBar}>
        {Array.from({ length: STEPS }, (_, i) => (
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
    Haptics.selectionAsync();
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
  wishes,
  onChange,
  profile,
  weightKg,
}: {
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
        <Text variant="title">{tr('Твої побажання', 'Your wishes')}</Text>
        <Text variant="secondary">
          {tr(
            'Напиши своїми словами, що хочеш від тренувань. Можна пропустити.',
            'Tell in your own words what you want from training. You can skip it.',
          )}
        </Text>
      </View>
      <Field
        value={wishes}
        onChangeText={onChange}
        placeholder={tr(
          'Напр. «тримати себе в тонусі» або «уклон на силові»',
          'E.g. “stay in shape” or “lean towards strength”',
        )}
        multiline
      />
      <View style={styles.chips}>
        {WISH_SUGGESTIONS.map((w) => (
          <Chip key={w} label={`+ ${w}`} selected={false} onPress={() => append(w)} />
        ))}
      </View>
      <Card onPress={() => router.push('/profile')} style={styles.profile}>
        <Ionicons name="person-circle-outline" size={28} color={colors.accent} />
        <View style={styles.flex}>
          <Text variant="body">{tr('AI врахує профіль', 'AI uses your profile')}</Text>
          <Text variant="muted">{facts.join(' · ')}</Text>
          {incomplete && (
            <Text variant="muted" style={styles.warning}>
              {tr(
                'Заповни профіль, щоб програма була точнішою',
                'Fill in your profile for a better fit',
              )}
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
  onSave,
  onRegenerate,
  onEdit,
}: {
  plan: ProgramPlan;
  onSave: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
}) {
  const total = plan.days.reduce((n, d) => n + d.exercises.length, 0);
  const newCount = new Set(
    plan.days.flatMap((d) => d.exercises.filter((e) => e.exerciseId === null).map((e) => e.name)),
  ).size;

  return (
    <>
      <View style={styles.stepHeader}>
        <Text variant="overline">{tr('Програма готова', 'Your program')}</Text>
        <Text variant="title">{plan.name}</Text>
        {plan.summary !== '' && <Text variant="secondary">{plan.summary}</Text>}
      </View>
      <Row style={styles.badges}>
        <Badge
          label={`${plan.days.length} ${tr('дн.', plan.days.length === 1 ? 'day' : 'days')}`}
          tone="muted"
        />
        <Badge
          label={`${total} ${plural(total, ['вправа', 'вправи', 'вправ'], ['exercise', 'exercises'])}`}
          tone="muted"
        />
        {newCount > 0 && (
          <Badge
            label={`${newCount} ${plural(newCount, ['нова', 'нові', 'нових'], ['new', 'new'])}`}
          />
        )}
      </Row>
      {newCount > 0 && (
        <Text variant="muted">
          {tr(
            'Нових вправ ще немає в бібліотеці — вони додадуться туди з описом техніки й відео.',
            'New exercises aren’t in your library yet; they’ll be added with technique notes and a video.',
          )}
        </Text>
      )}

      {plan.days.map((day, i) => (
        <Card key={i}>
          <Row>
            <IndexMarker n={i + 1} />
            <Text variant="heading" style={styles.flex}>
              {day.name}
            </Text>
          </Row>
          {day.exercises.map((e, j) => (
            <View key={j} style={styles.exercise}>
              <Row>
                <Text variant="body" style={styles.flexShrink} numberOfLines={2}>
                  {e.name}
                </Text>
                {e.exerciseId === null && <Badge label={tr('Нова', 'New')} />}
              </Row>
              <Text variant="muted">
                {MUSCLE_GROUP_LABELS[e.muscleGroup]} · {formatTargets(e.targets)}
              </Text>
            </View>
          ))}
        </Card>
      ))}

      <Button
        title={tr('Зберегти програму', 'Save program')}
        icon="checkmark-circle"
        onPress={onSave}
      />
      <Button
        title={tr('Скласти інакше', 'Try another')}
        icon="refresh"
        variant="secondary"
        onPress={onRegenerate}
      />
      <Button title={tr('Змінити відповіді', 'Change answers')} variant="ghost" onPress={onEdit} />
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
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
