import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
].join('; ');

export function securityHeaders(config: AppConfig): RequestHandler {
  const production = config.env === 'production';
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    if (production) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  };
}

export function requestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    const requestId =
      incoming && /^[A-Za-z0-9._-]{8,100}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  };
}
