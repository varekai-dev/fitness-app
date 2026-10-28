import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { lang, tr } from '@/lib/i18n';

/** The Cloudflare Worker in `server/`. EXPO_PUBLIC_API_URL points at `wrangler dev` instead. */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://fitness-api.serhijsav.workers.dev';

const SESSION_KEY = 'account_session';

export const MIN_PASSWORD = 8;

export type User = { id: string; email: string; createdAt: number };
type Session = { token: string; user: User };

const ERROR_CODES = [
  'invalid_email',
  'weak_password',
  'email_taken',
  'wrong_credentials',
  'invalid_code',
  'too_many_attempts',
  'network',
] as const;
type ErrorCode = (typeof ERROR_CODES)[number] | 'unknown';

export class AccountError extends Error {
  constructor(readonly code: ErrorCode) {
    super(accountErrorMessage(code));
  }
}

function accountErrorMessage(code: ErrorCode) {
  switch (code) {
    case 'invalid_email':
      return tr('Перевір адресу пошти.', 'Check the email address.');
    case 'weak_password':
      return tr(
        `Пароль має бути щонайменше ${MIN_PASSWORD} символів.`,
        `The password needs at least ${MIN_PASSWORD} characters.`,
      );
    case 'email_taken':
      return tr(
        'Акаунт із цією поштою вже є. Увійди або віднови пароль.',
        'There’s already an account with this email. Sign in or reset the password.',
      );
    case 'wrong_credentials':
      return tr('Неправильна пошта або пароль.', 'Wrong email or password.');
    case 'invalid_code':
      return tr(
        'Код неправильний або застарів. Запроси новий.',
        'The code is wrong or expired. Request a new one.',
      );
    case 'too_many_attempts':
      return tr('Забагато спроб. Запроси новий код.', 'Too many attempts. Request a new code.');
    case 'network':
      return tr(
        'Немає з’єднання з сервером. Перевір інтернет.',
        'Can’t reach the server. Check your connection.',
      );
    default:
      return tr('Щось пішло не так. Спробуй ще раз.', 'Something went wrong. Try again.');
  }
}

async function request<T>(
  path: string,
  init: { body?: object; token?: string; method?: 'DELETE' } = {},
) {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body || path === '/auth/logout' ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        ...(init.token && { authorization: `Bearer ${init.token}` }),
      },
      body: init.body && JSON.stringify(init.body),
    });
  } catch {
    throw new AccountError('network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error;
    if (res.status === 401 && code === 'unauthorized') throw new UnauthorizedError();
    throw new AccountError(ERROR_CODES.includes(code) ? code : 'unknown');
  }
  return data as T;
}

class UnauthorizedError extends Error {}

// undefined until the stored session is read, null when signed out.
let session: Session | null | undefined;
const listeners = new Set<() => void>();

function setSession(next: Session | null) {
  session = next;
  listeners.forEach((l) => l());
  return next
    ? SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next))
    : SecureStore.deleteItemAsync(SESSION_KEY);
}

let loading: Promise<void> | null = null;

/** Reads the saved session, then checks it with the server in the background. */
function load() {
  loading ??= SecureStore.getItemAsync(SESSION_KEY)
    .then((raw) => (raw ? (JSON.parse(raw) as Session) : null))
    .catch(() => null)
    .then((saved) => {
      session = saved;
      listeners.forEach((l) => l());
      if (saved) refresh(saved);
    });
  return loading;
}

/** Signs out when the server no longer knows the session, e.g. after a reset on another phone. */
async function refresh(saved: Session) {
  try {
    const { user } = await request<{ user: User }>('/auth/me', { token: saved.token });
    if (session?.token === saved.token) await setSession({ ...saved, user });
  } catch (e) {
    if (e instanceof UnauthorizedError && session?.token === saved.token) await setSession(null);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => listeners.delete(listener);
}

/** The signed-in user: undefined while loading, null when signed out. */
export function useAccount() {
  return useSyncExternalStore(subscribe, () =>
    session === undefined ? undefined : (session?.user ?? null),
  );
}

/** Token of the signed-in session once the saved one is read, null when signed out. */
export async function sessionToken() {
  await load();
  return session?.token ?? null;
}

const signedIn = (next: Session) => setSession(next).then(() => next.user);

export const register = (email: string, password: string) =>
  request<Session>('/auth/register', { body: { email, password } }).then(signedIn);

export const login = (email: string, password: string) =>
  request<Session>('/auth/login', { body: { email, password } }).then(signedIn);

export async function logout() {
  const token = session?.token;
  await setSession(null);
  // Signed out on the phone either way; the server copy just expires if this fails.
  if (token) await request('/auth/logout', { token }).catch(() => {});
}

/**
 * Deletes the account and its server backups, then signs out. Unlike logout this
 * throws when the server can't be reached, so the user knows nothing was deleted.
 */
export async function deleteAccount() {
  const token = session?.token;
  if (!token) return;
  try {
    await request('/account', { token, method: 'DELETE' });
  } catch (e) {
    // Already gone on the server (deleted from the website or another phone).
    if (!(e instanceof UnauthorizedError)) throw e;
  }
  await setSession(null);
}

/** Emails a six-digit code. Succeeds whether or not the email has an account. */
export const requestPasswordReset = (email: string) =>
  request<void>('/auth/password/forgot', { body: { email, lang } });

/** Sets a new password with the emailed code and signs in. */
export const resetPassword = (email: string, code: string, password: string) =>
  request<Session>('/auth/password/reset', { body: { email, code, password } }).then(signedIn);
