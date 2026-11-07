import { vi, type Mock } from 'vitest';
import { createConfig, type AppConfig } from '../src/config';
import type { Logger } from '../src/logger';
import { parseCsdlMetadata } from '../src/metadata/parser';
import type { MetadataCatalogData } from '../src/metadata/types';
import { ADVERTISED_ENTITY_SETS, METADATA_XML } from './fixtures/metadata';

export const TEST_BASE_URL = 'https://test.operations.dynamics.com';

export function testEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    D365_BASE_URL: TEST_BASE_URL,
    D365_CLIENT_ID: 'test-client-id',
    D365_CLIENT_SECRET: 'test-client-secret',
    D365_TOKEN_URL: 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token',
    D365_SCOPE: `${TEST_BASE_URL}/.default`,
    GROQ_API_KEY: 'test-groq-key',
    APP_TRUST_USER_HEADER: 'false',
    CONVERSATION_STORE: 'memory',
    ...overrides,
  };
}

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return createConfig(testEnv(overrides));
}

export function catalogData(overrides: Partial<MetadataCatalogData> = {}): MetadataCatalogData {
  return {
    ...parseCsdlMetadata(METADATA_XML, {
      baseUrl: TEST_BASE_URL,
      fetchedAt: Date.now(),
      advertisedEntitySets: ADVERTISED_ENTITY_SETS,
    }),
    ...overrides,
  };
}

export interface TestLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  audit: Mock;
}

export function testLogger(): { logger: Logger; mock: TestLogger } {
  const mock: TestLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    audit: vi.fn(),
  };
  return { logger: mock as unknown as Logger, mock };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: {
      'content-type': 'text/plain',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/** A token source that never performs I/O. */
export function staticTokenSource(token = 'test-token'): {
  getToken: Mock;
  invalidate: Mock;
} {
  return {
    getToken: vi.fn(async () => token),
    invalidate: vi.fn(),
  };
}

export function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}
