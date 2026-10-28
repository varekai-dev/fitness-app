import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { sqlite } from '@/db/client';
import { tr } from '@/lib/i18n';
import { imagesDir } from '@/lib/images';
import { photosDir } from '@/lib/progress-photos';
import journal from '../../drizzle/meta/_journal.json';

/**
 * A backup is a copy of the whole SQLite database made with SQLite's online
 * backup API, so it is consistent while the app keeps its connection open and
 * keeps `__drizzle_migrations` and `user_version`: after a restore the usual
 * startup migrations and content seeds bring an older backup up to date.
 * Two extra tables travel in the file and are dropped on restore:
 * `backup_info` (marks the file as ours) and `backup_files` (progress photos
 * under their file name, the user's exercise images under `exercise-images/`).
 * Secrets such as the Groq key live in SecureStore, not in the database.
 */
const FORMAT = 'fitness-backup';
const INFO_TABLE = 'backup_info';
const FILES_TABLE = 'backup_files';
const IMPORT_NAME = 'import.db';
/** Prefix of exercise images in `backup_files`; progress photos have none. */
const IMAGE_PREFIX = 'exercise-images/';
/** Matches `exercises.image_uri` of a user's image in app storage, on any device. */
const STORED_IMAGE = `%/${IMAGE_PREFIX}%`;

/** File name of a stored exercise image, from its URI. */
const imageName = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

/** Newest migration this build knows; a backup migrated past it came from a newer app. */
const LATEST_MIGRATION = Math.max(...journal.entries.map((e) => e.when));

export type BackupSummary = {
  exportedAt: number;
  appVersion: string;
  workouts: number;
  foodEntries: number;
  bodyWeights: number;
  photos: number;
  exerciseImages: number;
};

/** A picked backup, checked and ready to restore. */
export type PendingBackup = { db: SQLiteDatabase; summary: BackupSummary };

export class BackupError extends Error {}

/**
 * Fresh scratch folder in the cache for the backup files. expo-sqlite takes its
 * `uri` as is: it parses the directory as a URI, and a decoded path breaks on
 * folders with escaped characters, such as Expo Go's per-project folder.
 */
function workDir(name = 'backup') {
  const dir = new Directory(Paths.cache, name);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
}

const count = async (db: SQLiteDatabase, from: string) =>
  (await db.getFirstAsync<{ n: number }>(`SELECT count(*) AS n FROM ${from}`))?.n ?? 0;

/**
 * Writes all data, progress photos and exercise images included, to a backup file and opens the
 * share sheet to save it, e.g. to Google Drive or Telegram.
 */
export async function exportBackup() {
  const file = await createBackupFile();
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/octet-stream',
    UTI: 'public.database',
    dialogTitle: tr('Зберегти резервну копію', 'Save the backup'),
  });
}

/**
 * Writes all data to a new backup file in its own scratch folder, `dirName`, so
 * the daily upload doesn't wipe the files of an export or restore in progress.
 */
export async function createBackupFile(dirName?: string) {
  const dir = workDir(dirName);
  const now = new Date();
  // Local date, so a backup made after midnight isn't named after the day before.
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const name = `fitness-backup-${date}.db`;
  const copy = await openDatabaseAsync(name, { useNewConnection: true }, dir.uri);
  try {
    await backupDatabaseAsync({ sourceDatabase: sqlite, destDatabase: copy });
    await copy.execAsync(
      `CREATE TABLE ${INFO_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL);
       CREATE TABLE ${FILES_TABLE} (name TEXT PRIMARY KEY, data BLOB NOT NULL);`,
    );
    const info: Record<string, string> = {
      format: FORMAT,
      exportedAt: String(Date.now()),
      appVersion: Constants.expoConfig?.version ?? '',
    };
    for (const [key, value] of Object.entries(info)) {
      await copy.runAsync(`INSERT INTO ${INFO_TABLE} (key, value) VALUES (?, ?)`, key, value);
    }
    const photos = await copy.getAllAsync<{ file_name: string }>(
      'SELECT file_name FROM progress_photos',
    );
    const images = await copy.getAllAsync<{ image_uri: string }>(
      'SELECT DISTINCT image_uri FROM exercises WHERE image_uri LIKE ?',
      STORED_IMAGE,
    );
    const files = [
      ...photos.map((p) => ({ name: p.file_name, file: new File(photosDir(), p.file_name) })),
      ...images.map((i) => {
        const name = imageName(i.image_uri);
        return { name: IMAGE_PREFIX + name, file: new File(imagesDir(), name) };
      }),
    ];
    // One file at a time, so memory holds a single photo however many there are.
    for (const { name, file } of files) {
      if (!file.exists) continue;
      await copy.runAsync(
        `INSERT OR REPLACE INTO ${FILES_TABLE} (name, data) VALUES (?, ?)`,
        name,
        await file.bytes(),
      );
    }
  } finally {
    await copy.closeAsync();
  }
  return new File(dir, name);
}

/** Lets the user pick a backup file and checks it. Null if cancelled. */
export async function pickBackup(): Promise<PendingBackup | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    // On Android the picker's own cache copy lies outside the folder Expo Go lets
    // a project read, so the file is copied here from its content:// URI instead.
    copyToCacheDirectory: Platform.OS !== 'android',
  });
  if (result.canceled || result.assets.length === 0) return null;
  const picked = new File(result.assets[0].uri);
  return openBackup(async (target) => picked.copy(target));
}

/** Checks a backup that `write` puts in a fresh scratch file, e.g. by copying or downloading it. */
export async function openBackup(write: (target: File) => Promise<unknown>) {
  const dir = workDir();
  await write(new File(dir, IMPORT_NAME));
  const db = await openDatabaseAsync(IMPORT_NAME, { useNewConnection: true }, dir.uri);
  try {
    return { db, summary: await readSummary(db) };
  } catch (e) {
    await db.closeAsync();
    throw e;
  }
}

async function readSummary(db: SQLiteDatabase): Promise<BackupSummary> {
  let info: Record<string, string>;
  try {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM ${INFO_TABLE}`,
    );
    info = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    // Not an SQLite file at all, or one without our table.
    info = {};
  }
  if (info.format !== FORMAT) {
    throw new BackupError(
      tr('Це не файл резервної копії цього застосунку.', 'This isn’t a backup file from this app.'),
    );
  }
  const migrated = await db.getFirstAsync<{ at: number | null }>(
    'SELECT max(created_at) AS at FROM __drizzle_migrations',
  );
  if ((migrated?.at ?? 0) > LATEST_MIGRATION) {
    throw new BackupError(
      tr(
        'Копію створено в новішій версії застосунку. Онови застосунок і спробуй ще раз.',
        'The backup was made in a newer version of the app. Update the app and try again.',
      ),
    );
  }
  return {
    exportedAt: Number(info.exportedAt),
    appVersion: info.appVersion ?? '',
    workouts: await count(db, 'workouts WHERE finished_at IS NOT NULL'),
    foodEntries: await count(db, 'food_entries'),
    bodyWeights: await count(db, 'body_weights'),
    photos: await count(db, `${FILES_TABLE} WHERE name NOT LIKE '${IMAGE_PREFIX}%'`),
    exerciseImages: await count(db, `${FILES_TABLE} WHERE name LIKE '${IMAGE_PREFIX}%'`),
  };
}

/**
 * Replaces all data with the backup. The online backup API overwrites the open
 * database in one write transaction, so the connection stays valid; the app
 * must reload right after, to run migrations and re-read cached settings.
 */
export async function restoreBackup({ db }: PendingBackup) {
  try {
    const files = await db.getAllAsync<{ name: string }>(`SELECT name FROM ${FILES_TABLE}`);
    for (const { name } of files) {
      const row = await db.getFirstAsync<{ data: Uint8Array }>(
        `SELECT data FROM ${FILES_TABLE} WHERE name = ?`,
        name,
      );
      if (!row) continue;
      const file = name.startsWith(IMAGE_PREFIX)
        ? new File(imagesDir(), name.slice(IMAGE_PREFIX.length))
        : new File(photosDir(), name);
      file.write(row.data);
    }
    await db.execAsync(`DROP TABLE ${FILES_TABLE}; DROP TABLE ${INFO_TABLE}; VACUUM;`);
    await backupDatabaseAsync({ sourceDatabase: db, destDatabase: sqlite });
  } finally {
    await db.closeAsync();
    // Also after a failure: removes files written for a restore that didn't happen.
    cleanUpPhotos();
    cleanUpExerciseImages();
    workDir();
  }
}

export const discardBackup = ({ db }: PendingBackup) => db.closeAsync().then(() => workDir());

/** Drops photos the restored data no longer has, and rows whose file is missing. */
function cleanUpPhotos() {
  const rows = sqlite.getAllSync<{ id: number; file_name: string }>(
    'SELECT id, file_name FROM progress_photos',
  );
  const kept = new Set<string>();
  for (const row of rows) {
    if (new File(photosDir(), row.file_name).exists) kept.add(row.file_name);
    else sqlite.runSync('DELETE FROM progress_photos WHERE id = ?', row.id);
  }
  for (const entry of photosDir().list()) {
    if (entry instanceof File && !kept.has(entry.name)) entry.delete();
  }
}

/**
 * Points exercise images at this device's storage, since the backup keeps the
 * other device's absolute URIs, clears those whose file is missing and drops
 * files no exercise uses.
 */
function cleanUpExerciseImages() {
  const rows = sqlite.getAllSync<{ id: number; image_uri: string }>(
    'SELECT id, image_uri FROM exercises WHERE image_uri LIKE ?',
    STORED_IMAGE,
  );
  const kept = new Set<string>();
  for (const row of rows) {
    const file = new File(imagesDir(), imageName(row.image_uri));
    if (file.exists) {
      kept.add(file.name);
      if (file.uri !== row.image_uri) {
        sqlite.runSync('UPDATE exercises SET image_uri = ? WHERE id = ?', file.uri, row.id);
      }
    } else {
      sqlite.runSync('UPDATE exercises SET image_uri = NULL WHERE id = ?', row.id);
    }
  }
  for (const entry of imagesDir().list()) {
    if (entry instanceof File && !kept.has(entry.name)) entry.delete();
  }
}
