import { Router, type Request, type NextFunction, type Response } from 'express';
import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import type { UserStore } from '../auth/users';
import type { SessionService } from '../auth/session';
import { RateLimiter } from './rate-limit';
import { RateLimitError, UnauthorizedError, ValidationError } from '../errors';

const MAX_USERNAME = 64;
const MAX_PASSWORD = 512;

function asyncRoute(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function readCredentials(body: unknown): { username: string; password: string } {
  const payload = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  if (!username || !password) {
    throw new ValidationError('Username and password are required.');
  }
  if (username.length > MAX_USERNAME || password.length > MAX_PASSWORD) {
    throw new ValidationError('Username or password is too long.');
  }
  return { username, password };
}

export interface AuthRouterOptions {
  config: AppConfig;
  users: UserStore;
  sessions: SessionService;
  logger: Logger;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const { config, users, sessions, logger } = options;
  const router = Router();
  const loginLimiter = new RateLimiter({
    windowMs: config.auth.loginWindowMs,
    max: config.auth.loginMaxAttempts,
  });

  router.get('/me', (req, res) => {
    if (!req.auth) {
      res.json({ authenticated: false });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        username: req.auth.username,
        displayName: req.auth.displayName,
        role: req.auth.role,
      },
      expiresAt: new Date(req.auth.expiresAt).toISOString(),
    });
  });

  router.post(
    '/login',
    asyncRoute(async (req, res) => {
      const key = `login:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`;
      const limit = loginLimiter.check(key);
      res.setHeader('X-RateLimit-Limit', String(loginLimiter.limit));
      res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(limit.resetAt / 1_000)));
      if (!limit.allowed) {
        res.setHeader('Retry-After', String(limit.retryAfterSeconds));
        logger.audit({
          action: 'auth.login',
          outcome: 'failure',
          metadata: { reason: 'rate-limited', ip: req.ip },
        });
        throw new RateLimitError(
          limit.retryAfterSeconds,
          'Too many sign-in attempts. Please wait before trying again.',
        );
      }

      const { username, password } = readCredentials(req.body);
      const user = await users.authenticate(username, password);
      if (!user) {
        logger.audit({
          action: 'auth.login',
          outcome: 'failure',
          userRef: `user:${username.toLowerCase()}`,
          metadata: { reason: 'invalid-credentials', ip: req.ip },
        });
        throw new UnauthorizedError('Invalid username or password.');
      }

      const session = sessions.create(user.username);
      res.append('Set-Cookie', sessions.cookie(session.token, session.expiresAt));
      logger.audit({
        action: 'auth.login',
        outcome: 'success',
        userRef: `user:${user.username}`,
        metadata: { ip: req.ip },
      });
      res.json({
        user,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
    }),
  );

  router.post('/logout', (req, res) => {
    res.append('Set-Cookie', sessions.clearCookie());
    if (req.auth) {
      logger.audit({
        action: 'auth.logout',
        outcome: 'success',
        userRef: `user:${req.auth.username}`,
      });
    }
    res.json({ ok: true });
  });

  return router;
}
