import { adminPage } from './admin-page';
import { checkGroqKey, dailyLimit, getConfig } from './ai';
import { cloudflareUsage } from './cloudflare';
import { newToken, sha256 } from './crypto';
import { HttpError, json, readBody } from './http';
import type { Env } from './index';

const ADMIN_SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const COOKIE = 'admin_session';

/** The admin page is same-origin only: no CORS, and its cookie never leaves /admin. */
const sessionCookie = (token: string, maxAge: number) =>
  `${COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

const adminEmails = (env: Env) =>
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

function readCookie(req: Request) {
  const cookies = req.headers.get('cookie') ?? '';
  return cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1] ?? null;
}

/** The signed-in admin's email; throws when the cookie is missing, expired or no longer an admin's. */
async function requireAdmin(req: Request, env: Env) {
  const token = readCookie(req);
  if (!token) throw new HttpError(401, 'unauthorized');
  const row = await env.DB.prepare(
    'SELECT email FROM admin_sessions WHERE token_hash = ? AND expires_at > ?',
  )
    .bind(await sha256(token), Date.now())
    .first<{ email: string }>();
  // Taking an email out of ADMIN_EMAILS signs it out at once.
  if (!row || !adminEmails(env).includes(row.email)) throw new HttpError(401, 'unauthorized');
  return row.email;
}

export function page(_req: Request, env: Env) {
  return Promise.resolve(
    new Response(adminPage(env.GOOGLE_CLIENT_ID ?? ''), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Google's sign-in button opens its popup from this page.
        'cross-origin-opener-policy': 'same-origin-allow-popups',
        'x-frame-options': 'DENY',
      },
    }),
  );
}

/**
 * Signs in with the ID token Google's button gave the page. Google's tokeninfo
 * endpoint checks the signature and expiry; this checks it was issued for our
 * client and to one of ADMIN_EMAILS.
 */
async function login(req: Request, env: Env) {
  const body = await readBody(req);
  const credential = typeof body.credential === 'string' ? body.credential : '';
  if (!credential || !env.GOOGLE_CLIENT_ID) throw new HttpError(400, 'bad_request');
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!res.ok) throw new HttpError(401, 'unauthorized');
  const info = await res.json<{
    aud?: string;
    iss?: string;
    email?: string;
    email_verified?: string;
  }>();
  const email = info.email?.toLowerCase() ?? '';
  if (
    info.aud !== env.GOOGLE_CLIENT_ID ||
    !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss ?? '') ||
    info.email_verified !== 'true'
  ) {
    throw new HttpError(401, 'unauthorized');
  }
  if (!adminEmails(env).includes(email)) throw new HttpError(403, 'forbidden');

  const token = newToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare(
      'INSERT INTO admin_sessions (token_hash, email, expires_at) VALUES (?, ?, ?)',
    ).bind(await sha256(token), email, now + ADMIN_SESSION_TTL),
  ]);
  return json({ email }, 200, {
    'set-cookie': sessionCookie(token, ADMIN_SESSION_TTL / 1000),
  });
}

async function logout(req: Request, env: Env) {
  const token = readCookie(req);
  if (token) {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
  }
  return json({}, 200, { 'set-cookie': sessionCookie('', 0) });
}

const maskKey = (key: string) =>
  key.length <= 12 ? '••••' : `${key.slice(0, 6)}…${key.slice(-4)}`;

// Cost of a usage row in USD; a model since removed from ai_models counts as free.
const COST = `SUM(a.input_tokens * COALESCE(m.input_per_m, 0) + a.output_tokens * COALESCE(m.output_per_m, 0)) / 1e6`;

/** Settings and spending over the last `days` days (all time when 0), per user, feature and day. */
async function overview(req: Request, env: Env) {
  const email = await requireAdmin(req, env);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 0, 0), 3650);
  const since = days ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;
  const from = `FROM ai_usage a LEFT JOIN ai_models m ON m.model = a.model WHERE a.created_at >= ?`;
  const totals = `COUNT(*) AS requests, SUM(a.input_tokens) AS inputTokens,
    SUM(a.output_tokens) AS outputTokens, ${COST} AS cost`;
  const [users, features, daily, models] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.email, a.user_id AS userId, MAX(a.created_at) AS lastAt, ${totals}
       FROM ai_usage a LEFT JOIN ai_models m ON m.model = a.model JOIN users u ON u.id = a.user_id
       WHERE a.created_at >= ? GROUP BY a.user_id ORDER BY cost DESC, requests DESC LIMIT 500`,
    ).bind(since),
    env.DB.prepare(
      `SELECT a.feature, ${totals} ${from} GROUP BY a.feature ORDER BY cost DESC`,
    ).bind(since),
    env.DB.prepare(
      `SELECT date(a.created_at / 1000, 'unixepoch') AS day, ${totals} ${from}
       GROUP BY day ORDER BY day DESC LIMIT 60`,
    ).bind(since),
    env.DB.prepare(
      'SELECT model, input_per_m AS inputPerM, output_per_m AS outputPerM FROM ai_models ORDER BY model',
    ),
  ]);
  const key = await getConfig(env, 'groq_api_key');
  return json({
    email,
    groqKey: key ? maskKey(key) : null,
    dailyLimit: await dailyLimit(env),
    models: models.results,
    users: users.results,
    features: features.results,
    daily: daily.results,
  });
}

async function setConfig(env: Env, key: string, value: string) {
  await env.DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
    .bind(key, value)
    .run();
}

async function saveGroqKey(req: Request, env: Env) {
  await requireAdmin(req, env);
  const key = String((await readBody(req)).key ?? '').trim();
  if (!key || key.length > 200) throw new HttpError(400, 'bad_request');
  if (!(await checkGroqKey(key))) return json({ error: 'invalid_key' }, 400);
  await setConfig(env, 'groq_api_key', key);
  return json({ groqKey: maskKey(key) });
}

async function saveLimit(req: Request, env: Env) {
  await requireAdmin(req, env);
  const limit = Number((await readBody(req)).dailyLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100000)
    throw new HttpError(400, 'bad_request');
  await setConfig(env, 'ai_daily_limit', String(limit));
  return json({ dailyLimit: limit });
}

/** Adds a model or changes its prices; `remove` stops the app from using it. */
async function saveModel(req: Request, env: Env) {
  await requireAdmin(req, env);
  const body = await readBody(req);
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!model || model.length > 100) throw new HttpError(400, 'bad_request');
  if (body.remove === true) {
    await env.DB.prepare('DELETE FROM ai_models WHERE model = ?').bind(model).run();
    return json({});
  }
  const input = Number(body.inputPerM);
  const output = Number(body.outputPerM);
  if (![input, output].every((p) => Number.isFinite(p) && p >= 0 && p < 1000)) {
    throw new HttpError(400, 'bad_request');
  }
  await env.DB.prepare(
    'INSERT OR REPLACE INTO ai_models (model, input_per_m, output_per_m) VALUES (?, ?, ?)',
  )
    .bind(model, input, output)
    .run();
  return json({});
}

/** Free plan usage of the Cloudflare account; asked separately, it takes a second. */
async function cloudflare(req: Request, env: Env) {
  await requireAdmin(req, env);
  return json(await cloudflareUsage(env));
}

type Handler = (req: Request, env: Env) => Promise<Response>;

export const ADMIN_ROUTES: Record<string, Handler> = {
  'GET /admin': page,
  'POST /admin/api/login': login,
  'POST /admin/api/logout': logout,
  'GET /admin/api/overview': overview,
  'PUT /admin/api/groq-key': saveGroqKey,
  'PUT /admin/api/daily-limit': saveLimit,
  'PUT /admin/api/models': saveModel,
  'GET /admin/api/cloudflare': cloudflare,
};
