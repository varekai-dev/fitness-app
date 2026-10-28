/** Error codes the app turns into messages in its own language. */
export type ErrorCode =
  | 'bad_request'
  | 'invalid_email'
  | 'weak_password'
  | 'email_taken'
  | 'wrong_credentials'
  | 'invalid_code'
  | 'too_many_attempts'
  | 'unauthorized'
  | 'forbidden'
  | 'too_large'
  | 'not_found'
  | 'model_not_allowed'
  | 'ai_limit'
  | 'ai_unavailable';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code);
  }
}

// The app sends a bearer token, never cookies, so any origin (the web build) may call.
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-app-version',
};

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...headers },
  });
export const empty = (headers: Record<string, string> = {}) =>
  new Response(null, { status: 204, headers: { ...CORS, ...headers } });

export async function readBody(req: Request) {
  try {
    const body = await req.json();
    if (body && typeof body === 'object') return body as Record<string, unknown>;
  } catch {}
  throw new HttpError(400, 'bad_request');
}
