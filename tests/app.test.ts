import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import type { AppServices } from '../src/runtime';
import type { AIProvider } from '../src/ai/types';
import { catalogData, TEST_PASSWORD, testConfig, testLogger } from './helpers';

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

async function signIn(app: ReturnType<typeof createApp>, username: string) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username, password: TEST_PASSWORD })
    .expect(200);
  return agent;
}

describe('HTTP API with mandatory login', () => {
  it('keeps health public and requires a session for project APIs', async () => {
    const app = createTestApp();

    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.application).toBe('Touch El-Zanouki Business Intelligence');
    expect(health.body.authRequired).toBe(true);
    expect(health.body.ai).toMatchObject({
      configured: true,
      providers: [{ name: 'groq', requests: 0, successfulRequests: 0 }],
    });
    expect(JSON.stringify(health.body.ai)).not.toContain('test-groq-key');

    await request(app).get('/api/conversations').expect(401).expect('Content-Type', /json/);
    await request(app).get('/api/dashboard/modules').expect(401);

    const agent = await signIn(app, 'test');
    await agent.get('/api/conversations').expect(200);
  });

  it('rejects invalid credentials without revealing which field failed', async () => {
    const app = createTestApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'test', password: 'wrong-password' })
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(response.body.error.message).toBe('Invalid username or password.');
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

  it('isolates conversations per signed-in user', async () => {
    const app = createTestApp();
    const alice = await signIn(app, 'alice');
    const bob = await signIn(app, 'bob');

    const created = await alice
      .post('/api/conversations')
      .send({ title: 'Alice conversation' })
      .expect(201);
    const conversationId = created.body.conversation.id as string;

    await bob.get(`/api/conversations/${conversationId}`).expect(404);
    await alice.get(`/api/conversations/${conversationId}`).expect(200);
  });

  it('ignores the legacy trusted x-user-id header', async () => {
    const app = createTestApp();

    await request(app)
      .get('/api/conversations')
      .set('x-user-id', 'alice')
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
    const agent = await signIn(app, 'test');

    const refresh = await agent.post('/api/metadata/refresh').expect(200);
    expect(refresh.body.loaded).toBe(true);

    const stream = await agent
      .post('/api/chat/stream')
      .send({ message: 'اعرض المنتجات', locale: 'ar' })
      .expect(200)
      .expect('Content-Type', /text\/event-stream/);
    expect(stream.text).toContain('event: final');
    expect(stream.text).toContain('"content":"ok"');
  });

  it('lists dashboard modules and serves validated module records', async () => {
    const services = createTestServices();
    const app = createApp(services);
    const agent = await signIn(app, 'test');

    const modules = await agent.get('/api/dashboard/modules').expect(200);
    expect(modules.body.modules.length).toBeGreaterThanOrEqual(10);
    expect(modules.body.modules.map((module: { id: string }) => module.id)).toContain('customers');

    // Live D365 rejects contains()/startswith(), so searched record queries
    // scan server-ordered rows and filter in memory (case-insensitive).
    const fetchAllPages = vi.spyOn(services.client, 'fetchAllPages').mockResolvedValue({
      rows: [
        { CustomerAccount: 'C-0001', OrganizationName: 'Contoso' },
        { CustomerAccount: 'C-0002', OrganizationName: 'Fabrikam' },
        { CustomerAccount: 'C-0003', OrganizationName: 'contoso retail' },
      ],
      complete: true,
      pages: 1,
      scanned: 3,
    });

    // Apostrophes survive end-to-end: no OData string is built from search
    // text, so nothing needs escaping and no injection is possible.
    const records = await agent
      .get('/api/dashboard/modules/customers/records')
      .query({ search: "O'Brien", top: 10 })
      .expect(200);

    expect(fetchAllPages).toHaveBeenCalledTimes(1);
    expect(records.body.records).toEqual([]);
    expect(records.body.total).toBe(0);

    const found = await agent
      .get('/api/dashboard/modules/customers/records')
      .query({ search: 'CONTOSO', top: 10 })
      .expect(200);
    expect(found.body.records).toEqual([
      { CustomerAccount: 'C-0001', OrganizationName: 'Contoso' },
      { CustomerAccount: 'C-0003', OrganizationName: 'contoso retail' },
    ]);
    expect(found.body.total).toBe(2);
    expect(found.body.columns.map((column: { name: string }) => column.name)).toContain('CustomerAccount');

    const paged = await agent
      .get('/api/dashboard/modules/customers/records')
      .query({ search: 'contoso', top: 1, skip: 1 })
      .expect(200);
    expect(paged.body.records).toEqual([
      { CustomerAccount: 'C-0003', OrganizationName: 'contoso retail' },
    ]);
    expect(paged.body.total).toBe(2);
    expect(paged.body.hasMore).toBe(false);
  });

  it('returns 404 for an unknown dashboard module', async () => {
    const app = createTestApp();
    const agent = await signIn(app, 'test');

    await agent.get('/api/dashboard/modules/not-a-module/records').expect(404);
  });
});
