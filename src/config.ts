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
  /** Optional legal entity (dataAreaId) used to scope every ERP data request. */
  dataArea?: string;
  pageSize: number;
  analyticsMaxRows: number;
  maxResponseBytes: number;
  includeCount: boolean;
  entityAllowlist: string[];
  entityDenylist: string[];
  fieldAllowlist: string[];
  fieldDenylist: string[];
}

/**
 * AI is local-only: a single Ollama provider on the loopback interface.
 * Cloud provider keys, URLs and fallback lists are deliberately not read.
 */
export interface AIConfig {
  provider: 'ollama';
  baseUrl: string;
  model: string;
  /** Human-readable GGUF name shown in the UI; does not affect inference. */
  modelLabel: string;
  /** Configured local model profiles; only the active entry is ever loaded. */
  modelRegistry: LocalModelEntry[];
  /** Model name currently in use from the registry. */
  activeModel: string;
  /** Kept for the existing health-status contract; always a single local entry. */
  providers: AIProviderConfig[];
  primaryProvider: 'ollama';
  providerOrder: ['ollama'];
  fallbackEnabled: false;
  providerCooldownMs: number;
  providerMaxCooldownMs: number;
  temperature: number;
  timeoutMs: number;
  numCtx: number;
  thinking: boolean;
  maxPromptChars: number;
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

export type AITaskName =
  | 'production_analysis'
  | 'manufacturing_efficiency_analysis'
  | 'waste_defect_detection'
  | 'root_cause_analysis'
  | 'general_question'
  | 'data_summarization';

export interface AIProviderConfig {
  name: 'ollama';
  baseUrl: string;
  model: string;
  priority: number;
  contextWindow: number;
  supportsTools: true;
  tasks: AITaskName[];
  freeTier: 'verified';
}

/**
 * A local model profile. Multiple profiles may be configured for future
 * task-specific routing, but exactly one is active and loaded at a time.
 * No profile can point to a cloud endpoint.
 */
export interface LocalModelEntry {
  model: string;
  label: string;
  /** Responsibility this profile is intended for; informational only. */
  role: string;
  enabled: boolean;
  timeoutMs: number;
  temperature: number;
  contextWindow: number;
  supportsTools: boolean;
  /** Priority among local profiles if a future run selects another one. */
  priority: number;
  tasks: AITaskName[];
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

const LEGACY_CLOUD_AI_VARS = [
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'CEREBRAS_API_KEY',
  'SAMBANOVA_API_KEY',
  'OPENROUTER_API_KEY',
  'HUGGINGFACE_API_KEY',
  'AI_FALLBACK_PROVIDERS',
  'AI_PRIMARY_PROVIDER',
  'AI_PROVIDER_ORDER',
  'AI_FALLBACK_ENABLED',
];

function warnAboutLegacyAIConfig(env: EnvLike, warnings: string[]): void {
  const present = LEGACY_CLOUD_AI_VARS.filter((name) => str(env, name) !== '');
  if (present.length > 0) {
    warnings.push(
      `Ignoring cloud AI settings (${present.join(', ')}). Ollama is the only AI inference provider.`,
    );
  }
  if (str(env, 'AI_PROVIDER') && str(env, 'AI_PROVIDER').toLowerCase() !== 'ollama') {
    warnings.push(
      `AI_PROVIDER="${str(env, 'AI_PROVIDER')}" is ignored; Ollama is the only supported AI provider.`,
    );
  }
}

/** Resolve and strictly validate the loopback-only Ollama endpoint. */
export function ollamaBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('OLLAMA_BASE_URL must be an absolute URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !loopback) {
    throw new Error('OLLAMA_BASE_URL must point to a loopback Ollama daemon (http://127.0.0.1:11434).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('OLLAMA_BASE_URL must not contain credentials, a query string or a fragment.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const ALL_AI_TASKS: AITaskName[] = [
  'production_analysis',
  'manufacturing_efficiency_analysis',
  'waste_defect_detection',
  'root_cause_analysis',
  'general_question',
  'data_summarization',
];

function validModelName(value: string, source: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error(`${source} must contain only letters, digits, dots, underscores, colons or hyphens.`);
  }
  return value;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? clamp(Math.trunc(numeric), min, max) : fallback;
}

/**
 * Parses the optional local model registry. Profiles only describe loopback
 * Ollama models; they never introduce a cloud endpoint or a second running
 * inference process.
 */
function modelRegistryFromEnv(env: EnvLike, warnings: string[]): LocalModelEntry[] {
  const fallbackModel = validModelName(str(env, 'OLLAMA_MODEL', 'd365-local'), 'OLLAMA_MODEL');
  const fallbackCtx = clamp(int(env, 'OLLAMA_NUM_CTX', 32_768), 2_048, 262_144);
  const raw = str(env, 'AI_MODEL_REGISTRY');
  if (!raw) {
    return [
      {
        model: fallbackModel,
        label: str(env, 'OLLAMA_MODEL_LABEL') || fallbackModel,
        role: 'generalist',
        enabled: true,
        timeoutMs: clamp(int(env, 'OLLAMA_TIMEOUT', 120_000), 1_000, 600_000),
        temperature: Math.min(2, Math.max(0, Number(str(env, 'OLLAMA_TEMPERATURE', '0.2')) || 0.2)),
        contextWindow: fallbackCtx,
        supportsTools: true,
        priority: 0,
        tasks: [...ALL_AI_TASKS],
      },
    ];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI_MODEL_REGISTRY must be a JSON array of local model profiles.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 8) {
    throw new Error('AI_MODEL_REGISTRY must contain between 1 and 8 local model profiles.');
  }
  const seen = new Set<string>();
  const entries: LocalModelEntry[] = [];
  for (const [index, item] of parsed.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`AI_MODEL_REGISTRY[${index}] must be an object.`);
    }
    const record = item as Record<string, unknown>;
    const modelValue = typeof record.model === 'string' ? record.model.trim() : '';
    if (!modelValue) throw new Error(`AI_MODEL_REGISTRY[${index}].model is required.`);
    const model = validModelName(modelValue, `AI_MODEL_REGISTRY[${index}].model`);
    if (seen.has(model)) throw new Error(`AI_MODEL_REGISTRY contains duplicate model "${model}".`);
    seen.add(model);
    const labelValue = typeof record.label === 'string' ? record.label.trim().slice(0, 100) : '';
    const roleValue = typeof record.role === 'string' ? record.role.trim().slice(0, 100) : '';
    const tasks = Array.isArray(record.tasks)
      ? record.tasks.filter((task): task is AITaskName => ALL_AI_TASKS.includes(task as AITaskName))
      : [...ALL_AI_TASKS];
    entries.push({
      model,
      label: labelValue || model,
      role: roleValue || 'generalist',
      enabled: record.enabled === undefined ? true : record.enabled === true,
      timeoutMs: clampNumber(record.timeoutMs, 1_000, 600_000, clamp(int(env, 'OLLAMA_TIMEOUT', 120_000), 1_000, 600_000)),
      temperature: (() => {
        const raw = typeof record.temperature === 'number' ? record.temperature : Number(record.temperature);
        const fallback = Number(str(env, 'OLLAMA_TEMPERATURE', '0.2')) || 0.2;
        return Number.isFinite(raw) ? Math.min(2, Math.max(0, raw)) : fallback;
      })(),
      contextWindow: clampNumber(record.contextWindow, 2_048, 262_144, fallbackCtx),
      supportsTools: record.supportsTools === undefined ? true : record.supportsTools === true,
      priority: clampNumber(record.priority, 0, 100, index),
      tasks: tasks.length > 0 ? tasks : [...ALL_AI_TASKS],
    });
  }
  entries.sort((a, b) => a.priority - b.priority);
  const enabled = entries.filter((entry) => entry.enabled);
  if (enabled.length === 0) throw new Error('AI_MODEL_REGISTRY has no enabled local model profiles.');
  warnings.push(
    `Loaded ${enabled.length} enabled local model profile(s); only the active model is loaded for inference.`,
  );
  return enabled;
}

function configuredOllamaProvider(
  env: EnvLike,
  model: string,
  contextWindow: number,
): AIProviderConfig {
  const baseUrl = ollamaBaseUrl(str(env, 'OLLAMA_BASE_URL', 'http://127.0.0.1:11434'));
  return {
    name: 'ollama',
    baseUrl,
    model,
    priority: 0,
    contextWindow,
    supportsTools: true,
    tasks: [...ALL_AI_TASKS],
    freeTier: 'verified',
  };
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

  warnAboutLegacyAIConfig(env, warnings);
  const registry = modelRegistryFromEnv(env, warnings);
  const activeRaw = str(env, 'AI_ACTIVE_MODEL') || str(env, 'OLLAMA_MODEL') || registry[0]!.model;
  const activeEntry = registry.find((entry) => entry.model === activeRaw);
  if (!activeEntry) {
    if (str(env, 'AI_ACTIVE_MODEL')) {
      throw new Error(`AI_ACTIVE_MODEL "${activeRaw}" is not an enabled entry in AI_MODEL_REGISTRY.`);
    }
    warnings.push(`OLLAMA_MODEL="${activeRaw}" is not in AI_MODEL_REGISTRY; using "${registry[0]!.model}".`);
  }
  const active = activeEntry ?? registry[0]!;
  const ollamaProvider = configuredOllamaProvider(env, active.model, active.contextWindow);
  // Exactly one AI provider: the local Ollama daemon. No cloud fallback path.
  const providers: AIProviderConfig[] = [ollamaProvider];

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
      ...(() => {
        const value = str(env, 'D365_DATA_AREA').trim();
        return value && /^[A-Za-z0-9_-]{1,32}$/.test(value) ? { dataArea: value } : {};
      })(),
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
      provider: 'ollama',
      baseUrl: ollamaProvider.baseUrl,
      model: active.model,
      modelLabel:
        str(env, 'OLLAMA_MODEL_LABEL') ||
        (str(env, 'AI_MODEL_REGISTRY') ? active.label : 'AI assistant'),
      modelRegistry: registry,
      activeModel: active.model,
      providers,
      primaryProvider: 'ollama',
      providerOrder: ['ollama'],
      fallbackEnabled: false,
      providerCooldownMs: clamp(int(env, 'AI_PROVIDER_COOLDOWN_MS', 5_000), 1_000, 300_000),
      providerMaxCooldownMs: clamp(int(env, 'AI_PROVIDER_MAX_COOLDOWN_MS', 300_000), 10_000, 3_600_000),
      temperature: active.temperature,
      timeoutMs: active.timeoutMs,
      numCtx: active.contextWindow,
      thinking: bool(env, 'OLLAMA_THINKING', false),
      maxPromptChars: clamp(int(env, 'OLLAMA_MAX_PROMPT_CHARS', 150_000), 4_000, 1_000_000),
      maxCompletionTokens: clamp(int(env, 'OLLAMA_MAX_COMPLETION_TOKENS', 1_024), 256, 8_192),
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
