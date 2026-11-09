import type { RequestHandler } from 'express';
import type { UserStore } from '../auth/users';
import type { SessionService } from '../auth/session';
import { UnauthorizedError } from '../errors';

/**
 * Establishes the request identity from the signed session cookie. Requests
 * without a valid session simply have no `auth` context; route guards decide
 * whether that is allowed.
 */
export function authMiddleware(sessions: SessionService, users: UserStore): RequestHandler {
  return (req, _res, next) => {
    try {
      const token = sessions.readToken(req.get('cookie'));
      const payload = sessions.verify(token);
      if (!payload) {
        next();
        return;
      }
      const user = users.find(payload.sub);
      if (!user) {
        next();
        return;
      }
      req.auth = {
        userId: `user:${user.username}`,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        method: 'session',
        expiresAt: payload.exp,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Requires an authenticated session; used for every project and API route. */
export const requireSession: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new UnauthorizedError('Sign in to access Touch Business Intelligence.'));
    return;
  }
  next();
};

export function requireAuth(
  req: Parameters<RequestHandler>[0],
): NonNullable<Parameters<RequestHandler>[0]['auth']> {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}
