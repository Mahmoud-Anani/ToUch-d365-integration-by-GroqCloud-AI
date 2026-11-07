import type { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        method: 'trusted-header' | 'local';
      };
    }
  }
}

export type AuthenticatedRequest = Request & {
  auth: NonNullable<Request['auth']>;
};
