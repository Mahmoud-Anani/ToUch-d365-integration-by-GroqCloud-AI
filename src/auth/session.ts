import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface SessionPayload {
  /** Normalized username. */
  sub: string;
  /** Issued-at, milliseconds since epoch. */
  iat: number;
  /** Expiry, milliseconds since epoch. */
  exp: number;
}

export interface SessionServiceOptions {
  secret: string;
  ttlMs: number;
  cookieName: string;
  secure: boolean;
}

export interface CreatedSession {
  token: string;
  expiresAt: number;
}

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const rawValue = part.slice(index + 1).trim();
    if (!name || cookies[name] !== undefined) continue;
    let value = rawValue;
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

/**
 * Issues and verifies stateless, HMAC-signed session tokens stored in an
 * HttpOnly cookie. Tokens include their expiry and are validated on every
 * request; no server-side session store is required.
 */
export class SessionService {
  private readonly key: Buffer;
  private readonly ttlMs: number;
  readonly cookieName: string;
  private readonly secure: boolean;

  constructor(options: SessionServiceOptions) {
    if (!options.secret || options.secret.length < 32) {
      throw new Error('Session secret must contain at least 32 characters.');
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs < 60_000) {
      throw new Error('Session TTL must be at least one minute.');
    }
    this.key = Buffer.from(options.secret, 'utf8');
    this.ttlMs = Math.trunc(options.ttlMs);
    this.cookieName = options.cookieName;
    this.secure = options.secure;
  }

  create(username: string): CreatedSession {
    const now = Date.now();
    const payload: SessionPayload = {
      sub: username,
      iat: now,
      exp: now + this.ttlMs,
    };
    const encodedPayload = base64url(JSON.stringify(payload));
    const signature = this.sign(encodedPayload);
    return {
      token: `${encodedPayload}.${signature}`,
      expiresAt: payload.exp,
    };
  }

  verify(token: string | undefined): SessionPayload | undefined {
    if (!token) return undefined;
    const separator = token.indexOf('.');
    if (separator <= 0 || separator !== token.lastIndexOf('.')) return undefined;
    const encodedPayload = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!encodedPayload || !signature) return undefined;
    if (!safeEqual(this.sign(encodedPayload), signature)) return undefined;

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const candidate = payload as Record<string, unknown>;
    if (
      typeof candidate.sub !== 'string' ||
      typeof candidate.iat !== 'number' ||
      typeof candidate.exp !== 'number' ||
      !Number.isFinite(candidate.iat) ||
      !Number.isFinite(candidate.exp) ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(candidate.sub)
    ) {
      return undefined;
    }
    const now = Date.now();
    if (candidate.exp <= now || candidate.iat > now + 60_000) return undefined;
    return {
      sub: candidate.sub,
      iat: candidate.iat,
      exp: candidate.exp,
    };
  }

  readToken(cookieHeader: string | undefined): string | undefined {
    return parseCookieHeader(cookieHeader)[this.cookieName];
  }

  cookie(token: string, expiresAt: number): string {
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1_000));
    return [
      `${this.cookieName}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAge}`,
      `Expires=${new Date(expiresAt).toUTCString()}`,
      ...(this.secure ? ['Secure'] : []),
    ].join('; ');
  }

  clearCookie(): string {
    return [
      `${this.cookieName}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      ...(this.secure ? ['Secure'] : []),
    ].join('; ');
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.key).update(encodedPayload).digest('base64url');
  }
}

/** Used to generate a high-entropy secret for development when none is set. */
export function generateSessionSecret(): string {
  return randomBytes(48).toString('base64url');
}
