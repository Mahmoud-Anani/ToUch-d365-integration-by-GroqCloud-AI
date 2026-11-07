import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import type { AppServices } from '../src/runtime';
import type { AIProvider } from '../src/ai/types';
import { catalogData, testConfig, testLogger } from './helpers';

function createTestServices() {
  const config = testConfig({
    APP_API_KEY: 'legacy-key-must-be-ignored',
    APP_TRUST_USER_HEADER: 'true',
  });
  const { logger } = testLogger();
  const aiProvider: AIProvider = {
    name: 'test',
    model: 'test-model',
    generateResponse: async () => ({ content: 'ok', toolCalls: [] }),
    generateWithTools: async () => ({ content: 'ok', toolCalls: [] }),
    processToolResults: () => [],
  };
  const services = createRuntime(config, {
    aiProvider,
    initialCatalog: catalogData(),
    logger,
  });

  return services;
}

function createTestApp() {
  return createApp(createTestServices());
}

describe('HTTP API without user-entered application keys', () => {
  it('allows API access without an application key', async () => {
    const app = createTestApp();

    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.application).toBe('Touch El-Zanouki Business Intelligence');
    expect(health.body.authRequired).toBe(false);
    expect(health.body.ai).toMatchObject({
      configured: true,
      providers: [{ name: 'groq', requests: 0, successfulRequests: 0 }],
    });
    expect(JSON.stringify(health.body.ai)).not.toContain('test-groq-key');
    await request(app).get('/api/conversations').expect(200);
  });

  it('uses a configured fallback provider when the primary key is absent', async () => {
    const config = testConfig({
      GROQ_API_KEY: undefined,
      AI_FALLBACK_PROVIDERS: JSON.stringify([
        {
          name: 'backup',
          apiKey: 'backup-key',
          baseUrl: 'https://api.example.ai/v1',
          model: 'backup-model',
        },
      ]),
    });
    const { logger } = testLogger();
    const services = createRuntime(config, { initialCatalog: catalogData(), logger });

    expect(services.aiConfigured).toBe(true);
    const health = await request(createApp(services)).get('/api/health').expect(200);
    expect(health.body.ai).toMatchObject({ configured: true, model: 'backup-model' });
  });

  it('isolates conversations when a trusted proxy supplies user identity', async () => {
    const app = createTestApp();
    const headers = (userId: string) => ({
      'x-user-id': userId,
    });

    const created = await request(app)
      .post('/api/conversations')
      .set(headers('alice'))
      .send({ title: 'Alice conversation' })
      .expect(201);
    const conversationId = created.body.conversation.id as string;

    await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set(headers('bob'))
      .expect(404);
    await request(app)
      .get(`/api/conversations/${conversationId}`)
      .set(headers('alice'))
      .expect(200);
  });

  it('rejects malformed trusted user identities', async () => {
    const app = createTestApp();

    await request(app)
      .get('/api/conversations')
      .set('x-user-id', 'invalid user id')
      .expect(401);
  });

  it('accepts POST requests for metadata refresh and Arabic chat streaming', async () => {
    const services: AppServices = createTestServices();
    services.metadata.refresh = async () => ({
      loaded: true,
      entityCount: 2,
      queryableEntityCount: 2,
      stale: false,
      source: 'initial',
      warnings: [],
    });
    const app = createApp(services);

    const refresh = await request(app).post('/api/metadata/refresh').expect(200);
    expect(refresh.body.loaded).toBe(true);

    const stream = await request(app)
      .post('/api/chat/stream')
      .send({ message: 'اعرض المنتجات', locale: 'ar' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    expect(stream.text).toContain('event: final');
    expect(stream.text).toContain('"content":"ok"');
  });
});
