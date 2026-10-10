import type { DialogOptions } from '@/components/dialog';
import { removeExercise } from '@/db/exercises';
import { removeProgram } from '@/db/programs';
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
    title: 'Видалити програму?',
    message: 'Якщо за нею вже були тренування, програма піде в архів, а історія залишиться.',
    buttons: [
      { text: 'Скасувати', style: 'cancel', onPress: onKept },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const result = await removeProgram(id);
          if (result === 'workout_in_progress') {
            onKept?.();
            show({
              title: 'Неможливо',
              message: 'Спершу заверши або скасуй поточне тренування за цією програмою.',
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
    title: 'Видалити вправу?',
    message: exercise.name,
    buttons: [
      { text: 'Скасувати', style: 'cancel', onPress: onKept },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: async () => {
          const result = await removeExercise(exercise.id);
          if (typeof result === 'object') {
            onKept?.();
            show({
              title: 'Вправа використовується',
              message: `Спершу прибери її з програм: ${result.blockedBy.join(', ')}.`,
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
