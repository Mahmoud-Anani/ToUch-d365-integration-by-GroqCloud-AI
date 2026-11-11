import type { Request } from 'express';
import type { UserRole } from '../auth/users';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        username: string;
        displayName: string;
        role: UserRole;
        method: 'session';
        expiresAt: number;
      };
    }
  }
}

export type AuthenticatedRequest = Request & {
  auth: NonNullable<Request['auth']>;
};
