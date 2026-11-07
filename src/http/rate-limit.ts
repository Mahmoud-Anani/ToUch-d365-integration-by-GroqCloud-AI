import type { Request, RequestHandler } from 'express';
import { RateLimitError } from '../errors';

interface Entry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

/** Small in-process fixed-window limiter. Single instance only. */
export class RateLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly windowMs: number;
  private readonly max: number;
  private checks = 0;

  constructor(options: { windowMs: number; max: number }) {
    this.windowMs = Math.max(1_000, options.windowMs);
    this.max = Math.max(1, options.max);
  }

  get limit(): number {
    return this.max;
  }

  check(key: string, max = this.max): RateLimitResult {
    const now = Date.now();
    this.checks += 1;
    if (this.checks % 1_000 === 0) this.cleanup(now);

    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= max;
    return {
      allowed,
      remaining: Math.max(0, max - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
      resetAt: entry.resetAt,
    };
  }

  reset(): void {
    this.entries.clear();
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }
}

function keyFor(req: Request): string {
  return req.auth?.userId ?? req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function rateLimitMiddleware(limiter: RateLimiter): RequestHandler {
  return (req, res, next) => {
    try {
      const result = limiter.check(keyFor(req));
      res.setHeader('X-RateLimit-Limit', String(limiter.limit));
      res.setHeader('X-RateLimit-Remaining', String(result.remaining));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1_000)));
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new RateLimitError(result.retryAfterSeconds);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Separate limiter for chat so long AI turns do not consume the whole quota. */
export function chatRateLimitMiddleware(limiter: RateLimiter): RequestHandler {
  return (req, res, next) => {
    try {
      const result = limiter.check(`chat:${keyFor(req)}`);
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new RateLimitError(
          result.retryAfterSeconds,
          'Too many chat requests. Please wait a moment before sending another question.',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
