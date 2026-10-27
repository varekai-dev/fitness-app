import { hashPassword, newCode, newId, newToken, sha256, verifyPassword } from './crypto';
import { sendResetCode, type Lang } from './mail';

export interface Env {
  DB: D1Database;
  SMTP_HOST: string;
  SMTP_PORT: string;
  MAIL_FROM_NAME: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
}

const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 180 * DAY;
const RESET_TTL = 15 * 60 * 1000;
/** A new code can be requested this long after the previous one. */
const RESET_RESEND = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const MIN_PASSWORD = 8;

type User = { id: string; email: string; created_at: number };

/** Error codes the app turns into messages in its own language. */
type ErrorCode =
  | 'bad_request'
  | 'invalid_email'
  | 'weak_password'
  | 'email_taken'
  | 'wrong_credentials'
  | 'invalid_code'
  | 'too_many_attempts'
  | 'unauthorized'
  | 'not_found';

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code);
  }
}

// The app sends a bearer token, never cookies, so any origin (the web build) may call.
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
const empty = () => new Response(null, { status: 204, headers: CORS });

async function readBody(req: Request) {
  try {
    const body = await req.json();
    if (body && typeof body === 'object') return body as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, 'bad_request');
}

function readEmail(body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'invalid_email');
  }
  return email;
}

function readNewPassword(body: Record<string, unknown>) {
  const password = typeof body.password === 'string' ? body.password : '';
  // PBKDF2 hashes long input fine, the cap only keeps requests small.
  if (password.length < MIN_PASSWORD || password.length > 256) {
    throw new HttpError(400, 'weak_password');
  }
  return password;
}

const readLang = (body: Record<string, unknown>): Lang => (body.lang === 'en' ? 'en' : 'uk');

const publicUser = (user: User) => ({
  id: user.id,
  email: user.email,
  createdAt: user.created_at,
});

async function createSession(env: Env, user: User) {
  const token = newToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(user.id, now),
    env.DB.prepare(
      'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    ).bind(await sha256(token), user.id, now, now + SESSION_TTL),
  ]);
  return { token, user: publicUser(user) };
}

/** The signed-in user and their session's token hash, from `Authorization: Bearer …`. */
async function authenticate(req: Request, env: Env) {
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401, 'unauthorized');
  const tokenHash = await sha256(token);
  const user = await env.DB.prepare(
    `SELECT users.id, users.email, users.created_at FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(tokenHash, Date.now())
    .first<User>();
  if (!user) throw new HttpError(401, 'unauthorized');
  return { user, tokenHash };
}

const findUser = (env: Env, email: string) =>
  env.DB.prepare('SELECT id, email, created_at, password_hash FROM users WHERE email = ?')
    .bind(email)
    .first<User & { password_hash: string }>();

async function register(req: Request, env: Env) {
  const body = await readBody(req);
  const email = readEmail(body);
  const password = readNewPassword(body);
  if (await findUser(env, email)) throw new HttpError(409, 'email_taken');
  const user: User = { id: newId(), email, created_at: Date.now() };
  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(user.id, user.email, await hashPassword(password), user.created_at)
      .run();
  } catch (e) {
    // Two sign-ups with the same email at once: the second hits the UNIQUE index.
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'email_taken');
    throw e;
  }
  return json(await createSession(env, user), 201);
}

async function login(req: Request, env: Env) {
  const body = await readBody(req);
  const email = readEmail(body);
  const password = typeof body.password === 'string' ? body.password : '';
  const user = await findUser(env, email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'wrong_credentials');
  }
  return json(await createSession(env, user));
}

async function logout(req: Request, env: Env) {
  const { tokenHash } = await authenticate(req, env);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  return empty();
}

async function me(req: Request, env: Env) {
  const { user } = await authenticate(req, env);
  return json({ user: publicUser(user) });
}

/**
 * Emails a six-digit code. Answers the same whether or not the email has an
 * account, so the endpoint can't be used to look up who's signed up.
 */
async function forgotPassword(req: Request, env: Env, ctx: ExecutionContext) {
  const body = await readBody(req);
  const email = readEmail(body);
  const user = await findUser(env, email);
  if (!user) return empty();
  const now = Date.now();
  const pending = await env.DB.prepare('SELECT created_at FROM password_resets WHERE user_id = ?')
    .bind(user.id)
    .first<{ created_at: number }>();
  if (pending && now - pending.created_at < RESET_RESEND) return empty();

  const code = newCode();
  await env.DB.prepare(
    `INSERT OR REPLACE INTO password_resets (user_id, code_hash, attempts, created_at, expires_at)
     VALUES (?, ?, 0, ?, ?)`,
  )
    .bind(user.id, await sha256(`${user.id}:${code}`), now, now + RESET_TTL)
    .run();
  // Sent after the response, so its timing doesn't tell whether the account exists.
  ctx.waitUntil(sendResetCode(env, email, code, readLang(body)).catch(console.error));
  return empty();
}

async function resetPassword(req: Request, env: Env) {
  const body = await readBody(req);
  const email = readEmail(body);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = readNewPassword(body);
  const user = await findUser(env, email);
  if (!user) throw new HttpError(400, 'invalid_code');

  const reset = await env.DB.prepare(
    'SELECT code_hash, attempts, expires_at FROM password_resets WHERE user_id = ?',
  )
    .bind(user.id)
    .first<{ code_hash: string; attempts: number; expires_at: number }>();
  if (!reset || reset.expires_at < Date.now()) throw new HttpError(400, 'invalid_code');
  if (reset.attempts >= RESET_MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');
  if ((await sha256(`${user.id}:${code}`)) !== reset.code_hash) {
    await env.DB.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?')
      .bind(user.id)
      .run();
    throw new HttpError(400, 'invalid_code');
  }

  // A new password signs out every device, in case the old one leaked.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(
      await hashPassword(password),
      user.id,
    ),
    env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  return json(await createSession(env, user));
}

type Handler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

const ROUTES: Record<string, Handler> = {
  'POST /auth/register': register,
  'POST /auth/login': login,
  'POST /auth/logout': logout,
  'GET /auth/me': me,
  'POST /auth/password/forgot': forgotPassword,
  'POST /auth/password/reset': resetPassword,
};

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return empty();
    const route = ROUTES[`${req.method} ${new URL(req.url).pathname}`];
    try {
      if (!route) throw new HttpError(404, 'not_found');
      return await route(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
