import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

/**
 * Hashes a password with scrypt. The encoded value carries every parameter
 * required to verify it, so hashes remain verifiable if defaults change.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must not be empty.');
  }
  if (password.length > 512) {
    throw new Error('Password is too long.');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    KEY_LENGTH,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

function parseHash(encoded: string): {
  N: number;
  r: number;
  p: number;
  keyLength: number;
  salt: Buffer;
  hash: Buffer;
} | undefined {
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts[0] !== PREFIX) return undefined;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const keyLength = Number(parts[4]);
  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    !Number.isSafeInteger(keyLength) ||
    N < 1_024 ||
    N > 1_048_576 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16 ||
    keyLength < 16 ||
    keyLength > 128 ||
    N > 2 ** 31 ||
    r * p > 1_024
  ) {
    return undefined;
  }
  let salt: Buffer;
  let hash: Buffer;
  try {
    salt = Buffer.from(parts[5] as string, 'base64url');
    hash = Buffer.from(parts[6] as string, 'base64url');
  } catch {
    return undefined;
  }
  if (salt.length < 8 || hash.length !== keyLength) return undefined;
  return { N, r, p, keyLength, salt, hash };
}

/** Verifies a password against an encoded scrypt hash in constant time. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length === 0) return false;
  const parsed = parseHash(encoded);
  if (!parsed) return false;
  try {
    const derived = await scrypt(password, parsed.salt, parsed.keyLength, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    });
    if (derived.length !== parsed.hash.length) return false;
    return timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}
