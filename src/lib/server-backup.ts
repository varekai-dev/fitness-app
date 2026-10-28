import Constants from 'expo-constants';
import { fetch } from 'expo/fetch';
import { Directory, File, Paths, UploadType } from 'expo-file-system';

import { API_URL, sessionToken } from '@/lib/account';
import { readSettingSync, writeSettingSync } from '@/lib/app-settings';
import { createBackupFile, openBackup } from '@/lib/backup';
import { tr } from '@/lib/i18n';

/**
 * Backups in the signed-in user's account on the server (`server/`, an R2
 * bucket). The app uploads one a day when it's opened; the server keeps a copy
 * per day and drops all but the newest week.
 */
export type ServerBackup = { id: string; size: number; uploadedAt: number; appVersion: string };

const LAST_UPLOAD_KEY = 'server_backup_at';
const DAY = 24 * 60 * 60 * 1000;
/** Its own scratch folder, so an upload never wipes a manual export or restore in progress. */
const UPLOAD_DIR = 'server-backup';

export class ServerBackupError extends Error {}

async function authHeaders() {
  const token = await sessionToken();
  if (!token) {
    throw new ServerBackupError(
      tr(
        'Увійди в акаунт, щоб зберігати копії на сервері.',
        'Sign in to keep backups on the server.',
      ),
    );
  }
  return { authorization: `Bearer ${token}` };
}

const networkError = () =>
  new ServerBackupError(
    tr(
      'Немає з’єднання з сервером. Перевір інтернет.',
      'Can’t reach the server. Check your connection.',
    ),
  );

/** When this phone last uploaded a backup, 0 if never. */
export const lastUploadAt = () => Number(readSettingSync(LAST_UPLOAD_KEY) ?? 0);

let uploading: Promise<void> | null = null;

/** Uploads a backup of all data now. Joins an upload that's already running. */
export function uploadBackup() {
  uploading ??= upload().finally(() => (uploading = null));
  return uploading;
}

async function upload() {
  const headers = await authHeaders();
  const file = await createBackupFile(UPLOAD_DIR);
  try {
    let status: number;
    try {
      // Streams the file from disk; expo/fetch fails on a File body without a MIME type.
      ({ status } = await file.upload(`${API_URL}/backups`, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        mimeType: 'application/octet-stream',
        headers: { ...headers, 'x-app-version': Constants.expoConfig?.version ?? '' },
      }));
    } catch {
      throw networkError();
    }
    if (status < 200 || status >= 300) {
      throw new ServerBackupError(
        status === 413
          ? tr('Копія завелика для сервера.', 'The backup is too large for the server.')
          : tr(
              'Сервер не прийняв копію. Спробуй пізніше.',
              'The server didn’t accept the backup. Try later.',
            ),
      );
    }
    writeSettingSync(LAST_UPLOAD_KEY, String(Date.now()));
  } finally {
    const dir = new Directory(Paths.cache, UPLOAD_DIR);
    if (dir.exists) dir.delete();
  }
}

/** Uploads a backup if the last one from this phone is a day old, quietly skipping when signed out. */
export async function uploadBackupIfDue() {
  if (Date.now() - lastUploadAt() < DAY || !(await sessionToken())) return;
  await uploadBackup();
}

/** The account's backups on the server, newest first. */
export async function listServerBackups(): Promise<ServerBackup[]> {
  const headers = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/backups`, { headers });
  } catch {
    throw networkError();
  }
  if (!res.ok) {
    throw new ServerBackupError(
      tr('Не вдалося отримати список копій.', 'Couldn’t load the list of backups.'),
    );
  }
  return ((await res.json()) as { backups: ServerBackup[] }).backups;
}

/** Downloads a backup from the server and checks it, ready to restore. */
export async function downloadServerBackup(id: string) {
  const headers = await authHeaders();
  return openBackup(async (target: File) => {
    try {
      await File.downloadFileAsync(`${API_URL}/backups/${id}`, target, { headers });
    } catch {
      throw networkError();
    }
  });
}
