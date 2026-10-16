import type { DialogOptions } from '@/components/dialog';
import { removeExercise } from '@/db/exercises';
import { removeProgram } from '@/db/programs';
import { tr } from '@/lib/i18n';
import { deleteStoredImage } from '@/lib/images';

type Show = (options: DialogOptions) => void;

/**
 * Confirms and removes a program. `onKept` runs when it stays, i.e. the user
 * cancelled or a workout of it is still in progress.
 */
export function confirmRemoveProgram(
  show: Show,
  id: number,
  { onRemoved, onKept }: { onRemoved?: () => void; onKept?: () => void } = {},
) {
  show({
    title: tr('Видалити програму?', 'Delete program?'),
    message: tr(
      'Якщо за нею вже були тренування, програма піде в архів, а історія залишиться.',
      'If it already has workouts, the program is archived and the history stays.',
    ),
    buttons: [
      { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: onKept },
      {
        text: tr('Видалити', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await removeProgram(id);
          if (result === 'workout_in_progress') {
            onKept?.();
            show({
              title: tr('Неможливо', 'Not possible'),
              message: tr(
                'Спершу заверши або скасуй поточне тренування за цією програмою.',
                'First finish or discard the current workout from this program.',
              ),
              icon: 'alert-circle',
            });
            return;
          }
          onRemoved?.();
        },
      },
    ],
  });
}

/** Confirms and removes an exercise; `onKept` as for programs. */
export function confirmRemoveExercise(
  show: Show,
  exercise: { id: number; name: string; imageUri: string | null },
  { onRemoved, onKept }: { onRemoved?: () => void; onKept?: () => void } = {},
) {
  show({
    title: tr('Видалити вправу?', 'Delete exercise?'),
    message: exercise.name,
    buttons: [
      { text: tr('Скасувати', 'Cancel'), style: 'cancel', onPress: onKept },
      {
        text: tr('Видалити', 'Delete'),
        style: 'destructive',
        onPress: async () => {
          const result = await removeExercise(exercise.id);
          if (typeof result === 'object') {
            onKept?.();
            show({
              title: tr('Вправа використовується', 'Exercise in use'),
              message: tr(
                `Спершу прибери її з програм: ${result.blockedBy.join(', ')}.`,
                `First remove it from these programs: ${result.blockedBy.join(', ')}.`,
              ),
              icon: 'alert-circle',
            });
            return;
          }
          if (result === 'deleted') deleteStoredImage(exercise.imageUri);
          onRemoved?.();
        },
      },
    ],
  });
}
