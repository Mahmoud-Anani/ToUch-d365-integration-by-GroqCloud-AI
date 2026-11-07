import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { LogLevel } from './config';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY = /(secret|token|password|authorization|api[_-]?key|client[_-]?secret|cookie)/i;
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_LIKE = /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi;
const MAX_LOG_STRING = 2_000;

export function redactString(value: string): string {
  return value
    .replace(JWT_LIKE, '[REDACTED_TOKEN]')
    .replace(BEARER_LIKE, 'Bearer [REDACTED_TOKEN]')
    .slice(0, MAX_LOG_STRING);
}

/**
 * Deep-redacts sensitive keys and token-shaped values. Kept intentionally
 * conservative and depth-limited so accidental large ERP rows cannot flood logs.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      if (SENSITIVE_KEY.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redact(item, depth + 1);
      }
    }
    return result;
  }
  return '[UNSUPPORTED]';
}

export interface AuditEvent {
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  userRef?: string;
  conversationRef?: string;
  entitySet?: string;
  fields?: string[];
  rowCount?: number;
  durationMs?: number;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export class Logger {
  private readonly level: LogLevel;
  private readonly auditFile?: string;
  private auditFileReady = false;

  constructor(options: { level: LogLevel; auditFile?: string }) {
    this.level = options.level;
    this.auditFile = options.auditFile;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }

  audit(event: AuditEvent): void {
    const entry = {
      ts: new Date().toISOString(),
      channel: 'audit',
      ...event,
      metadata: event.metadata ? (redact(event.metadata) as Record<string, unknown>) : undefined,
    };
    // Audit events are always emitted, independent of LOG_LEVEL.
    process.stdout.write(`${JSON.stringify(entry)}\n`);
    if (this.auditFile) {
      this.appendAudit(entry);
    }
  }

  private appendAudit(entry: Record<string, unknown>): void {
    const file = this.auditFile;
    if (!file) return;
    try {
      if (!this.auditFileReady) {
        mkdirSync(path.dirname(file), { recursive: true });
        this.auditFileReady = true;
      }
      appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      // Audit logging must never break a request. stdout copy already exists.
    }
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.level]) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: redactString(message),
      ...(meta ? { meta: redact(meta) } : {}),
    };
    const line = `${JSON.stringify(entry)}\n`;
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}

export function createLogger(level: LogLevel, auditFile?: string): Logger {
  return new Logger({ level, auditFile });
}
