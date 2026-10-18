import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PhotoPose } from '@/db/schema';
import { plural, tr } from '@/lib/i18n';

export const POSE_LABELS: Record<PhotoPose, string> = {
  front: tr('Спереду', 'Front'),
  side: tr('Збоку', 'Side'),
  back: tr('Ззаду', 'Back'),
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** A new photo is due this long after the last one. */
export const PHOTO_EVERY_DAYS = 7;
/** A weigh-in this close to a photo counts as the weight on it. */
const WEIGHT_MATCH_MS = 3 * DAY_MS;

export const photosDir = () => {
  const dir = new Directory(Paths.document, 'progress-photos');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
};

export const photoUri = (fileName: string) => new File(photosDir(), fileName).uri;

export function deletePhotoFile(fileName: string) {
  const file = new File(photosDir(), fileName);
  if (file.exists) file.delete();
}

// Android crops to a portrait frame, so photos line up in the comparison; iOS
// only offers a square crop, so there the full photo is kept and filled to fit.
// The camera shoots 3:4 already.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: Platform.OS === 'android',
  aspect: [3, 4],
  quality: 0.8,
};

/** "2024:05:01 10:00:00", as EXIF stores the shot time, in local time. */
function exifTime(exif: Record<string, unknown> | null | undefined) {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const at = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isFinite(at) && at <= Date.now() ? at : null;
}

/** Copies a photo into app storage and returns its file name there. */
export async function storeProgressPhoto(uri: string) {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await new File(uri).copy(new File(photosDir(), fileName));
  return fileName;
}

/**
 * Picks a photo from the gallery and copies it into app storage. It keeps the
 * date it was shot on, so older photos can be added too. Resolves to null if
 * cancelled. New photos are taken with `PoseCamera` instead.
 */
export async function pickProgressPhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({ ...PICKER_OPTIONS, exif: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const fileName = await storeProgressPhoto(asset.uri);
  return { fileName, takenAt: exifTime(asset.exif) || Date.now() };
}

/** The weigh-in closest to `at`, if one is within a few days of it. */
export function weightNear<T extends { measuredAt: number }>(weights: T[], at: number) {
  let best: T | undefined;
  for (const w of weights) {
    const gap = Math.abs(w.measuredAt - at);
    if (gap <= WEIGHT_MATCH_MS && (!best || gap < Math.abs(best.measuredAt - at))) best = w;
  }
  return best;
}

/** Time between two photos: "той самий день", "5 днів", "3 тижні", "4 місяці". */
export function formatSpan(ms: number) {
  const days = Math.round(Math.abs(ms) / DAY_MS);
  if (days === 0) return tr('той самий день', 'the same day');
  if (days < 14) return `${days} ${plural(days, ['день', 'дні', 'днів'], ['day', 'days'])}`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} ${plural(weeks, ['тиждень', 'тижні', 'тижнів'], ['week', 'weeks'])}`;
  }
  const months = Math.round(days / 30.44);
  return `${months} ${plural(months, ['місяць', 'місяці', 'місяців'], ['month', 'months'])}`;
}
