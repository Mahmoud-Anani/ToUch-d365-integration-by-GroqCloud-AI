import path from 'node:path';
import dotenv from 'dotenv';
import { generateSessionSecret } from './auth/session';

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
  providers: AIProviderConfig[];
  primaryProvider: string;
  providerOrder: string[];
  fallbackEnabled: boolean;
  providerCooldownMs: number;
  providerMaxCooldownMs: number;
  temperature: number;
  timeoutMs: number;
  maxToolIterations: number;
  maxCompletionTokens: number;
  maxTurnCompletionTokens: number;
  maxResultRows: number;
  maxToolResultRows: number;
  maxHistoryMessages: number;
  maxContextChars: number;
  maxSchemaFields: number;
  maxGroups: number;
  enableReadOnly: boolean;
}

export interface AIProviderConfig {
  name: string;
  apiKey?: string;
  allowUnauthenticated?: boolean;
  baseUrl: string;
  model: string;
  priority: number;
  contextWindow?: number;
  supportsTools: boolean;
  tasks: Array<
    | 'production_analysis'
    | 'manufacturing_efficiency_analysis'
    | 'waste_defect_detection'
    | 'root_cause_analysis'
    | 'general_question'
    | 'data_summarization'
  >;
  freeTier: 'verified' | 'unknown' | 'paid';
  maxTokenParameter: 'max_tokens' | 'max_completion_tokens';
}

export interface ConversationConfig {
  store: 'file' | 'memory';
  filePath: string;
  maxPerUser: number;
  maxMessages: number;
  retentionDays: number;
}

export interface AuthConfig {
  usersFile: string;
  sessionSecret: string;
  sessionTtlMs: number;
  cookieName: string;
  cookieSecure: boolean;
  loginWindowMs: number;
  loginMaxAttempts: number;
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
  auth: AuthConfig;
  https: {
    keyFile?: string;
    certFile?: string;
  };
  metadata: {
    cacheTtlMs: number;
    cacheDir: string;
    maxBytes: number;
  };
  deviceConnections: {
    sessionTtlMs: number;
    lanIp?: string;
    maxSessionsPerUser: number;
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

function aiFallbackProviders(env: EnvLike): AIProviderConfig[] {
  const raw = str(env, 'AI_FALLBACK_PROVIDERS');
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('AI_FALLBACK_PROVIDERS must be a JSON array of provider configurations.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('AI_FALLBACK_PROVIDERS must be a JSON array of provider configurations.');
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`AI_FALLBACK_PROVIDERS entry ${index + 1} must be an object.`);
    }
    const item = entry as Record<string, unknown>;
    const apiKey = typeof item.apiKey === 'string' ? item.apiKey.trim() : '';
    const model = typeof item.model === 'string' ? item.model.trim() : '';
    const rawBaseUrl = typeof item.baseUrl === 'string' ? item.baseUrl.trim() : '';
    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : `fallback-${index + 1}`;
    if (!model || !rawBaseUrl) {
      throw new Error(`AI_FALLBACK_PROVIDERS entry ${index + 1} requires baseUrl and model.`);
    }

    let url: URL;
    try {
      url = new URL(rawBaseUrl);
    } catch {
      throw new Error(`AI_FALLBACK_PROVIDERS entry ${index + 1} baseUrl must be an absolute URL.`);
    }
    const localHttp =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');
    if (
      (url.protocol !== 'https:' && !localHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `AI_FALLBACK_PROVIDERS entry ${index + 1} baseUrl must use HTTPS and contain no credentials, query, or fragment.`,
      );
    }
    if (!apiKey && !localHttp) {
      throw new Error(
        `AI_FALLBACK_PROVIDERS entry ${index + 1} requires an API key unless it uses a local HTTP endpoint.`,
      );
    }
    const taskValues = Array.isArray(item.tasks) ? item.tasks : [];
    const tasks = taskValues.filter(
      (task): task is AIProviderConfig['tasks'][number] =>
        task === 'production_analysis' ||
        task === 'manufacturing_efficiency_analysis' ||
        task === 'waste_defect_detection' ||
        task === 'root_cause_analysis' ||
        task === 'general_question' ||
        task === 'data_summarization',
    );
    const contextWindow =
      typeof item.contextWindow === 'number' && Number.isSafeInteger(item.contextWindow)
        ? clamp(item.contextWindow, 256, 2_000_000)
        : undefined;
    const freeTier =
      item.freeTier === 'verified' || item.freeTier === 'paid' ? item.freeTier : 'unknown';
    return {
      name,
      apiKey: apiKey || undefined,
      allowUnauthenticated: localHttp,
      baseUrl: rawBaseUrl.replace(/\/+$/, ''),
      model,
      priority: typeof item.priority === 'number' ? item.priority : 100 + index,
      ...(contextWindow ? { contextWindow } : {}),
      supportsTools: item.supportsTools === true,
      tasks: tasks.length > 0 ? tasks : [
        'production_analysis',
        'manufacturing_efficiency_analysis',
        'waste_defect_detection',
        'root_cause_analysis',
        'general_question',
        'data_summarization',
      ],
      freeTier,
      maxTokenParameter: item.maxTokenParameter === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens',
    };
  });
}

function configuredAIProviders(
  env: EnvLike,
  fallbackProviders: AIProviderConfig[],
  providerOrder: string[],
): AIProviderConfig[] {
  const definitions = [
    { name: 'groq', apiKey: 'GROQ_API_KEY', model: 'GROQ_MODEL', url: 'GROQ_BASE_URL', tools: 'GROQ_SUPPORTS_TOOLS', defaultTools: true, defaultUrl: 'https://api.groq.com/openai/v1', tokenParameter: 'max_completion_tokens' as const },
    { name: 'gemini', apiKey: 'GEMINI_API_KEY', model: 'GEMINI_MODEL', url: 'GEMINI_BASE_URL', tools: 'GEMINI_SUPPORTS_TOOLS', defaultTools: false, defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', tokenParameter: 'max_tokens' as const },
    { name: 'cerebras', apiKey: 'CEREBRAS_API_KEY', model: 'CEREBRAS_MODEL', url: 'CEREBRAS_BASE_URL', tools: 'CEREBRAS_SUPPORTS_TOOLS', defaultTools: false, defaultUrl: 'https://api.cerebras.ai/v1', tokenParameter: 'max_completion_tokens' as const },
    { name: 'sambanova', apiKey: 'SAMBANOVA_API_KEY', model: 'SAMBANOVA_MODEL', url: 'SAMBANOVA_BASE_URL', tools: 'SAMBANOVA_SUPPORTS_TOOLS', defaultTools: false, defaultUrl: 'https://api.sambanova.ai/v1', tokenParameter: 'max_tokens' as const },
    { name: 'openrouter', apiKey: 'OPENROUTER_API_KEY', model: 'OPENROUTER_MODEL', url: 'OPENROUTER_BASE_URL', tools: 'OPENROUTER_SUPPORTS_TOOLS', defaultTools: false, defaultUrl: 'https://openrouter.ai/api/v1', tokenParameter: 'max_tokens' as const },
    { name: 'huggingface', apiKey: 'HUGGINGFACE_API_KEY', model: 'HUGGINGFACE_MODEL', url: 'HUGGINGFACE_BASE_URL', tools: 'HUGGINGFACE_SUPPORTS_TOOLS', defaultTools: false, defaultUrl: 'https://router.huggingface.co/v1', tokenParameter: 'max_tokens' as const },
  ];
  const providers: AIProviderConfig[] = [];

  for (const definition of definitions) {
    const apiKey = str(env, definition.apiKey);
    const model = str(
      env,
      definition.model,
      definition.name === 'groq' ? 'openai/gpt-oss-120b' : '',
    );
    if (!apiKey) continue;
    if (!model) {
      throw new Error(`${definition.model} is required when ${definition.apiKey} is configured.`);
    }
    const baseUrl = str(env, definition.url, definition.defaultUrl).replace(/\/+$/, '');
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch {
      throw new Error(`${definition.url} must be an absolute HTTPS URL.`);
    }
    const localHttp =
      parsedBaseUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsedBaseUrl.hostname);
    if (
      (parsedBaseUrl.protocol !== 'https:' && !localHttp) ||
      parsedBaseUrl.username ||
      parsedBaseUrl.password ||
      parsedBaseUrl.search ||
      parsedBaseUrl.hash
    ) {
      throw new Error(`${definition.url} must use HTTPS without embedded credentials or query values.`);
    }
    providers.push({
      name: definition.name,
      apiKey,
      model,
      baseUrl,
      allowUnauthenticated: localHttp,
      priority: providerOrder.indexOf(definition.name) === -1
        ? providerOrder.length + providers.length
        : providerOrder.indexOf(definition.name),
      supportsTools: bool(env, definition.tools, definition.defaultTools),
      tasks: [
        'production_analysis',
        'manufacturing_efficiency_analysis',
        'waste_defect_detection',
        'root_cause_analysis',
        'general_question',
        'data_summarization',
      ],
      freeTier: 'unknown',
      maxTokenParameter: definition.tokenParameter,
    });
  }

  for (const fallback of fallbackProviders) {
    providers.push({
      ...fallback,
      allowUnauthenticated: fallback.allowUnauthenticated ?? false,
      priority:
        providerOrder.indexOf(fallback.name) === -1
          ? fallback.priority
          : providerOrder.indexOf(fallback.name),
    });
  }

  return providers.sort((left, right) => left.priority - right.priority);
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
  const fallbackProviders = aiFallbackProviders(env);
  const providerOrderRaw = list(env, 'AI_PROVIDER_ORDER');
  const providerOrder = [
    str(env, 'AI_PRIMARY_PROVIDER', 'groq').toLowerCase(),
    ...(
      providerOrderRaw.length > 0
        ? providerOrderRaw.map((provider) => provider.toLowerCase())
        : ['groq', 'gemini', 'cerebras', 'sambanova', 'openrouter', 'huggingface', 'ollama']
    ),
  ].filter((provider, index, providers) => providers.indexOf(provider) === index);
  const providers = configuredAIProviders(env, fallbackProviders, providerOrder);
  if (providers.length === 0) {
    warnings.push(
      'No AI provider is configured; set a provider API key/model or configure AI_FALLBACK_PROVIDERS.',
    );
  } else if (!providers.some((provider) => provider.name === providerOrder[0])) {
    warnings.push(
      `AI_PRIMARY_PROVIDER "${providerOrder[0]}" is not configured; using "${providers[0]!.name}" instead.`,
    );
  }
  if (!baseUrl) {
    // Already warned above.
  }

  const cacheDir = path.resolve(str(env, 'METADATA_CACHE_DIR', 'data'));
  const conversationStore = str(env, 'CONVERSATION_STORE', 'file').toLowerCase();
  if (conversationStore !== 'file' && conversationStore !== 'memory') {
    warnings.push(`Unknown CONVERSATION_STORE "${conversationStore}"; falling back to "file".`);
  }

  const nodeEnv = str(env, 'NODE_ENV', 'development');
  let sessionSecret = str(env, 'SESSION_SECRET');
  if (!sessionSecret) {
    if (nodeEnv === 'production') {
      throw new Error('SESSION_SECRET is required in production and must contain at least 32 characters.');
    }
    sessionSecret = generateSessionSecret();
    warnings.push(
      'SESSION_SECRET is not set; using an ephemeral development secret. Sessions will be invalidated when the server restarts.',
    );
  } else if (sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  const cookieName = str(env, 'SESSION_COOKIE_NAME', 'tez_session');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(cookieName)) {
    throw new Error('SESSION_COOKIE_NAME must contain only letters, digits, dots, underscores, or hyphens.');
  }

  const config: AppConfig = {
    env: nodeEnv,
    port: clamp(int(env, 'PORT', 3000), 1, 65535),    logLevel: (str(env, 'LOG_LEVEL', 'info') as LogLevel) ?? 'info',
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
      providers,
      primaryProvider: providers[0]?.name ?? providerOrder[0] ?? 'groq',
      providerOrder,
      fallbackEnabled: bool(env, 'AI_FALLBACK_ENABLED', true),
      providerCooldownMs: clamp(int(env, 'AI_PROVIDER_COOLDOWN_MS', 5_000), 1_000, 300_000),
      providerMaxCooldownMs: clamp(int(env, 'AI_PROVIDER_MAX_COOLDOWN_MS', 300_000), 10_000, 3_600_000),
      temperature: Math.min(2, Math.max(0, Number(str(env, 'GROQ_TEMPERATURE', '0.2')) || 0.2)),
      timeoutMs: clamp(
        int(env, 'AI_REQUEST_TIMEOUT', int(env, 'GROQ_TIMEOUT_MS', 30_000)),
        1_000,
        300_000,
      ),
      maxCompletionTokens: clamp(int(env, 'GROQ_MAX_COMPLETION_TOKENS', 1_024), 256, 8_192),
      maxTurnCompletionTokens: clamp(
        int(env, 'AI_MAX_TURN_COMPLETION_TOKENS', 4_096),
        512,
        32_768,
      ),
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
    auth: {
      usersFile: path.resolve(str(env, 'USERS_FILE', 'config/users.json')),
      sessionSecret,
      sessionTtlMs: clamp(int(env, 'SESSION_TTL_MS', 8 * 60 * 60 * 1_000), 5 * 60 * 1_000, 30 * 24 * 60 * 60 * 1_000),
      cookieName,
      cookieSecure: bool(env, 'SESSION_COOKIE_SECURE', nodeEnv === 'production' || Boolean(str(env, 'HTTPS_KEY_FILE'))),
      loginWindowMs: clamp(int(env, 'LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1_000), 10_000, 24 * 60 * 60 * 1_000),
      loginMaxAttempts: clamp(int(env, 'LOGIN_RATE_LIMIT_MAX', 10), 1, 1_000),
    },
    https: {
      keyFile: str(env, 'HTTPS_KEY_FILE') ? path.resolve(str(env, 'HTTPS_KEY_FILE')) : undefined,
      certFile: str(env, 'HTTPS_CERT_FILE') ? path.resolve(str(env, 'HTTPS_CERT_FILE')) : undefined,
    },
    metadata: {
      cacheTtlMs: clamp(int(env, 'AI_METADATA_CACHE_TTL', 86_400), 0, 31_536_000) * 1_000,
      cacheDir,
      maxBytes: clamp(int(env, 'METADATA_MAX_BYTES', 128 * 1024 * 1024), 1024 * 1024, 512 * 1024 * 1024),
    },
    deviceConnections: {
      sessionTtlMs: clamp(int(env, 'DEVICE_CONNECTION_SESSION_TTL_MS', 5 * 60 * 1_000), 60_000, 60 * 60 * 1_000),
      lanIp: privateIpv4(str(env, 'DEVICE_CONNECTION_LAN_IP')),
      maxSessionsPerUser: clamp(int(env, 'DEVICE_CONNECTION_MAX_SESSIONS_PER_USER', 3), 1, 10),
    },
    auditLogFile: str(env, 'AUDIT_LOG_FILE') || undefined,
    warnings,
  };

  if (!config.ai.enableReadOnly) {
    warnings.push('AI_ENABLE_READ_ONLY=false is ignored: this application is always read-only.');
    config.ai.enableReadOnly = true;
  }

  if (Boolean(config.https.keyFile) !== Boolean(config.https.certFile)) {
    throw new Error('Set both HTTPS_KEY_FILE and HTTPS_CERT_FILE to enable local HTTPS.');
  }

  return config;
}

function privateIpv4(raw: string): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split('.').map(Number);
  const isIpv4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const isPrivate = isIpv4 && (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
  if (!isPrivate) throw new Error('DEVICE_CONNECTION_LAN_IP must be a private LAN IPv4 address.');
  return raw;
}
