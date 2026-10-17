import { asc, eq } from 'drizzle-orm';

import { deletePhotoFile } from '@/lib/progress-photos';
import { db } from './client';
import { progressPhotos, type PhotoPose } from './schema';

export type ProgressPhoto = typeof progressPhotos.$inferSelect;

/** Oldest first, like the weight log. */
export const listProgressPhotos = () =>
  db.query.progressPhotos.findMany({ orderBy: [asc(progressPhotos.takenAt)] });

export async function addProgressPhoto(photo: {
  takenAt: number;
  pose: PhotoPose;
  fileName: string;
}) {
  await db.insert(progressPhotos).values(photo);
}

/** Removes the photo and its file. */
export async function deleteProgressPhoto(photo: Pick<ProgressPhoto, 'id' | 'fileName'>) {
  await db.delete(progressPhotos).where(eq(progressPhotos.id, photo.id));
  deletePhotoFile(photo.fileName);
}
