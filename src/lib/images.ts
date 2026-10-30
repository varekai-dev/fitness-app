import { t } from '@lingui/core/macro';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';


export const imagesDir = () => {
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
    throw new Error(t`Немає доступу до камери`);
  return persistPicked(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
}

/** Downloads an image once so it works offline. */
export async function downloadImage(url: string) {
  if (!/^https?:\/\//i.test(url.trim()))
    throw new Error(
      t`Посилання має починатися з http:// або https://`,
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

// The longest side of a photo sent to AI; the model doesn't need fine detail.
const AI_IMAGE_SIDE = 1280;

/**
 * Takes or picks a photo to send to AI, not to keep: returns its local URI and
 * size, or null if cancelled. The picker hands the original over as is, since
 * compressing there decodes the whole photo before the promise resolves and
 * holds the screen behind for a second or two; `readForAi` shrinks it instead,
 * so a screen can show the photo the moment the picker closes.
 */
export async function captureForAi(source: 'camera' | 'library') {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(t`Немає доступу до камери`);
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/** The photo from `captureForAi` shrunk to a smaller, faster upload, as base64 JPEG. */
export async function readForAi(image: { uri: string; width: number; height: number }) {
  const context = ImageManipulator.manipulate(image.uri);
  if (Math.max(image.width, image.height) > AI_IMAGE_SIDE) {
    context.resize(
      image.width >= image.height
        ? { width: AI_IMAGE_SIDE, height: null }
        : { width: null, height: AI_IMAGE_SIDE },
    );
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  new File(saved.uri).delete();
  return { base64: saved.base64!, mimeType: 'image/jpeg' };
}
