import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface D365Config {
  baseUrl: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  staticToken?: string;
  requestTimeoutMs: number;
  pageSize: number;
  analyticsMaxRows: number;
  maxResponseBytes: number;
  includeCount: boolean;
  entityAllowlist: string[];
  entityDenylist: string[];
  fieldAllowlist: string[];
  fieldDenylist: string[];
}

export interface AIConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxToolIterations: number;
  maxCompletionTokens: number;
  maxResultRows: number;
  maxToolResultRows: number;
  maxHistoryMessages: number;
  maxContextChars: number;
  maxSchemaFields: number;
  maxGroups: number;
  enableReadOnly: boolean;
}

export interface ConversationConfig {
  store: 'file' | 'memory';
  filePath: string;
  maxPerUser: number;
  maxMessages: number;
  retentionDays: number;
}

export interface AppConfig {
  env: string;
  port: number;
  logLevel: LogLevel;
  requestBodyLimit: string;
  trustProxy: boolean;
  app: {
    trustUserHeader: boolean;
  };
  rateLimit: {
    windowMs: number;
    max: number;
    chatMax: number;
  };
  d365: D365Config;
  ai: AIConfig;
  conversations: ConversationConfig;
  metadata: {
    cacheTtlMs: number;
    cacheDir: string;
    maxBytes: number;
  };
  auditLogFile?: string;
  warnings: string[];
}

type EnvLike = Record<string, string | undefined>;

const DEFAULT_D365_SCOPE_SUFFIX = '/.default';

function str(env: EnvLike, name: string, fallback = ''): string {
  const value = env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function int(env: EnvLike, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.trunc(value);
}

function bool(env: EnvLike, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function list(env: EnvLike, name: string): string[] {
  return str(env, name)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isD365UrlPlaceholder(value: string): boolean {
  return /your[-_ ]?(?:environment|tenant|domain|url)|placeholder|example\.com/i.test(value);
}

function d365BaseUrlFromScope(scope: string): string | undefined {
  try {
    const url = new URL(scope);
    if (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase().endsWith('.dynamics.com') &&
      url.pathname.replace(/\/+$/, '') === '/.default' &&
      !url.username &&
      !url.password
    ) {
      return url.origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Normalises the D365 base URL. D365 OData lives under <origin>/data; the
 * configuration stores the root so every request is built from a single,
 * validated origin.
 */
export function normaliseD365BaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error('D365_BASE_URL must use https (http is only allowed for localhost).');
  }
  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname.toLowerCase().endsWith('/data')) {
    pathname = pathname.slice(0, -5);
  }
  return `${url.origin}${pathname}`;
}

export function createConfig(env: EnvLike = process.env): AppConfig {
  const warnings: string[] = [];
  if (str(env, 'APP_API_KEY')) {
    warnings.push('APP_API_KEY is no longer used; application access is controlled by the network boundary.');
  }
  const baseUrlRaw = str(env, 'D365_BASE_URL', str(env, 'D365_URL'));
  const configuredScope = str(env, 'D365_SCOPE');
  let baseUrl = '';
  if (baseUrlRaw) {
    try {
      baseUrl = normaliseD365BaseUrl(baseUrlRaw);
    } catch (error) {
      throw new Error(`Invalid D365_BASE_URL: ${(error as Error).message}`);
    }
    if (isD365UrlPlaceholder(baseUrlRaw)) {
      const inferredBaseUrl = d365BaseUrlFromScope(configuredScope);
      if (inferredBaseUrl) {
        baseUrl = inferredBaseUrl;
        warnings.push(
          'D365_BASE_URL is a template placeholder; using the Dynamics 365 origin from D365_SCOPE. Set D365_BASE_URL explicitly to confirm the environment.',
        );
      } else {
        baseUrl = '';
        warnings.push(
          'D365_BASE_URL is still a template placeholder. Set the real Dynamics 365 environment URL; ERP access is disabled.',
        );
      }
    }
  } else {
    warnings.push('D365_BASE_URL is not configured; ERP calls will fail until it is set.');
  }

  const clientId = str(env, 'D365_CLIENT_ID');
  const clientSecret = str(env, 'D365_CLIENT_SECRET');
  const staticToken = str(env, 'D365_TOKEN');
  if (!clientId || !clientSecret) {
    if (staticToken) {
      warnings.push(
        'Using legacy static D365_TOKEN. Prefer D365_CLIENT_ID/D365_CLIENT_SECRET so tokens refresh automatically.',
      );
    } else {
      warnings.push(
        'No D365 credentials configured. Set D365_CLIENT_ID/D365_CLIENT_SECRET (recommended) or D365_TOKEN.',
      );
    }
  }

  const tenantId = str(env, 'D365_TENANT_ID');
  const configuredTokenUrl = str(env, 'D365_TOKEN_URL');
  const derivedTokenUrl = tenantId
    ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
    : undefined;
  let tokenUrl = configuredTokenUrl || derivedTokenUrl;
  if (configuredTokenUrl === tenantId && tenantId) {
    tokenUrl = derivedTokenUrl;
    warnings.push(
      'D365_TOKEN_URL contains the tenant ID instead of a URL; deriving the Microsoft token endpoint from D365_TENANT_ID.',
    );
  } else if (configuredTokenUrl) {
    let parsedTokenUrl: URL;
    try {
      parsedTokenUrl = new URL(configuredTokenUrl);
    } catch {
      throw new Error(
        'Invalid D365_TOKEN_URL: set an absolute HTTPS token endpoint or leave it empty to derive from D365_TENANT_ID.',
      );
    }
    if (parsedTokenUrl.protocol !== 'https:' || parsedTokenUrl.username || parsedTokenUrl.password) {
      throw new Error(
        'Invalid D365_TOKEN_URL: it must be an HTTPS URL without embedded credentials.',
      );
    }
  }

  let scope = configuredScope;
  if (!scope && baseUrl) {
    scope = `${new URL(baseUrl).origin}${DEFAULT_D365_SCOPE_SUFFIX}`;
  } else if (scope && baseUrl) {
    const expectedScope = `${new URL(baseUrl).origin}${DEFAULT_D365_SCOPE_SUFFIX}`;
    if (scope !== expectedScope) {
      warnings.push(
        'D365_SCOPE does not match the D365_BASE_URL origin. Verify the audience or leave D365_SCOPE empty to derive it.',
      );
    }
  } else if (scope && !baseUrl) {
    warnings.push(
      'D365_SCOPE is set but D365_BASE_URL is missing or a template placeholder; clear or verify the scope after setting the real environment URL.',
    );
  }

  const aiKey = str(env, 'GROQ_API_KEY');
  if (!aiKey) {
    warnings.push('GROQ_API_KEY is not configured; chat requests will return a configuration error.');
  }
  if (!baseUrl) {
    // Already warned above.
  }

  const cacheDir = path.resolve(str(env, 'METADATA_CACHE_DIR', 'data'));
  const conversationStore = str(env, 'CONVERSATION_STORE', 'file').toLowerCase();
  if (conversationStore !== 'file' && conversationStore !== 'memory') {
    warnings.push(`Unknown CONVERSATION_STORE "${conversationStore}"; falling back to "file".`);
  }

  const config: AppConfig = {
    env: str(env, 'NODE_ENV', 'development'),
    port: clamp(int(env, 'PORT', 3000), 1, 65535),
    logLevel: (str(env, 'LOG_LEVEL', 'info') as LogLevel) ?? 'info',
    requestBodyLimit: str(env, 'REQUEST_BODY_LIMIT', '128kb'),
    trustProxy: bool(env, 'TRUST_PROXY', false),
    app: {
      trustUserHeader: bool(env, 'APP_TRUST_USER_HEADER', false),
    },
    rateLimit: {
      windowMs: clamp(int(env, 'RATE_LIMIT_WINDOW_MS', 60_000), 1_000, 3_600_000),
      max: clamp(int(env, 'RATE_LIMIT_MAX', 90), 1, 100_000),
      chatMax: clamp(int(env, 'RATE_LIMIT_CHAT_MAX', 20), 1, 10_000),
    },
    d365: {
      baseUrl,
      tokenUrl,
      clientId: clientId || undefined,
      clientSecret: clientSecret || undefined,
      scope: scope || undefined,
      staticToken: staticToken || undefined,
      requestTimeoutMs: clamp(int(env, 'D365_REQUEST_TIMEOUT_MS', 60_000), 1_000, 300_000),
      pageSize: clamp(int(env, 'D365_PAGE_SIZE', 500), 1, 5_000),
      analyticsMaxRows: clamp(int(env, 'D365_ANALYTICS_MAX_ROWS', 5_000), 1, 100_000),
      maxResponseBytes: clamp(int(env, 'D365_MAX_RESPONSE_BYTES', 10 * 1024 * 1024), 64 * 1024, 200 * 1024 * 1024),
      includeCount: bool(env, 'D365_INCLUDE_COUNT', true),
      entityAllowlist: list(env, 'D365_ENTITY_ALLOWLIST'),
      entityDenylist: list(env, 'D365_ENTITY_DENYLIST'),
      fieldAllowlist: list(env, 'D365_FIELD_ALLOWLIST'),
      fieldDenylist: list(env, 'D365_FIELD_DENYLIST'),
    },
    ai: {
      apiKey: aiKey || undefined,
      baseUrl: str(env, 'GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
      model: str(env, 'GROQ_MODEL', 'openai/gpt-oss-120b'),
      temperature: Math.min(2, Math.max(0, Number(str(env, 'GROQ_TEMPERATURE', '0.2')) || 0.2)),
      timeoutMs: clamp(int(env, 'GROQ_TIMEOUT_MS', 90_000), 5_000, 300_000),
      maxCompletionTokens: clamp(int(env, 'GROQ_MAX_COMPLETION_TOKENS', 1_024), 256, 8_192),
      maxToolIterations: clamp(int(env, 'AI_MAX_TOOL_ITERATIONS', 5), 1, 12),
      maxResultRows: clamp(int(env, 'AI_MAX_RESULT_ROWS', 100), 1, 1_000),
      maxToolResultRows: clamp(int(env, 'AI_MAX_TOOL_RESULT_ROWS', 20), 1, 500),
      maxHistoryMessages: clamp(int(env, 'AI_MAX_HISTORY_MESSAGES', 6), 0, 100),
      maxContextChars: clamp(int(env, 'AI_MAX_CONTEXT_CHARS', 24_000), 4_000, 200_000),
      maxSchemaFields: clamp(int(env, 'AI_MAX_SCHEMA_FIELDS', 60), 1, 1_000),
      maxGroups: clamp(int(env, 'AI_MAX_GROUPS', 50), 1, 500),
      enableReadOnly: bool(env, 'AI_ENABLE_READ_ONLY', true),
    },
    conversations: {
      store: conversationStore === 'memory' ? 'memory' : 'file',
      filePath: path.resolve(str(env, 'CONVERSATION_FILE', 'data/conversations.json')),
      maxPerUser: clamp(int(env, 'CONVERSATION_MAX_PER_USER', 100), 1, 10_000),
      maxMessages: clamp(int(env, 'CONVERSATION_MAX_MESSAGES', 200), 2, 2_000),
      retentionDays: clamp(int(env, 'CONVERSATION_RETENTION_DAYS', 30), 1, 3_650),
    },
    metadata: {
      cacheTtlMs: clamp(int(env, 'AI_METADATA_CACHE_TTL', 86_400), 0, 31_536_000) * 1_000,
      cacheDir,
      maxBytes: clamp(int(env, 'METADATA_MAX_BYTES', 128 * 1024 * 1024), 1024 * 1024, 512 * 1024 * 1024),
    },
    auditLogFile: str(env, 'AUDIT_LOG_FILE') || undefined,
    warnings,
  };

  if (!config.ai.enableReadOnly) {
    warnings.push('AI_ENABLE_READ_ONLY=false is ignored: this application is always read-only.');
    config.ai.enableReadOnly = true;
  }

  return config;
}
