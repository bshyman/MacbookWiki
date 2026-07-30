// Session signing. proxy.ts verifies on every gated request, so this has to run
// outside the Node runtime — Web Crypto only, no node:crypto, no next/headers.
//
// The password is shared across the team, so a session proves "someone who knows
// the password" and the operator name in it is self-declared. That's weaker than
// SSO and deliberately so; it still beats a per-record name box, because the name
// is fixed for the whole session and the server stamps records from it.

const enc = new TextEncoder();

export const SESSION_COOKIE = 'mw_session';

/** One bench shift. Drafts survive expiry, so the cost of timing out is a re-login. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface Session {
  operator: string;
  /** Epoch ms. */
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let keyPromise: Promise<CryptoKey> | null = null;

function hmacKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;

  const secret = process.env.AUTH_SECRET;
  // Fail closed. A missing secret must break every request, not silently sign
  // sessions with a predictable key.
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to at least 32 characters. Generate one with `openssl rand -base64 32`.',
    );
  }

  keyPromise = crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return keyPromise;
}

async function sign(data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** Both inputs here are fixed-length digests, so the length check leaks nothing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(operator: string): Promise<string> {
  const payload: Session = { operator, exp: Date.now() + SESSION_TTL_SECONDS * 1000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (!timingSafeEqual(sig, await sign(body))) return null;

  try {
    const s = JSON.parse(new TextDecoder().decode(unb64url(body))) as Session;
    if (typeof s.operator !== 'string' || s.operator === '') return null;
    if (typeof s.exp !== 'number' || Date.now() > s.exp) return null;
    return s;
  } catch {
    return null;
  }
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    throw new Error('APP_PASSWORD is not set. Copy .env.example to .env.local and set one.');
  }
  // Compare HMACs rather than the raw strings — equal-length digests, so the
  // comparison can't leak the password's length or a matching prefix.
  const [a, b] = await Promise.all([sign(candidate), sign(expected)]);
  return timingSafeEqual(a, b);
}

/**
 * `?next=` comes from the URL, so it's attacker-controlled. Only same-origin
 * absolute paths get through — no protocol-relative `//evil.com`.
 */
export function safeNext(value: string | string[] | undefined, fallback = '/intake'): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v || !v.startsWith('/') || v.startsWith('//')) return fallback;
  return v;
}
