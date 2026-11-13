import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { createApp } from '../src/app';
import { createRuntime } from '../src/runtime';
import { attachDeviceConnectionWebSocket } from '../src/device-connections/websocket';
import type { AppServices } from '../src/runtime';
import type { AIProvider } from '../src/ai/types';
import { catalogData, TEST_PASSWORD, testConfig, testLogger } from './helpers';

function createTestServices(overrides: Record<string, string | undefined> = {}) {
  const config = testConfig({
    APP_API_KEY: 'legacy-key-must-be-ignored',
    APP_TRUST_USER_HEADER: 'true',
    ...overrides,
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

function waitForSocketMessage(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for WebSocket message "${type}".`)), 3_000);
    const onMessage = (raw: Buffer) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(raw.toString()) as Record<string, unknown>; } catch { return; }
      if (message.type !== type) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    };
    socket.on('message', onMessage);
  });
}

describe('HTTP API with mandatory login', () => {
  it('pairs a phone once and delivers scanned content only to the owning laptop session', async () => {
    const services = createTestServices({ DEVICE_CONNECTION_LAN_IP: '192.168.137.23', TRUST_PROXY: 'true' });
    const app = createApp(services);
    const login = await request(app).post('/api/auth/login').send({ username: 'test', password: TEST_PASSWORD }).expect(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const bob = await signIn(app, 'alice');
    const server = createServer(app);
    const closeWebSockets = attachDeviceConnectionWebSocket(server, services);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
    const origin = `http://127.0.0.1:${address.port}`;

    const created = await request(app).post('/api/device-connections/sessions')
      .set('Cookie', cookie).set('X-Forwarded-Proto', 'https')
      .send({ modelId: 'products', connectionType: 'qr-session', theme: 'dark' }).expect(201);
    expect(created.body.qrCode).toMatch(/^data:image\/png;base64,/);
    expect(created.body.pairingUrl).toContain('https://192.168.137.23:3000/device-scan/');
    expect(created.body.pairingUrl).toContain('theme=dark');

    const sessionId = created.body.session.id as string;
    const pairingToken = new URL(created.body.pairingUrl).hash.match(/pair=([^&]+)/)?.[1];
    expect(pairingToken).toBeTruthy();
    const paired = await request(app).post(`/api/device-connections/sessions/${sessionId}/pair`)
      .send({ pairingToken, deviceLabel: 'test phone' }).expect(200);
    expect(paired.body.deviceToken).toHaveLength(43);
    await request(app).post(`/api/device-connections/sessions/${sessionId}/pair`)
      .send({ pairingToken, deviceLabel: 'replay' }).expect(403);

    const laptop = new WebSocket(`${origin}/api/device-connections/sessions/${sessionId}/socket`, { headers: { Cookie: cookie, Origin: origin } });
    const initialStatusPromise = waitForSocketMessage(laptop, 'status');
    const pairedEventPromise = waitForSocketMessage(laptop, 'paired');
    await new Promise<void>((resolve, reject) => { laptop.once('open', resolve); laptop.once('error', reject); });
    expect((await initialStatusPromise).status).toBe('connected');

    const phone = new WebSocket(`${origin}/api/device-connections/sessions/${sessionId}/mobile-socket`, { headers: { Origin: origin } });
    const phoneStatusPromise = waitForSocketMessage(phone, 'status');
    await new Promise<void>((resolve, reject) => { phone.once('open', resolve); phone.once('error', reject); });
    phone.send(JSON.stringify({ type: 'authenticate', token: paired.body.deviceToken }));
    expect((await phoneStatusPromise).status).toBe('connected');
    expect((await pairedEventPromise).deviceLabel).toBe('test phone');

    const scan = { type: 'scan', scanId: 'scanidentifier0001', payload: 'ITEM-42' };
    const receivedScanPromise = waitForSocketMessage(laptop, 'scan');
    const receiptPromise = waitForSocketMessage(phone, 'scan-accepted');
    phone.send(JSON.stringify(scan));
    expect(await receiptPromise).toMatchObject({ scanId: scan.scanId });
    expect(await receivedScanPromise).toMatchObject({ payload: 'ITEM-42', modelId: 'products', deviceLabel: 'test phone' });
    const duplicateReceiptPromise = waitForSocketMessage(phone, 'scan-accepted');
    phone.send(JSON.stringify(scan));
    expect(await duplicateReceiptPromise).toMatchObject({ scanId: scan.scanId, duplicate: true });
    await request(app).get(`/api/device-connections/sessions/${sessionId}`).set('Cookie', cookie).expect(200);
    await bob.get(`/api/device-connections/sessions/${sessionId}`).expect(404);
    laptop.terminate();
    phone.terminate();
    closeWebSockets();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

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

  it('serves chart drill-downs and rejects non-drillable breakdowns', async () => {
    const services = createTestServices();
    const app = createApp(services);
    const agent = await signIn(app, 'test');

    // Unknown breakdown → 404; breakdown without a drill field or key → 400.
    await agent
      .get('/api/dashboard/analysis/not-a-breakdown/drilldown')
      .query({ key: 'x' })
      .expect(404);
    await agent
      .get('/api/dashboard/analysis/customers-by-group/drilldown')
      .query({ key: 'x' })
      .expect(400);
    await agent.get('/api/dashboard/analysis/returns-by-reason/drilldown').expect(400);

    const run = vi.spyOn(services.analytics, 'run').mockResolvedValue({
      operation: 'groupBy',
      entitySet: 'ReturnOrderHeadersV2',
      entityType: 'ReturnOrderHeadersV2',
      recordsScanned: 4,
      recordsUsed: 4,
      nullOrMissing: 0,
      complete: true,
      method: 'scan',
      groups: [{ key: 'C-0001', count: 4 }],
      groupCount: 1,
      notes: [],
    } as never);

    const drill = await agent
      .get('/api/dashboard/analysis/returns-by-reason/drilldown')
      .query({ key: 'QUALITY' })
      .expect(200);

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'groupBy',
        entityName: 'ReturnOrderHeadersV2',
        groupByField: 'CustomerAccountNumber',
        filter: "CustomerReturnReasonCode eq 'QUALITY'",
      }),
    );
    expect(drill.body).toMatchObject({
      status: 'ok',
      drillKey: 'QUALITY',
      parentGroupByField: 'CustomerReturnReasonCode',
      groupByField: 'CustomerAccountNumber',
    });
    expect(drill.body.groups[0]).toMatchObject({ key: 'C-0001', count: 4 });
  });
});
