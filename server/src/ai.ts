import { HttpError } from './http';
import type { Env } from './index';

const GROQ_API = 'https://api.groq.com/openai/v1';
/** A food photo goes as a data URL; Groq takes images up to 4 MB in base64. */
const MAX_CHAT = 6 * 1024 * 1024;
/** Requests a user may make per UTC day, unless the admin page sets `ai_daily_limit`. */
export const DEFAULT_DAILY_LIMIT = 300;

export async function getConfig(env: Env, key: string) {
  const row = await env.DB.prepare('SELECT value FROM config WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function dailyLimit(env: Env) {
  const value = Number(await getConfig(env, 'ai_daily_limit'));
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_DAILY_LIMIT;
}

/** Cheapest call that proves a key works: lists the models it can use. */
export async function checkGroqKey(key: string) {
  const res = await fetch(`${GROQ_API}/models`, { headers: { authorization: `Bearer ${key}` } });
  return res.ok;
}

/** The feature to count a request under: the JSON schema it asks for, or `search`. */
function featureOf(body: Record<string, unknown>) {
  if (Array.isArray(body.tools) && body.tools.length) return 'search';
  const format = body.response_format as { json_schema?: { name?: unknown } } | undefined;
  const name = format?.json_schema?.name;
  return typeof name === 'string' && /^[\w-]{1,64}$/.test(name) ? name : 'other';
}

/**
 * Passes the app's chat completion request on to Groq with the key from the
 * admin page, and records the tokens it used. Groq's answer goes back as is,
 * errors included, so the app reads it the way it did when it called Groq itself.
 */
export async function aiChat(req: Request, env: Env, ctx: ExecutionContext, userId: string) {
  if (Number(req.headers.get('content-length')) > MAX_CHAT) throw new HttpError(413, 'too_large');
  const raw = await req.text();
  if (raw.length > MAX_CHAT) throw new HttpError(413, 'too_large');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    throw new HttpError(400, 'bad_request');
  }
  // Streaming would hide the usage this counts.
  if (body.stream) throw new HttpError(400, 'bad_request');
  const model = typeof body.model === 'string' ? body.model : '';
  const known = await env.DB.prepare('SELECT 1 FROM ai_models WHERE model = ?').bind(model).first();
  if (!known) throw new HttpError(400, 'model_not_allowed');

  const key = await getConfig(env, 'groq_api_key');
  if (!key) throw new HttpError(503, 'ai_unavailable');

  const dayStart = new Date().setUTCHours(0, 0, 0, 0);
  const used = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND created_at >= ?',
  )
    .bind(userId, dayStart)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= (await dailyLimit(env))) throw new HttpError(429, 'ai_limit');

  const res = await fetch(`${GROQ_API}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: raw,
  });
  const answer = await res.text();
  if (res.status === 401 || res.status === 403) {
    // The key on the admin page was revoked: the app can't fix that, the admin can.
    console.error('Groq rejected the API key', res.status, answer.slice(0, 200));
    throw new HttpError(503, 'ai_unavailable');
  }

  let usage: { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined;
  try {
    usage = JSON.parse(answer)?.usage;
  } catch {}
  if (usage) {
    const tokens = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.round(v) : 0);
    ctx.waitUntil(
      env.DB.prepare(
        `INSERT INTO ai_usage (user_id, feature, model, input_tokens, output_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          userId,
          featureOf(body),
          model,
          tokens(usage.prompt_tokens),
          tokens(usage.completion_tokens),
          Date.now(),
        )
        .run()
        .catch(console.error),
    );
  }
  return new Response(answer, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'access-control-allow-origin': '*',
    },
  });
}
