import { describe, expect, it } from 'vitest';
import { createConfig, normaliseD365BaseUrl, ollamaBaseUrl } from '../src/config';
import { testEnv } from './helpers';

describe('normaliseD365BaseUrl', () => {
  it('strips a trailing /data and trailing slashes', () => {
    expect(normaliseD365BaseUrl('https://contoso.operations.dynamics.com/data/')).toBe(
      'https://contoso.operations.dynamics.com',
    );
    expect(normaliseD365BaseUrl('https://contoso.operations.dynamics.com/onebox/data')).toBe(
      'https://contoso.operations.dynamics.com/onebox',
    );
  });

  it('rejects non-https URLs except localhost', () => {
    expect(() => normaliseD365BaseUrl('http://contoso.example.com')).toThrow(/https/);
    expect(normaliseD365BaseUrl('http://localhost:8080/data')).toBe('http://localhost:8080');
  });
});

describe('ollamaBaseUrl', () => {
  it('accepts loopback HTTP endpoints only', () => {
    expect(ollamaBaseUrl('http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    expect(ollamaBaseUrl('http://localhost:11434/')).toBe('http://localhost:11434');
    expect(() => ollamaBaseUrl('http://192.168.1.10:11434')).toThrow(/loopback/);
    expect(() => ollamaBaseUrl('https://ollama.example.com')).toThrow(/loopback/);
  });

  it('rejects credentials, queries and fragments', () => {
    expect(() => ollamaBaseUrl('http://user@127.0.0.1:11434')).toThrow(/credentials/);
    expect(() => ollamaBaseUrl('http://127.0.0.1:11434/?x=1')).toThrow(/query/);
  });
});

describe('createConfig', () => {
  it('derives the OData scope from the D365 origin', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com/data',
      D365_CLIENT_ID: 'id',
      D365_CLIENT_SECRET: 'secret',
      D365_TOKEN_URL: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
    });
    expect(config.d365.baseUrl).toBe('https://contoso.operations.dynamics.com');
    expect(config.d365.scope).toBe('https://contoso.operations.dynamics.com/.default');
  });

  it('derives the token URL from D365_TENANT_ID', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com',
      D365_CLIENT_ID: 'id',
      D365_CLIENT_SECRET: 'secret',
      D365_TENANT_ID: 'tenant-123',
    });
    expect(config.d365.tokenUrl).toBe(
      'https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token',
    );
  });

  it('derives the token URL when D365_TOKEN_URL was mistakenly set to the tenant ID', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com',
      D365_TENANT_ID: 'tenant-123',
      D365_TOKEN_URL: 'tenant-123',
    });
    expect(config.d365.tokenUrl).toBe(
      'https://login.microsoftonline.com/tenant-123/oauth2/v2.0/token',
    );
    expect(config.warnings.some((warning) => warning.includes('contains the tenant ID'))).toBe(
      true,
    );
  });

  it('rejects malformed or insecure D365 token endpoints', () => {
    expect(() =>
      createConfig({
        D365_TOKEN_URL: 'not-a-token-url',
      }),
    ).toThrow(/absolute HTTPS token endpoint/);
    expect(() =>
      createConfig({
        D365_TOKEN_URL: 'http://login.microsoftonline.com/tenant/token',
      }),
    ).toThrow(/must be an HTTPS URL/);
  });

  it('uses the Dynamics 365 origin from the scope when the base URL is a template placeholder', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://your-environment.operations.dynamics.com',
      D365_SCOPE: 'https://contoso.operations.dynamics.com/.default',
      D365_CLIENT_ID: 'id',
      D365_CLIENT_SECRET: 'secret',
      D365_TENANT_ID: 'tenant-123',
    });
    expect(config.d365.baseUrl).toBe('https://contoso.operations.dynamics.com');
    expect(config.warnings.some((warning) => warning.includes('from D365_SCOPE'))).toBe(true);
  });

  it('disables D365 when a placeholder base URL has no safe D365 scope fallback', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://your-environment.operations.dynamics.com',
      D365_SCOPE: 'https://example.com/.default',
    });
    expect(config.d365.baseUrl).toBe('');
    expect(config.warnings.some((warning) => warning.includes('template placeholder'))).toBe(true);
  });

  it('warns when D365 and credentials are missing (AI stays local-configured)', () => {
    const config = createConfig({});
    expect(config.warnings.some((warning) => warning.includes('D365_BASE_URL'))).toBe(true);
    expect(config.warnings.some((warning) => warning.includes('No D365 credentials'))).toBe(true);
    expect(config.d365.baseUrl).toBe('');
    expect(config.ai.provider).toBe('ollama');
    expect(config.ai.baseUrl).toBe('http://127.0.0.1:11434');
  });

  it('ignores a legacy APP_API_KEY instead of requiring it for users', () => {
    const config = createConfig(testEnv({ APP_API_KEY: 'legacy-application-key' }));
    expect(config.app).toEqual({ trustUserHeader: false });
    expect(config.warnings.some((warning) => warning.includes('APP_API_KEY is no longer used'))).toBe(
      true,
    );
  });

  it('warns when only a legacy static token is used', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com',
      D365_TOKEN: 'static-token',
    });
    expect(config.d365.staticToken).toBe('static-token');
    expect(config.warnings.some((warning) => warning.includes('legacy static D365_TOKEN'))).toBe(true);
  });

  it('clamps unsafe numeric settings to supported ranges', () => {
    const config = createConfig(
      testEnv({
        PORT: '70000',
        RATE_LIMIT_WINDOW_MS: '1',
        RATE_LIMIT_MAX: '0',
        RATE_LIMIT_CHAT_MAX: '99999',
        D365_REQUEST_TIMEOUT_MS: '1',
        D365_PAGE_SIZE: '0',
        D365_ANALYTICS_MAX_ROWS: '999999',
        AI_MAX_GROUPS: '9999',
        AI_MAX_HISTORY_MESSAGES: '-5',
        AI_MAX_RESULT_ROWS: '5000',
        OLLAMA_TIMEOUT: '1',
        OLLAMA_NUM_CTX: '9999999',
        D365_MAX_RESPONSE_BYTES: '1',
        REQUEST_BODY_LIMIT: '64kb',
      }),
    );
    expect(config.port).toBe(65535);
    expect(config.rateLimit.windowMs).toBe(1_000);
    expect(config.rateLimit.max).toBe(1);
    expect(config.rateLimit.chatMax).toBe(10_000);
    expect(config.d365.requestTimeoutMs).toBe(1_000);
    expect(config.d365.pageSize).toBe(1);
    expect(config.d365.analyticsMaxRows).toBe(100_000);
    expect(config.d365.maxResponseBytes).toBe(64 * 1024);
    expect(config.ai.maxGroups).toBe(500);
    expect(config.ai.maxHistoryMessages).toBe(0);
    expect(config.ai.maxResultRows).toBe(1_000);
    expect(config.ai.timeoutMs).toBe(1_000);
    expect(config.ai.numCtx).toBe(262_144);
    expect(config.requestBodyLimit).toBe('64kb');
  });

  it('parses booleans, lists and metadata cache TTL seconds', () => {
    const config = createConfig(
      testEnv({
        TRUST_PROXY: 'yes',
        D365_INCLUDE_COUNT: 'false',
        AI_METADATA_CACHE_TTL: '120',
        D365_ENTITY_ALLOWLIST: 'CustomersV3, Sales*',
        D365_FIELD_DENYLIST: 'Logo, Notes',
      }),
    );
    expect(config.trustProxy).toBe(true);
    expect(config.d365.includeCount).toBe(false);
    expect(config.metadata.cacheTtlMs).toBe(120_000);
    expect(config.d365.entityAllowlist).toEqual(['CustomersV3', 'Sales*']);
    expect(config.d365.fieldDenylist).toEqual(['Logo', 'Notes']);
  });

  it('accepts only a safe legal-entity identifier for company scoping', () => {
    const scoped = createConfig(testEnv({ D365_DATA_AREA: 'usmf' }));
    expect(scoped.d365.dataArea).toBe('usmf');
    const unsafe = createConfig(testEnv({ D365_DATA_AREA: "usmf' or 1=1--" }));
    expect(unsafe.d365.dataArea).toBeUndefined();
  });

  it('uses bounded local-model defaults and clamps completion tokens', () => {
    const config = createConfig(testEnv());
    expect(config.ai.maxCompletionTokens).toBe(1_024);
    expect(config.ai.maxTurnCompletionTokens).toBe(4_096);
    expect(config.ai.maxHistoryMessages).toBe(6);
    expect(config.ai.maxToolResultRows).toBe(20);
    expect(config.ai.maxSchemaFields).toBe(60);
    expect(config.ai.timeoutMs).toBe(120_000);
    expect(config.ai.thinking).toBe(false);

    const configured = createConfig(testEnv({ OLLAMA_MAX_COMPLETION_TOKENS: '9000' }));
    expect(configured.ai.maxCompletionTokens).toBe(8_192);
  });

  it('registers exactly one local provider and never enables fallback', () => {
    const config = createConfig(testEnv());
    expect(config.ai.providers).toHaveLength(1);
    expect(config.ai.providers[0]).toMatchObject({
      name: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'd365-local',
      supportsTools: true,
      freeTier: 'verified',
    });
    expect(config.ai.primaryProvider).toBe('ollama');
    expect(config.ai.providerOrder).toEqual(['ollama']);
    expect(config.ai.fallbackEnabled).toBe(false);
    expect(config.ai.enableReadOnly).toBe(true);
  });

  it('loads a configurable local model registry but runs only the active model', () => {
    const registry = [
      {
        model: 'd365-local',
        label: 'General assistant',
        role: 'generalist',
        priority: 1,
        temperature: 0.2,
        contextWindow: 32768,
        timeoutMs: 120000,
        supportsTools: true,
        tasks: ['general_question', 'data_summarization'],
      },
      { model: 'd365-analyst', label: 'Analyst', role: 'reasoning', priority: 0, enabled: true },
    ];
    const config = createConfig(
      testEnv({ AI_MODEL_REGISTRY: JSON.stringify(registry), AI_ACTIVE_MODEL: 'd365-local' }),
    );
    expect(config.ai.modelRegistry).toHaveLength(2);
    expect(config.ai.activeModel).toBe('d365-local');
    expect(config.ai.model).toBe('d365-local');
    expect(config.ai.modelLabel).toBe('General assistant');
    expect(config.ai.temperature).toBe(0.2);
    expect(config.ai.providers).toHaveLength(1);
    expect(config.ai.fallbackEnabled).toBe(false);
  });

  it('rejects an active model that is absent or disabled', () => {
    expect(() =>
      createConfig(testEnv({ AI_MODEL_REGISTRY: JSON.stringify([{ model: 'a', enabled: false }]) })),
    ).toThrow(/no enabled/);
    expect(() =>
      createConfig(
        testEnv({
          AI_MODEL_REGISTRY: JSON.stringify([{ model: 'a' }]),
          AI_ACTIVE_MODEL: 'missing',
        }),
      ),
    ).toThrow(/AI_ACTIVE_MODEL/);
  });

  it('ignores and warns about legacy cloud AI settings', () => {
    const config = createConfig(
      testEnv({
        GROQ_API_KEY: 'old-key',
        GEMINI_API_KEY: 'old-key',
        AI_FALLBACK_PROVIDERS: '[{"name":"cloud","baseUrl":"https://api.example.com","model":"m"}]',
        AI_PRIMARY_PROVIDER: 'gemini',
        AI_PROVIDER: 'groq',
      }),
    );
    expect(config.warnings.some((warning) => warning.includes('Ignoring cloud AI settings'))).toBe(true);
    expect(config.warnings.some((warning) => warning.includes('is ignored; Ollama is the only'))).toBe(
      true,
    );
    expect(config.ai.providers.map((provider) => provider.name)).toEqual(['ollama']);
    expect(JSON.stringify(config)).not.toContain('old-key');
  });

  it('rejects a non-loopback Ollama endpoint', () => {
    expect(() => createConfig(testEnv({ OLLAMA_BASE_URL: 'http://10.0.0.5:11434' }))).toThrow(
      /loopback/,
    );
  });

  it('rejects an invalid local model name', () => {
    expect(() => createConfig(testEnv({ OLLAMA_MODEL: 'bad model ../../etc' }))).toThrow(
      /OLLAMA_MODEL/,
    );
  });

  it('forces read-only mode even when disabled in the environment', () => {
    const config = createConfig(testEnv({ AI_ENABLE_READ_ONLY: 'false' }));
    expect(config.ai.enableReadOnly).toBe(true);
    expect(config.warnings.some((warning) => warning.includes('always read-only'))).toBe(true);
  });

  it('falls back to the file conversation store for unknown values', () => {
    const config = createConfig(testEnv({ CONVERSATION_STORE: 'database' }));
    expect(config.conversations.store).toBe('file');
    expect(config.warnings.some((warning) => warning.includes('Unknown CONVERSATION_STORE'))).toBe(
      true,
    );
  });

  it('uses conservative defaults', () => {
    const config = createConfig(testEnv());
    expect(config.ai.model).toBe('d365-local');
    expect(config.ai.baseUrl).toBe('http://127.0.0.1:11434');
    expect(config.ai.enableReadOnly).toBe(true);
    expect(config.d365.pageSize).toBe(500);
    expect(config.conversations.store).toBe('memory');
    expect(config.metadata.cacheTtlMs).toBe(86_400_000);
  });
});
