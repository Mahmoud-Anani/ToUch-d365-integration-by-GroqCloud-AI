import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { UnauthorizedError } from '../errors';

const USER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

function readTrustedUser(req: Parameters<RequestHandler>[0], trustHeader: boolean): string | undefined {
  if (!trustHeader) return undefined;
  const raw = req.get('x-user-id');
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = raw.trim();
  if (!USER_ID_PATTERN.test(value)) {
    throw new UnauthorizedError('Invalid X-User-Id header.');
  }
  return value;
}

/**
 * Establishes the request's local or trusted-proxy identity.
 *
 * Without a trusted identity-aware proxy, all requests share a local identity.
 */
export function authMiddleware(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    try {
      const trustedUser = readTrustedUser(req, config.app.trustUserHeader);
      req.auth = trustedUser
        ? { userId: `user:${trustedUser}`, method: 'trusted-header' }
        : { userId: 'local', method: 'local' };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuth(
  req: Parameters<RequestHandler>[0],
): NonNullable<Parameters<RequestHandler>[0]['auth']> {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
