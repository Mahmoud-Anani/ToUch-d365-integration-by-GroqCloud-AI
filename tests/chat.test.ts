import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, AgentResult } from '../src/ai/agent';
import type { DataContextEntry } from '../src/ai/attachments';
import { ChatService } from '../src/chat/service';
import { JsonConversationStore, normaliseTitle, createConversationStore } from '../src/chat/store';
import type { ConversationRecord } from '../src/chat/types';
import { NotFoundError, ValidationError } from '../src/errors';
import { testConfig, testLogger } from './helpers';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'd365-chat-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function memoryStore(maxPerUser = 100, retentionDays = 30): JsonConversationStore {
  return new JsonConversationStore({
    persistent: false,
    maxPerUser,
    retentionDays,
  });
}

function agentResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    content: 'There are 12 customers.',
    attachments: [],
    sources: [],
    dataContext: [],
    iterations: 2,
    toolsUsed: ['analyzeData'],
    durationMs: 123,
    model: 'fake-model',
    complete: true,
    ...overrides,
  };
}

function fakeAgent(result: AgentResult = agentResult()): {
  agent: Agent;
  run: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn(async () => result);
  return { agent: { run } as unknown as Agent, run };
}

function makeService(
  store = memoryStore(),
  agent: Agent = fakeAgent().agent,
  env: Record<string, string | undefined> = {},
) {
  const { logger, mock } = testLogger();
  const config = testConfig(env);
  return {
    service: new ChatService(store, agent, config, logger),
    store,
    logger: mock,
  };
}

const contextEntry = (overrides: Partial<DataContextEntry> = {}): DataContextEntry => ({
  entitySet: 'CustomersV3',
  entityType: 'CustomerV3',
  operation: 'query',
  rowsReturned: 3,
  complete: true,
  capturedAt: '2026-01-01T00:00:00.000Z',
  sampleRows: [{ CustomerAccount: 'C1' }],
  ...overrides,
});

describe('normaliseTitle', () => {
  it('collapses whitespace and falls back to a default', () => {
    expect(normaliseTitle('  Hello   world  ')).toBe('Hello world');
    expect(normaliseTitle('   ')).toBe('New conversation');
    expect(normaliseTitle(undefined)).toBe('New conversation');
  });

  it('truncates very long titles', () => {
    const title = normaliseTitle('x'.repeat(200));
    expect(title.length).toBeLessThanOrEqual(90);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('JsonConversationStore', () => {
  it('creates, lists and gets conversations per user', async () => {
    const store = memoryStore();
    const created = await store.create('user-a', 'My chat');

    expect(created).toMatchObject({
      userId: 'user-a',
      title: 'My chat',
      messages: [],
    });
    expect(created.id).toMatch(/^[A-Za-z0-9-]+$/);

    const list = await store.list('user-a');
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(created.id);

    await expect(store.get('user-a', created.id)).resolves.toMatchObject({ id: created.id });
    await expect(store.get('user-b', created.id)).resolves.toBeUndefined();
    expect(await store.list('user-b')).toEqual([]);
  });

  it('returns clones so callers cannot mutate internal state', async () => {
    const store = memoryStore();
    const created = await store.create('user-a');
    created.title = 'mutated';
    const again = await store.get('user-a', created.id);
    expect(again?.title).toBe('New conversation');
  });

  it('rejects saving a conversation under a different owner', async () => {
    const store = memoryStore();
    const created = await store.create('user-a');
    const forged: ConversationRecord = { ...created, userId: 'user-b' };
    await expect(store.save(forged)).rejects.toThrow(/ownership mismatch/);
  });

  it('rejects invalid conversation records', async () => {
    const store = memoryStore();
    await expect(
      store.save({ foo: 'bar' } as unknown as ConversationRecord),
    ).rejects.toThrow(/Invalid conversation record/);
  });

  it('deletes only when the owner matches', async () => {
    const store = memoryStore();
    const created = await store.create('user-a');
    await expect(store.delete('user-b', created.id)).resolves.toBe(false);
    await expect(store.delete('user-a', created.id)).resolves.toBe(true);
    await expect(store.get('user-a', created.id)).resolves.toBeUndefined();
  });

  it('prunes conversations beyond maxPerUser', async () => {
    const store = memoryStore(2);
    const first = await store.create('user-a', 'first');
    const second = await store.create('user-a', 'second');
    const third = await store.create('user-a', 'third');

    const now = Date.now();
    first.updatedAt = new Date(now - 3000).toISOString();
    second.updatedAt = new Date(now - 2000).toISOString();
    third.updatedAt = new Date(now - 1000).toISOString();
    await store.save(first);
    await store.save(second);
    await store.save(third);

    const list = await store.list('user-a');
    expect(list.map((item) => item.title)).toEqual(['third', 'second']);
  });

  it('prunes records older than the retention window', async () => {
    const store = memoryStore(100, 10);
    const old = await store.create('user-a', 'old');
    old.updatedAt = new Date(Date.now() - 11 * 86_400_000).toISOString();
    await store.save(old);

    expect(await store.list('user-a')).toEqual([]);
  });

  it('persists conversations across store instances', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'conversations.json');
    const options = { filePath: file, persistent: true, maxPerUser: 10, retentionDays: 30 };

    const first = createConversationStore(options);
    const created = await first.create('user-a', 'Persisted chat');
    await first.save({
      ...created,
      messages: [
        { id: 'm1', role: 'user', content: 'hello', createdAt: new Date().toISOString() },
      ],
    });

    const second = createConversationStore(options);
    const loaded = await second.get('user-a', created.id);
    expect(loaded?.title).toBe('Persisted chat');
    expect(loaded?.messages[0]?.content).toBe('hello');
  });

  it('moves a corrupt store file aside and starts empty', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'conversations.json');
    writeFileSync(file, '{not json', 'utf8');
    const { logger, mock } = testLogger();

    const store = createConversationStore({
      filePath: file,
      persistent: true,
      maxPerUser: 10,
      retentionDays: 30,
      logger,
    });

    expect(await store.list('user-a')).toEqual([]);
    expect(mock.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not be read'),
      expect.anything(),
    );
    expect(readdirSync(dir).some((name) => name.startsWith('conversations.json.corrupt-'))).toBe(true);
  });

  it('ignores a store file with an unexpected shape', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'conversations.json');
    writeFileSync(file, JSON.stringify({ version: 1, conversations: 'nope' }), 'utf8');
    const store = createConversationStore({
      filePath: file,
      persistent: true,
      maxPerUser: 10,
      retentionDays: 30,
    });
    expect(await store.list('user-a')).toEqual([]);
  });
});

describe('ChatService conversation lifecycle', () => {
  it('creates a conversation and derives the title from the first message', async () => {
    const { service, store } = makeService();

    const turn = await service.startTurn({ userId: 'user-a', message: '  How many **customers**?  ' });

    expect(turn.created).toBe(true);
    expect(turn.question).toBe('How many **customers**?');
    expect(turn.history).toEqual([]);
    expect(turn.conversation.title).toBe('How many customers?');
    expect(turn.userMessage.content).toBe('How many **customers**?');

    const stored = await store.get('user-a', turn.conversation.id);
    expect(stored?.messages).toHaveLength(1);
  });

  it('appends to an existing conversation and includes prior history', async () => {
    const { service } = makeService();
    const first = await service.startTurn({ userId: 'user-a', message: 'First question' });

    const second = await service.startTurn({
      userId: 'user-a',
      conversationId: first.conversation.id,
      message: 'Second question',
    });

    expect(second.created).toBe(false);
    expect(second.history).toEqual([{ role: 'user', content: 'First question' }]);
    expect(second.conversation.messages).toHaveLength(2);
    expect(second.conversation.title).toBe('First question');
  });

  it('isolates conversations between users', async () => {
    const { service } = makeService();
    const own = await service.startTurn({ userId: 'user-a', message: 'Private' });

    await expect(
      service.startTurn({
        userId: 'user-b',
        conversationId: own.conversation.id,
        message: 'Hijack',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get('user-b', own.conversation.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.delete('user-b', own.conversation.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each([
    ['empty', '   ', /must not be empty/],
    ['non-string', 42, /must be a string/],
    ['control characters', 'hello\u0000world', /control characters/],
    ['too long', 'x'.repeat(4_001), /at most 4000/],
  ])('rejects an invalid message (%s)', async (_label, message, pattern) => {
    const { service } = makeService();
    await expect(
      service.startTurn({ userId: 'user-a', message: message as string }),
    ).rejects.toThrow(pattern);
  });

  it('rejects an invalid conversation id', async () => {
    const { service } = makeService();
    await expect(
      service.startTurn({ userId: 'user-a', message: 'hi', conversationId: '../etc/passwd' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('creates a conversation with an explicit title', async () => {
    const { service } = makeService();
    const conversation = await service.create('user-a', '  Finance overview  ');
    expect(conversation.title).toBe('Finance overview');
    expect(conversation.messages).toEqual([]);
  });

  it('lists summaries with a preview of the last user message', async () => {
    const { service } = makeService();
    const turn = await service.startTurn({ userId: 'user-a', message: 'Show open sales orders' });
    await service.completeTurn(turn, agentResult({ content: 'Here they are.' }));

    const summaries = await service.listSummaries('user-a');
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: turn.conversation.id,
      title: 'Show open sales orders',
      messageCount: 2,
      preview: 'Show open sales orders',
    });
  });

  it('renames a conversation and validates the title', async () => {
    const { service } = makeService();
    const turn = await service.startTurn({ userId: 'user-a', message: 'One' });

    const renamed = await service.rename('user-a', turn.conversation.id, '  New title  ');
    expect(renamed.title).toBe('New title');

    await expect(service.rename('user-a', turn.conversation.id, '   ')).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.rename('user-a', turn.conversation.id, 'x'.repeat(91)),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.rename('user-b', turn.conversation.id, 'Stolen'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a conversation', async () => {
    const { service } = makeService();
    const turn = await service.startTurn({ userId: 'user-a', message: 'Delete me' });
    await expect(service.delete('user-a', turn.conversation.id)).resolves.toBeUndefined();
    await expect(service.get('user-a', turn.conversation.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a malformed id on get', async () => {
    const { service } = makeService();
    await expect(service.get('user-a', 'bad id!')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ChatService turn generation and completion', () => {
  it('runs the agent with the prepared history and data context', async () => {
    const fake = fakeAgent();
    const { service } = makeService(memoryStore(), fake.agent);
    const turn = await service.startTurn({ userId: 'user-a', message: 'How many?' });

    const result = await service.generate(turn, { locale: 'ar' });

    expect(result.content).toBe('There are 12 customers.');
    expect(fake.run).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'How many?',
        userId: 'user-a',
        conversationId: turn.conversation.id,
        locale: 'ar',
      }),
    );
  });

  it('persists the assistant message with attachments, sources and metadata', async () => {
    const result = agentResult({
      attachments: [
        {
          type: 'metric',
          id: 'm1',
          title: 'Count',
          items: [{ label: 'Records', value: '12' }],
        },
      ],
      sources: [
        {
          entitySet: 'CustomersV3',
          entityType: 'CustomerV3',
          operation: 'count',
          complete: true,
        },
      ],
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      dataContext: [contextEntry()],
    });
    const fake = fakeAgent(result);
    const { service, logger } = makeService(memoryStore(), fake.agent);
    const turn = await service.startTurn({ userId: 'user-a', message: 'How many?' });

    const publicConversation = await service.completeTurn(turn, result);

    expect(publicConversation.messages).toHaveLength(2);
    const assistant = publicConversation.messages[1];
    expect(assistant).toMatchObject({
      role: 'assistant',
      content: 'There are 12 customers.',
      attachments: result.attachments,
      sources: result.sources,
      meta: {
        model: 'fake-model',
        iterations: 2,
        toolsUsed: ['analyzeData'],
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        complete: true,
      },
    });
    expect(publicConversation.messages[0]).not.toHaveProperty('dataContext');
    expect(logger.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'chat.turn', outcome: 'success', userRef: 'user-a' }),
    );
  });

  it('merges and de-duplicates data context, keeping the newest five entries', async () => {
    const older = contextEntry({ entitySet: 'VendorsV2', operation: 'query' });
    const store = memoryStore();
    const { service } = makeService(store);
    const turn = await service.startTurn({ userId: 'user-a', message: 'first' });

    turn.conversation.dataContext = [
      older,
      contextEntry(),
      contextEntry({ operation: 'count' }),
      contextEntry({ filter: "IsActive eq true" }),
      contextEntry({ entitySet: 'Warehouses' }),
    ];
    await store.save(turn.conversation);

    const result = agentResult({
      dataContext: [contextEntry(), contextEntry({ entitySet: 'ProductsV2' })],
    });
    const updated = await service.completeTurn(turn, result);

    const record = await store.get('user-a', turn.conversation.id);
    const keys = record?.dataContext?.map((entry) => entry.entitySet);
    expect(keys?.[0]).toBe('CustomersV3');
    expect(keys?.[1]).toBe('ProductsV2');
    expect(new Set(keys).size).toBe(keys?.length);
    expect(keys?.length).toBeLessThanOrEqual(5);
    expect(updated.messages).toHaveLength(2);
  });

  it('removes data context when no context remains', async () => {
    const store = memoryStore();
    const { service } = makeService(store);
    const turn = await service.startTurn({ userId: 'user-a', message: 'first' });
    turn.conversation.dataContext = [contextEntry()];
    await store.save(turn.conversation);

    await service.completeTurn(turn, agentResult({ dataContext: [] }));
    const record = await store.get('user-a', turn.conversation.id);
    expect(record).not.toHaveProperty('dataContext');
  });

  it('trims stored messages to the configured maximum', async () => {
    const { service, store } = makeService(memoryStore(), fakeAgent().agent, {
      CONVERSATION_MAX_MESSAGES: '2',
    });
    let turn = await service.startTurn({ userId: 'user-a', message: 'one' });
    turn = await service.startTurn({
      userId: 'user-a',
      conversationId: turn.conversation.id,
      message: 'two',
    });
    await service.completeTurn(turn, agentResult());

    const record = await store.get('user-a', turn.conversation.id);
    expect(record?.messages.length).toBeLessThanOrEqual(2);
    expect(record?.messages.at(-1)?.role).toBe('assistant');
  });

  it('touches the conversation after a failure without losing the user message', async () => {
    const store = memoryStore();
    const { service } = makeService(store);
    const turn = await service.startTurn({ userId: 'user-a', message: 'Will fail' });
    const before = (await store.get('user-a', turn.conversation.id))?.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.touchAfterFailure(turn);

    const record = await store.get('user-a', turn.conversation.id);
    expect(record?.messages).toHaveLength(1);
    expect(record?.messages[0]?.content).toBe('Will fail');
    expect(record?.updatedAt).not.toBe(before);
  });

  it('does not fail when failure-touch persistence fails', async () => {
    const store = memoryStore();
    const { service } = makeService(store);
    const turn = await service.startTurn({ userId: 'user-a', message: 'x' });
    vi.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    await expect(service.touchAfterFailure(turn)).resolves.toBeUndefined();
  });

  it('propagates agent failures from generate', async () => {
    const fake = fakeAgent();
    fake.run.mockRejectedValueOnce(new Error('provider down'));
    const { service } = makeService(memoryStore(), fake.agent);
    const turn = await service.startTurn({ userId: 'user-a', message: 'x' });
    await expect(service.generate(turn)).rejects.toThrow('provider down');
  });
});
