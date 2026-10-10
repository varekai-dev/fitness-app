import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

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
      Alert.alert('Помилка', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    withBusy(async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Вкажи назву');
      if (!muscleGroup) throw new Error('Обери групу м’язів');
      const yt = youtubeUrl.trim();
      if (yt && !/^https?:\/\//i.test(yt))
        throw new Error('YouTube-посилання має починатися з https://');
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
    <Screen mode="modal" title={id === null ? 'Нова вправа' : 'Редагувати вправу'}>
      <Field
        label="Назва"
        value={name}
        onChangeText={setName}
        placeholder="Наприклад, Dumbbell Curl"
      />

      <Text variant="caption">Група м’язів</Text>
      <ChipGroup
        options={MUSCLE_GROUPS}
        value={muscleGroup}
        onChange={setMuscleGroup}
        labels={MUSCLE_GROUP_LABELS}
      />

      <Text variant="caption">Що записуємо</Text>
      {typeLocked ? (
        <Text variant="muted">
          {TRACKING_TYPE_LABELS[trackingType]} — не можна змінити, бо вправа вже використовується в
          програмі чи історії.
        </Text>
      ) : (
        <ChipGroup
          options={TRACKING_TYPES}
          value={trackingType}
          onChange={setTrackingType}
          labels={TRACKING_TYPE_LABELS}
        />
      )}

      <Text variant="caption">Фото</Text>
      {imageUri && (
        <Image source={exerciseImageSource(imageUri)} style={styles.image} contentFit="cover" />
      )}
      <Row>
        <Button
          title="Галерея"
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
          title="Камера"
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
          placeholder="або URL картинки"
          autoCapitalize="none"
          keyboardType="url"
        />
        <Button
          title="Завантажити"
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
        <Button title="Прибрати фото" variant="danger" onPress={() => replaceImage(null)} />
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
          title="Підставити пошук на YouTube"
          variant="ghost"
          onPress={() => setYoutubeUrl(youtubeSearchUrl(name.trim()))}
        />
      )}

      <Field
        label="Нотатки"
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Техніка, налаштування тренажера…"
      />

      <Button title="Зберегти" trailingIcon="checkmark" onPress={save} loading={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  flex: { flex: 1 },
});
