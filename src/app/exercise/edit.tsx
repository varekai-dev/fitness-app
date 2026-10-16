import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useDialog } from '@/components/dialog';
import { Button, ChipGroup, Field, goBack, Loading, Row, Screen, Text } from '@/components/ui';
import {
  createExercise,
  exerciseHasHistory,
  getExercise,
  programsUsingExercise,
  updateExercise,
} from '@/db/exercises';
import { MUSCLE_GROUPS, TRACKING_TYPES, type MuscleGroup, type TrackingType } from '@/db/schema';
import { youtubeSearchUrl } from '@/lib/exercise-videos';
import { tr } from '@/lib/i18n';
import { deleteStoredImage, downloadImage, pickImageFromLibrary, takePhoto } from '@/lib/images';
import { MUSCLE_GROUP_LABELS, TRACKING_TYPE_LABELS } from '@/lib/labels';
import { radius } from '@/theme';
import { exerciseImageSource } from '@/lib/exercise-images';

export default function EditExerciseScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : null;

  const [loaded, setLoaded] = useState(id === null);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup | null>(null);
  const [trackingType, setTrackingType] = useState<TrackingType>('weight_reps');
  const [typeLocked, setTypeLocked] = useState(false);
  const [notes, setNotes] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [originalImageUri, setOriginalImageUri] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useDialog();

  useEffect(() => {
    if (id === null) return;
    (async () => {
      const [e, hasHistory, programs] = await Promise.all([
        getExercise(id),
        exerciseHasHistory(id),
        programsUsingExercise(id),
      ]);
      if (!e) return;
      setName(e.name);
      setMuscleGroup(e.muscleGroup);
      setTrackingType(e.trackingType);
      setTypeLocked(hasHistory || programs.length > 0);
      setNotes(e.notes ?? '');
      setYoutubeUrl(e.youtubeUrl ?? '');
      setImageUri(e.imageUri);
      setOriginalImageUri(e.imageUri);
      setLoaded(true);
    })();
  }, [id]);

  if (!loaded) return <Loading />;

  const replaceImage = (uri: string | null) => {
    // Drop images picked during this edit that were never saved.
    if (imageUri !== originalImageUri) deleteStoredImage(imageUri);
    setImageUri(uri);
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      dialog.show({
        title: tr('Помилка', 'Error'),
        message: (e as Error).message,
        icon: 'alert-circle',
      });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    withBusy(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error(tr('Вкажи назву', 'Enter a name'));
      if (!muscleGroup) throw new Error(tr('Обери групу м’язів', 'Choose a muscle group'));
      const yt = youtubeUrl.trim();
      if (yt && !/^https?:\/\//i.test(yt))
        throw new Error(
          tr(
            'YouTube-посилання має починатися з https://',
            'The YouTube link must start with https://',
          ),
        );
      const input = {
        name: trimmed,
        muscleGroup,
        trackingType,
        notes: notes.trim() || null,
        youtubeUrl: yt || null,
        imageUri,
      };
      if (id === null) await createExercise(input);
      else await updateExercise(id, input);
      if (originalImageUri !== imageUri) deleteStoredImage(originalImageUri);
      goBack();
    });

  return (
    <Screen
      mode="modal"
      title={
        id === null ? tr('Нова вправа', 'New exercise') : tr('Редагувати вправу', 'Edit exercise')
      }>
      <Field
        label={tr('Назва', 'Name')}
        value={name}
        onChangeText={setName}
        placeholder={tr('Наприклад, Dumbbell Curl', 'For example, Dumbbell Curl')}
      />

      <Text variant="caption">{tr('Група м’язів', 'Muscle group')}</Text>
      <ChipGroup
        options={MUSCLE_GROUPS}
        value={muscleGroup}
        onChange={setMuscleGroup}
        labels={MUSCLE_GROUP_LABELS}
      />

      <Text variant="caption">{tr('Що записуємо', 'What to track')}</Text>
      {typeLocked ? (
        <Text variant="muted">
          {TRACKING_TYPE_LABELS[trackingType]}
          {tr(
            ' — не можна змінити, бо вправа вже використовується в програмі чи історії.',
            ': can’t be changed because the exercise is already used in a program or the history.',
          )}
        </Text>
      ) : (
        <ChipGroup
          options={TRACKING_TYPES}
          value={trackingType}
          onChange={setTrackingType}
          labels={TRACKING_TYPE_LABELS}
        />
      )}

      <Text variant="caption">{tr('Фото', 'Photo')}</Text>
      {imageUri && (
        <Image source={exerciseImageSource(imageUri)} style={styles.image} contentFit="cover" />
      )}
      <Row>
        <Button
          title={tr('Галерея', 'Gallery')}
          icon="images"
          variant="secondary"
          style={styles.flex}
          disabled={busy}
          onPress={() =>
            withBusy(async () => {
              const uri = await pickImageFromLibrary();
              if (uri) replaceImage(uri);
            })
          }
        />
        <Button
          title={tr('Камера', 'Camera')}
          icon="camera"
          variant="secondary"
          style={styles.flex}
          disabled={busy}
          onPress={() =>
            withBusy(async () => {
              const uri = await takePhoto();
              if (uri) replaceImage(uri);
            })
          }
        />
      </Row>
      <Row>
        <Field
          containerStyle={styles.flex}
          value={imageUrlInput}
          onChangeText={setImageUrlInput}
          placeholder={tr('або URL картинки', 'or an image URL')}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button
          title={tr('Завантажити', 'Download')}
          small
          variant="secondary"
          disabled={busy || !imageUrlInput.trim()}
          onPress={() =>
            withBusy(async () => {
              replaceImage(await downloadImage(imageUrlInput));
              setImageUrlInput('');
            })
          }
        />
      </Row>
      {imageUri && (
        <Button
          title={tr('Прибрати фото', 'Remove photo')}
          variant="danger"
          onPress={() => replaceImage(null)}
        />
      )}

      <Field
        label="YouTube"
        value={youtubeUrl}
        onChangeText={setYoutubeUrl}
        placeholder="https://www.youtube.com/watch?v=…"
        autoCapitalize="none"
        keyboardType="url"
      />
      {!youtubeUrl && name.trim() !== '' && (
        <Button
          title={tr('Підставити пошук на YouTube', 'Use a YouTube search')}
          variant="ghost"
          onPress={() => setYoutubeUrl(youtubeSearchUrl(name.trim()))}
        />
      )}

      <Field
        label={tr('Нотатки', 'Notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder={tr('Техніка, налаштування тренажера…', 'Technique, machine settings…')}
      />

      <Button
        title={tr('Зберегти', 'Save')}
        trailingIcon="checkmark"
        onPress={save}
        loading={busy}
      />
      {dialog.element}
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  flex: { flex: 1 },
});
