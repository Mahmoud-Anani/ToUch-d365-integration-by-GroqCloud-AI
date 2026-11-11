import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ConfigurationError } from '../errors';
import { verifyPassword } from './password';

export type UserRole = 'admin' | 'analyst' | 'viewer';

export interface PublicUser {
  username: string;
  displayName: string;
  role: UserRole;
}

interface StoredUser extends PublicUser {
  passwordHash: string;
  disabled?: boolean;
}

interface UsersFile {
  users: StoredUser[];
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const ROLES = new Set<UserRole>(['admin', 'analyst', 'viewer']);

// A valid scrypt hash used to equalize timing when a username does not exist.
const DUMMY_HASH =
  'scrypt$16384$8$1$64$d_3JVHM9c7M9qPQkxDEQ2A$FkXwVxuKrN2ylM-qhD5HMfZ1Kne5nchbP9cua0rVET1HA7_QslL_kwQ_f8IAxlWkGus5iGk9Zi6U5uOmI9O5Xw';

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function readUsersFile(filePath: string): StoredUser[] {
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) {
    throw new ConfigurationError(
      `User credentials file was not found at ${absolute}. Set USERS_FILE or create it from config/users.json.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
  } catch (error) {
    throw new ConfigurationError(
      `User credentials file at ${absolute} is not valid JSON: ${(error as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigurationError('User credentials file must contain a JSON object with a "users" array.');
  }
  const users = (parsed as Partial<UsersFile>).users;
  if (!Array.isArray(users) || users.length === 0) {
    throw new ConfigurationError('User credentials file must define at least one user.');
  }

  const seen = new Set<string>();
  const validated: StoredUser[] = [];
  for (let index = 0; index < users.length; index += 1) {
    const entry = users[index] as unknown;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ConfigurationError(`User entry ${index + 1} must be an object.`);
    }
    const candidate = entry as Record<string, unknown>;
    const username = typeof candidate.username === 'string' ? normalizeUsername(candidate.username) : '';
    const passwordHash = typeof candidate.passwordHash === 'string' ? candidate.passwordHash.trim() : '';
    const role = typeof candidate.role === 'string' ? candidate.role.trim().toLowerCase() : 'viewer';
    const displayName =
      typeof candidate.displayName === 'string' && candidate.displayName.trim()
        ? candidate.displayName.trim()
        : username;
    const disabled = candidate.disabled === true;

    if (!USERNAME_PATTERN.test(username)) {
      throw new ConfigurationError(
        `User entry ${index + 1} has an invalid username. Use 1-64 letters, digits, dots, underscores or hyphens.`,
      );
    }
    if (seen.has(username)) {
      throw new ConfigurationError(`User entry ${index + 1} duplicates username "${username}".`);
    }
    if (!passwordHash.startsWith('scrypt$')) {
      throw new ConfigurationError(
        `User "${username}" must have a scrypt passwordHash. Generate one with "npm run hash-password".`,
      );
    }
    if (!ROLES.has(role as UserRole)) {
      throw new ConfigurationError(
        `User "${username}" has role "${role}"; expected admin, analyst, or viewer.`,
      );
    }

    seen.add(username);
    validated.push({
      username,
      displayName,
      role: role as UserRole,
      passwordHash,
      ...(disabled ? { disabled: true } : {}),
    });
  }
  return validated;
}

/**
 * Static, file-backed user directory. Passwords are only ever stored as
 * scrypt hashes and are never exposed through the public user shape.
 */
export class UserStore {
  private readonly users: Map<string, StoredUser>;

  private constructor(users: StoredUser[]) {
    this.users = new Map(users.map((user) => [user.username, user]));
  }

  static load(filePath: string): UserStore {
    return new UserStore(readUsersFile(filePath));
  }

  get size(): number {
    return this.users.size;
  }

  find(username: string): PublicUser | undefined {
    if (typeof username !== 'string') return undefined;
    const user = this.users.get(normalizeUsername(username));
    if (!user || user.disabled) return undefined;
    return { username: user.username, displayName: user.displayName, role: user.role };
  }

  list(): PublicUser[] {
    return [...this.users.values()]
      .filter((user) => !user.disabled)
      .map((user) => ({ username: user.username, displayName: user.displayName, role: user.role }));
  }

  async authenticate(username: string, password: string): Promise<PublicUser | undefined> {
    if (typeof username !== 'string' || typeof password !== 'string') return undefined;
    const normalized = normalizeUsername(username);
    if (!normalized || !password) return undefined;

    const user = this.users.get(normalized);
    // Always run one scrypt verification so response time does not reveal
    // whether a username exists.
    const encoded = user?.passwordHash ?? DUMMY_HASH;
    const valid = await verifyPassword(password, encoded);
    if (!valid || !user || user.disabled) return undefined;
    return { username: user.username, displayName: user.displayName, role: user.role };
  }
}
