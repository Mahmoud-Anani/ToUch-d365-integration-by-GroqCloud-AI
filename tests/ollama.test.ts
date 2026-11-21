import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '../src/ai/ollama';
import type { AIToolDefinition } from '../src/ai/types';
import { AIProviderError } from '../src/errors';
import { jsonResponse, testLogger } from './helpers';

const tools: AIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'searchEntities',
      description: 'Search D365 entities',
      parameters: {
        type: 'object',
        properties: { searchTerm: { type: 'string' } },
        required: ['searchTerm'],
      },
    },
  },
];

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function createProvider(
  fetchImpl: FetchImpl,
  overrides: Partial<ConstructorParameters<typeof OllamaProvider>[0]> = {},
): OllamaProvider {
  const { logger } = testLogger();
  return new OllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    model: 'd365-local',
    temperature: 0.2,
    timeoutMs: 5_000,
    maxCompletionTokens: 256,
    numCtx: 32768,
    fetchImpl,
    logger,
    ...overrides,
  });
}

interface ChatBody {
  model?: string;
  stream?: boolean;
  think?: boolean;
  options?: Record<string, number>;
  messages?: Array<Record<string, unknown>>;
  tools?: unknown;
}

function chatBody(init: RequestInit | undefined): ChatBody {
  return JSON.parse(String(init?.body ?? '{}')) as ChatBody;
}

describe('OllamaProvider', () => {
  it('posts to the loopback chat endpoint with local-only settings', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse({
        model: 'd365-local',
        message: { role: 'assistant', content: 'Bonjour' },
        prompt_eval_count: 12,
        eval_count: 3,
        done_reason: 'stop',
      }),
    );
    const provider = createProvider(fetchImpl);

    const result = await provider.generateResponse([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'مرحبا' },
    ]);

    expect(result.content).toBe('Bonjour');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:11434/api/chat');
    const body = chatBody(fetchImpl.mock.calls[0]?.[1] as RequestInit);
    expect(body).toMatchObject({
      model: 'd365-local',
      stream: false,
      think: false,
      options: { temperature: 0.2, num_predict: 256, num_ctx: 32768 },
    });
    expect(body.messages).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'مرحبا' },
    ]);
    // No API key or cloud header is ever attached.
    expect(JSON.stringify(fetchImpl.mock.calls[0]?.[1])).not.toMatch(/authorization|api[_-]?key/i);
  });

  it('folds late system messages into one leading message so Qwen never returns 500', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse({ message: { role: 'assistant', content: 'ok' } }),
    );
    const provider = createProvider(fetchImpl);

    await provider.generateResponse([
      { role: 'system', content: 'Primary instructions.' },
      { role: 'user', content: 'Find customers.' },
      { role: 'system', content: 'Snapshot from earlier turns.' },
      { role: 'assistant', content: 'Working on it.' },
      { role: 'system', content: 'Finish now.' },
    ]);

    const body = chatBody(fetchImpl.mock.calls[0]?.[1] as RequestInit);
    const systemMessages = (body.messages ?? []).filter((message) => message.role === 'system');
    expect(systemMessages).toHaveLength(1);
    expect(body.messages?.[0]).toEqual({
      role: 'system',
      content: 'Primary instructions.\n\nSnapshot from earlier turns.\n\nFinish now.',
    });
    expect((body.messages ?? []).slice(1).map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
  });

  it('preserves system prompts and native tool calls across a tool round-trip', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ message: { content: '' } }));
    fetchImpl
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                function: { name: 'searchEntities', arguments: { searchTerm: 'customers' } },
              },
              {
                id: 'call_2',
                function: { name: 'dropTable', arguments: {} },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ message: { role: 'assistant', content: 'Found CustomersV3.' } }),
      );
    const provider = createProvider(fetchImpl);
    const messages = [
      { role: 'system' as const, content: 'You are a read-only D365 assistant.' },
      { role: 'user' as const, content: 'Find customers.' },
    ];

    const first = await provider.generateWithTools(messages, tools);
    // Only registered tools are exposed to the backend executor.
    expect(first.toolCalls.map((call) => call.function.name)).toEqual(['searchEntities']);
    expect(first.toolCalls[0]?.function.arguments).toBe('{"searchTerm":"customers"}');

    const toolMessages = provider.processToolResults(first.toolCalls, [
      { toolCallId: 'call_1', name: 'searchEntities', content: '{"results":[]}' },
    ]);
    expect(toolMessages).toEqual([{ role: 'tool', content: '{"results":[]}' }]);

    await provider.generateResponse([
      ...messages,
      { role: 'assistant', content: '', tool_calls: first.toolCalls },
      ...toolMessages,
    ]);
    const secondBody = chatBody(fetchImpl.mock.calls[1]?.[1] as RequestInit);
    const secondMessages = secondBody.messages ?? [];
    expect(secondMessages[0]).toEqual({
      role: 'system',
      content: 'You are a read-only D365 assistant.',
    });
    // Ollama requires decoded argument objects in the assistant tool-call history.
    const assistantHistory = secondMessages.find((message) => message.role === 'assistant');
    expect(assistantHistory?.tool_calls).toEqual([
      {
        id: 'call_1',
        function: { name: 'searchEntities', arguments: { searchTerm: 'customers' } },
      },
    ]);
    expect(secondMessages.at(-1)).toEqual({ role: 'tool', content: '{"results":[]}' });
    expect(secondBody.tools).toBeUndefined();
  });

  it('accepts structured JSON tool calls when native tool calling is absent', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse({
        message: {
          role: 'assistant',
          content: '{"tool_calls":[{"name":"searchEntities","arguments":{"searchTerm":"sales"}}]}',
        },
      }),
    );
    const provider = createProvider(fetchImpl);

    const result = await provider.generateWithTools([{ role: 'user', content: 'Find sales' }], tools);
    expect(result.content).toBe('');
    expect(result.toolCalls).toMatchObject([
      { function: { name: 'searchEntities', arguments: '{"searchTerm":"sales"}' } },
    ]);
  });

  it('strips thinking tags and ignores reasoning-only answers', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse({
        message: { role: 'assistant', content: '<think>internal reasoning</think>Salam' },
      }),
    );
    const provider = createProvider(fetchImpl);
    expect((await provider.generateResponse([{ role: 'user', content: 'Hi' }])).content).toBe('Salam');

    fetchImpl.mockResolvedValueOnce(
      jsonResponse({ message: { role: 'assistant', content: '', thinking: 'still thinking' } }),
    );
    await expect(provider.generateResponse([{ role: 'user', content: 'Hi' }])).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
    });
  });

  it('rejects oversized prompts before any network call', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ message: { content: 'ok' } }));
    const provider = createProvider(fetchImpl, { maxPromptChars: 20 });

    await expect(
      provider.generateResponse([{ role: 'user', content: 'x'.repeat(50) }]),
    ).rejects.toMatchObject({ code: 'AI_CONTEXT_LENGTH' });
    expect(fetchImpl).not.toHaveBeenCalled();

    await expect(
      provider.generateResponse(Array.from({ length: 10 }, () => ({ role: 'user' as const, content: 'x' })), {}, ),
    ).resolves.toBeDefined();
  });

  it('maps Ollama unavailability and missing models to safe public errors', async () => {
    const offline = createProvider(vi.fn<FetchImpl>(async () => { throw new TypeError('fetch failed'); }), {
      maxRetries: 0,
    });
    const offlineError = (await offline
      .generateResponse([{ role: 'user', content: 'Hi' }])
      .catch((reason: unknown) => reason)) as AIProviderError;
    expect(offlineError.code).toBe('AI_UNAVAILABLE');
    expect(offlineError.publicMessage).not.toMatch(/ollama|d365-local|127\.0\.0\.1|local/i);

    const missing = createProvider(vi.fn<FetchImpl>(async () => jsonResponse({ error: 'no such model' }, { status: 404 })));
    const error = (await missing
      .generateResponse([{ role: 'user', content: 'Hi' }])
      .catch((reason: unknown) => reason)) as AIProviderError;
    expect(error.code).toBe('AI_MODEL_ERROR');
    expect(error.publicMessage).not.toMatch(/d365-local|C:|ollama|127\.0\.0\.1|local/i);
  });

  it('maps a runner error returned in a 200 body to a safe public error', async () => {
    const provider = createProvider(vi.fn<FetchImpl>(async () =>
      jsonResponse({ error: 'System message must be at the beginning.' }),
    ));
    const error = (await provider
      .generateResponse([{ role: 'user', content: 'Hi' }])
      .catch((reason: unknown) => reason)) as AIProviderError;

    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.publicMessage).not.toMatch(/system message|ollama|d365-local|jinja/i);
  });

  it('retries a transient 500 and returns the recovered answer', async () => {
    const fetchImpl = vi.fn<FetchImpl>()
      .mockResolvedValueOnce(jsonResponse({ error: 'runner restarting' }, { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse({ message: { role: 'assistant', content: 'Recovered answer' } }),
      );
    const provider = createProvider(fetchImpl);

    const result = await provider.generateResponse([{ role: 'user', content: 'Hi' }]);

    expect(result.content).toBe('Recovered answer');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('logs upstream 500 detail server-side without exposing it to the browser', async () => {
    const upstream = 'Jinja Exception: System message must be at the beginning.';
    const { logger, mock } = testLogger();
    const provider = createProvider(
      vi.fn<FetchImpl>(async () => jsonResponse({ error: upstream }, { status: 500 })),
      { maxRetries: 0, logger },
    );
    const error = (await provider
      .generateResponse([{ role: 'user', content: 'Hi' }])
      .catch((reason: unknown) => reason)) as AIProviderError;

    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.publicMessage).not.toMatch(/jinja|system message|ollama/i);
    expect(mock.warn).toHaveBeenCalledWith(
      'Ollama returned an error',
      expect.objectContaining({ status: 500, upstream }),
    );
  });

  it('reports browser-safe status with a cached loopback probe', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('/api/tags')) {
        return jsonResponse({ models: [{ name: 'd365-local:latest' }] });
      }
      return jsonResponse({ message: { content: 'ok' } });
    });
    const provider = createProvider(fetchImpl, { publicModelLabel: 'AI assistant' });

    const before = await provider.status();
    expect(before).toMatchObject({
      configured: true,
      available: true,
      model: 'AI assistant',
      requests: 0,
    });

    await provider.generateResponse([{ role: 'user', content: 'Hi' }]);
    const after = await provider.status();
    expect(after).toMatchObject({
      available: true,
      requests: 1,
      successfulRequests: 1,
      totalTokens: 0,
    });
    // Two status calls share the cached tag probe.
    const tagCalls = fetchImpl.mock.calls.filter((call) => String(call[0]).includes('/api/tags'));
    expect(tagCalls).toHaveLength(1);
  });
});
