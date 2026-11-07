import { describe, expect, it } from 'vitest';
import { createConfig, normaliseD365BaseUrl } from '../src/config';
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

describe('createConfig', () => {
  it('derives the OData scope from the D365 origin', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com/data',
      D365_CLIENT_ID: 'id',
      D365_CLIENT_SECRET: 'secret',
      D365_TOKEN_URL: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token',
      GROQ_API_KEY: 'key',
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

  it('warns when the configured OAuth scope does not match the D365 environment', () => {
    const config = createConfig({
      D365_BASE_URL: 'https://contoso.operations.dynamics.com',
      D365_SCOPE: 'https://other.operations.dynamics.com/.default',
    });
    expect(config.warnings.some((warning) => warning.includes('does not match'))).toBe(true);
  });

  it('warns when D365, credentials or Groq are missing', () => {
    const config = createConfig({});
    expect(config.warnings.some((warning) => warning.includes('D365_BASE_URL'))).toBe(true);
    expect(config.warnings.some((warning) => warning.includes('No D365 credentials'))).toBe(true);
    expect(config.warnings.some((warning) => warning.includes('No AI provider is configured'))).toBe(true);
    expect(config.d365.baseUrl).toBe('');
    expect(config.ai.apiKey).toBeUndefined();
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
      GROQ_API_KEY: 'key',
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

  it('uses token-efficient Groq defaults and bounds completion tokens', () => {
    const config = createConfig(testEnv());
    expect(config.ai.maxCompletionTokens).toBe(1_024);
    expect(config.ai.maxTurnCompletionTokens).toBe(4_096);
    expect(config.ai.maxHistoryMessages).toBe(6);
    expect(config.ai.maxToolResultRows).toBe(20);
    expect(config.ai.maxSchemaFields).toBe(60);

    const configured = createConfig(testEnv({ GROQ_MAX_COMPLETION_TOKENS: '9000' }));
    expect(configured.ai.maxCompletionTokens).toBe(8_192);
  });

  it('accepts secure OpenAI-compatible fallback providers', () => {
    const config = createConfig(
      testEnv({
        AI_FALLBACK_PROVIDERS: JSON.stringify([
          {
            name: 'free-tier',
            apiKey: 'fallback-key',
            baseUrl: 'https://api.example.ai/v1/',
            model: 'tool-model',
            supportsTools: true,
          },
        ]),
      }),
    );
    expect(config.ai.providers[1]).toMatchObject({
        name: 'free-tier',
        apiKey: 'fallback-key',
        baseUrl: 'https://api.example.ai/v1',
        model: 'tool-model',
        supportsTools: true,
        freeTier: 'unknown',
      });
  });

  it('rejects insecure or incomplete fallback provider configurations', () => {
    expect(() =>
      createConfig(
        testEnv({
          AI_FALLBACK_PROVIDERS: JSON.stringify([
            { apiKey: 'key', baseUrl: 'http://api.example.ai/v1', model: 'model' },
          ]),
        }),
      ),
    ).toThrow(/must use HTTPS/);
    expect(() =>
      createConfig(testEnv({ AI_FALLBACK_PROVIDERS: '{"apiKey":"key"}' })),
    ).toThrow(/JSON array/);
  });

  it('builds a priority-ordered multi-provider model registry from environment variables', () => {
    const config = createConfig(
      testEnv({
        AI_PRIMARY_PROVIDER: 'gemini',
        AI_PROVIDER_ORDER: 'gemini,cerebras,groq',
        AI_FALLBACK_ENABLED: 'true',
        AI_MAX_RETRIES: '2',
        AI_REQUEST_TIMEOUT: '12000',
        GEMINI_API_KEY: 'gemini-key',
        GEMINI_MODEL: 'gemini-flash',
        GEMINI_SUPPORTS_TOOLS: 'true',
        CEREBRAS_API_KEY: 'cerebras-key',
        CEREBRAS_MODEL: 'qwen-model',
      }),
    );

    expect(config.ai.providers.map((provider) => provider.name)).toEqual([
      'gemini',
      'cerebras',
      'groq',
    ]);
    expect(config.ai.primaryProvider).toBe('gemini');
    expect(config.ai.maxRetries).toBe(2);
    expect(config.ai.timeoutMs).toBe(12_000);
    expect(config.ai.providers[0]).toMatchObject({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      maxTokenParameter: 'max_tokens',
      freeTier: 'unknown',
      supportsTools: true,
    });
  });

  it('allows local Ollama without a key and does not assume hosted HTTP is safe', () => {
    const config = createConfig(
      testEnv({
        GROQ_API_KEY: undefined,
        AI_FALLBACK_PROVIDERS: JSON.stringify([
          {
            name: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            model: 'qwen2.5:7b',
            priority: 0,
          },
        ]),
      }),
    );
    expect(config.ai.providers).toMatchObject([
      { name: 'ollama', allowUnauthenticated: true, model: 'qwen2.5:7b' },
    ]);
  });

  it('requires a model identifier when an optional provider key is configured', () => {
    expect(() => createConfig(testEnv({ GEMINI_API_KEY: 'key' }))).toThrow(/GEMINI_MODEL is required/);
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
    expect(config.ai.model).toBe('openai/gpt-oss-120b');
    expect(config.ai.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(config.ai.enableReadOnly).toBe(true);
    expect(config.d365.pageSize).toBe(500);
    expect(config.conversations.store).toBe('memory');
    expect(config.metadata.cacheTtlMs).toBe(86_400_000);
  });
});
