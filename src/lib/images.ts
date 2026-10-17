import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { tr } from '@/lib/i18n';

const imagesDir = () => {
  const dir = new Directory(Paths.document, 'exercise-images');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
};

// The random part keeps names apart when several images are saved at once.
const newImageFile = (ext = 'jpg') =>
  new File(imagesDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [4, 3],
  quality: 0.7,
};

/** Copies a picked image into app storage so it survives gallery changes. Returns null if cancelled. */
async function persistPicked(result: ImagePicker.ImagePickerResult) {
  if (result.canceled || result.assets.length === 0) return null;
  const target = newImageFile();
  await new File(result.assets[0].uri).copy(target);
  return target.uri;
}

export async function pickImageFromLibrary() {
  return persistPicked(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
}

export async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new Error(tr('Немає доступу до камери', 'No access to the camera'));
  return persistPicked(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
}

/** Downloads an image once so it works offline. */
export async function downloadImage(url: string) {
  if (!/^https?:\/\//i.test(url.trim()))
    throw new Error(
      tr(
        'Посилання має починатися з http:// або https://',
        'The link must start with http:// or https://',
      ),
    );
  const file = await File.downloadFileAsync(url.trim(), newImageFile());
  return file.uri;
}

/** Removes an image only if it lives in our own storage. */
export function deleteStoredImage(uri: string | null | undefined) {
  if (!uri || !uri.startsWith(imagesDir().uri)) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}

/**
 * Takes or picks a photo to send to AI, not to keep: returns it as base64 with
 * its type, plus a local preview URI. Resolves to null if cancelled.
 */
export async function captureForAi(source: 'camera' | 'library') {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // A smaller upload is faster; the model doesn't need fine detail.
    quality: 0.5,
    base64: true,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(tr('Немає доступу до камери', 'No access to the camera'));
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' };
}
