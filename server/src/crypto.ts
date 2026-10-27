const encoder = new TextEncoder();

// The most Workers' PBKDF2 allows. The count is stored with each hash, so it can
// change later without breaking existing passwords.
const ITERATIONS = 100_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const expected = fromBase64(hash);
  const actual = await pbkdf2(password, fromBase64(salt), Number(iterations));
  return crypto.subtle.timingSafeEqual(actual, expected);
}

/** For tokens and codes, which are random enough not to need a slow hash. */
export async function sha256(text: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

/** 256 random bits, URL-safe. */
export const newToken = () =>
  toBase64(randomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Six digits, without the modulo bias of `% 1_000_000` on a 32-bit number. */
export function newCode(): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  return n < limit ? String(n % 1_000_000).padStart(6, '0') : newCode();
}

export const newId = () => crypto.randomUUID();
