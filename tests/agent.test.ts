import { describe, expect, it, vi, type Mock } from 'vitest';
import { Agent } from '../src/ai/agent';
import type {
  AICompletion,
  AIMessage,
  AIProvider,
  AIToolCall,
  ToolResultMessage,
} from '../src/ai/types';
import type { ToolRegistry, ToolResult } from '../src/ai/tools';
import { AppError, isAbortError } from '../src/errors';
import { abortError, testConfig, testLogger } from './helpers';

function toolCall(name: string, args: unknown, id = `call_${name}`): AIToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: typeof args === 'string' ? args : JSON.stringify(args),
    },
  };
}

function completion(
  content: string,
  toolCalls: AIToolCall[] = [],
  usage?: AICompletion['usage'],
): AICompletion {
  return { content, toolCalls, usage };
}

interface FakeProvider
  extends Omit<AIProvider, 'generateWithTools' | 'generateResponse' | 'processToolResults'> {
  generateWithTools: Mock<AIProvider['generateWithTools']>;
  generateResponse: Mock<AIProvider['generateResponse']>;
  processToolResults: Mock<AIProvider['processToolResults']>;
}

function fakeProvider(responses: AICompletion[], final?: AICompletion): FakeProvider {
  const queue = [...responses];
  const generateWithTools = vi.fn<AIProvider['generateWithTools']>(async () => {
    const next = queue.shift();
    if (!next) throw new Error('generateWithTools called more times than expected');
    return next;
  });
  const generateResponse = vi.fn<AIProvider['generateResponse']>(
    async () => final ?? completion('Final synthesized answer'),
  );
  const processToolResults = vi.fn<AIProvider['processToolResults']>(
    (calls: AIToolCall[], results: ToolResultMessage[]): AIMessage[] =>
      results.map((result) => ({
        role: 'tool',
        content: result.content,
        tool_call_id: result.toolCallId,
        name: result.name,
      })),
  );
  return {
    name: 'fake',
    model: 'fake-model',
    generateResponse,
    generateWithTools,
    processToolResults,
  };
}

function fakeTools(result: ToolResult = { content: { ok: true } }): {
  registry: ToolRegistry;
  execute: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn(async () => result);
  return {
    registry: {
      definitions: [],
      execute,
    } as unknown as ToolRegistry,
    execute,
  };
}

function runAgent(
  provider: AIProvider,
  tools: ToolRegistry,
  input: Partial<Parameters<Agent['run']>[0]> = {},
  env: Record<string, string | undefined> = {},
) {
  const { logger, mock } = testLogger();
  const config = testConfig(env);
  const agent = new Agent(provider, tools, config, logger);
  return {
    agent,
    logger: mock,
    promise: agent.run({ question: 'How many customers?', userId: 'user-1', ...input }),
  };
}

describe('Agent happy path', () => {
  it('executes a tool call and returns the final answer', async () => {
    const provider = fakeProvider([
      completion('', [toolCall('searchEntities', { searchTerm: 'customers' })]),
      completion('There are 12 customers.'),
    ]);
    const tools = fakeTools({ content: { resultCount: 1 }, meta: { entitySet: 'CustomersV3', rows: 1 } });
    const statuses: string[] = [];

    const { promise, logger } = runAgent(provider, tools.registry, {
      emitStatus: (update) => statuses.push(update.phase),
    });
    const result = await promise;

    expect(result).toMatchObject({
      content: 'There are 12 customers.',
      complete: true,
      model: 'fake-model',
      iterations: 2,
      toolsUsed: ['searchEntities'],
    });
    expect(tools.execute).toHaveBeenCalledTimes(1);
    expect(tools.execute).toHaveBeenCalledWith(
      'searchEntities',
      { searchTerm: 'customers' },
      expect.objectContaining({ userId: 'user-1', toolCallId: 'call_searchEntities' }),
    );
    expect(statuses).toEqual([
      'understanding',
      'searching_entities',
      'searching_entities',
      'completed',
    ]);
    expect(logger.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ai.turn', outcome: 'success', userRef: 'user-1' }),
    );
  });

  it('returns directly when the model answers without tools', async () => {
    const provider = fakeProvider([completion('Hello!')]);
    const tools = fakeTools();
    const result = await runAgent(provider, tools.registry).promise;

    expect(result.content).toBe('Hello!');
    expect(result.iterations).toBe(1);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(provider.generateResponse).not.toHaveBeenCalled();
  });

  it('passes a locale-aware system prompt and bounded data context', async () => {
    const provider = fakeProvider([completion('تم')]);
    const tools = fakeTools();
    const { promise } = runAgent(provider, tools.registry, {
      locale: 'ar',
      dataContext: [
        {
          entitySet: 'CustomersV3',
          entityType: 'CustomerV3',
          operation: 'query',
          rowsReturned: 1,
          complete: true,
          capturedAt: '2026-01-01T00:00:00.000Z',
          sampleRows: [{ CustomerAccount: 'C1' }],
        },
      ],
    });
    await promise;

    const [messages] = provider.generateWithTools.mock.calls[0] as [AIMessage[], unknown];
    expect(messages[0]?.role).toBe('system');
    expect(messages[0]?.content).toContain('Touch El-Zanouki Business Intelligence');
    expect(messages[0]?.content).toContain('Dynamics 365');
    const contextMessage = messages.find(
      (message) => message.role === 'system' && message.content?.includes('CustomersV3'),
    );
    expect(contextMessage).toBeDefined();
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: 'How many customers?' });
  });

  it('trims history to the configured message limit', async () => {
    const provider = fakeProvider([completion('ok')]);
    const tools = fakeTools();
    const history = Array.from({ length: 8 }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message-${index}`,
    }));
    const { promise } = runAgent(provider, tools.registry, { history }, {
      AI_MAX_HISTORY_MESSAGES: '3',
    });
    await promise;

    const [messages] = provider.generateWithTools.mock.calls[0] as [AIMessage[], unknown];
    const historyContents = messages
      .filter((message) => message.content?.startsWith('message-'))
      .map((message) => message.content);
    expect(historyContents).toEqual(['message-5', 'message-6', 'message-7']);
  });

  it('aggregates usage across provider calls', async () => {
    const provider = fakeProvider(
      [
        completion('', [toolCall('analyzeData', { operation: 'count', entityName: 'CustomersV3' })], {
          promptTokens: 10,
          completionTokens: 2,
          totalTokens: 12,
        }),
        completion('Answer', [], { promptTokens: 5, completionTokens: 3, totalTokens: 8 }),
      ],
    );
    const tools = fakeTools({ content: { count: 3 } });
    const result = await runAgent(provider, tools.registry).promise;

    expect(result.usage).toEqual({ promptTokens: 15, completionTokens: 5, totalTokens: 20 });
  });

  it('reserves completion tokens for a final answer after tool work', async () => {
    const provider = fakeProvider([
      completion(
        '',
        [toolCall('analyzeData', { operation: 'count', entityName: 'CustomersV3' }, 'first')],
        { completionTokens: 256 },
      ),
      completion(
        '',
        [toolCall('analyzeData', { operation: 'count', entityName: 'CustomersV3' }, 'second')],
        { completionTokens: 216 },
      ),
    ]);
    const tools = fakeTools();
    const { promise } = runAgent(provider, tools.registry, {}, {
      AI_MAX_TURN_COMPLETION_TOKENS: '600',
      GROQ_MAX_COMPLETION_TOKENS: '256',
    });

    const result = await promise;

    expect(result.content).toBe('Final synthesized answer');
    expect(provider.generateWithTools.mock.calls.map((call) => call[2]?.maxCompletionTokens)).toEqual([
      256,
      216,
    ]);
    expect(provider.generateResponse.mock.calls[0]?.[1]?.maxCompletionTokens).toBe(128);
  });
});

describe('Agent tool handling', () => {
  it('rejects malformed tool arguments without calling the tool', async () => {
    const provider = fakeProvider([
      completion('', [toolCall('queryEntity', '{"entityName":', 'call_bad')]),
      completion('I could not run that query.'),
    ]);
    const tools = fakeTools();
    const { promise, logger } = runAgent(provider, tools.registry);
    const result = await promise;

    expect(tools.execute).not.toHaveBeenCalled();
    expect(result.content).toBe('I could not run that query.');
    expect(logger.warn).toHaveBeenCalledWith(
      'Malformed tool arguments rejected',
      expect.objectContaining({ code: 'INVALID_TOOL_ARGUMENTS' }),
    );

    const toolMessages = provider.processToolResults.mock.calls[0]?.[1] as ToolResultMessage[];
    expect(JSON.parse(toolMessages[0]?.content as string)).toMatchObject({
      error: { code: 'INVALID_TOOL_ARGUMENTS' },
    });
  });

  it('rejects non-object tool arguments', async () => {
    const provider = fakeProvider([
      completion('', [toolCall('queryEntity', '[1,2]', 'call_array')]),
      completion('ok'),
    ]);
    const tools = fakeTools();
    const result = await runAgent(provider, tools.registry).promise;
    expect(result.content).toBe('ok');
    expect(tools.execute).not.toHaveBeenCalled();
  });

  it('allows an empty argument object', async () => {
    const provider = fakeProvider([
      completion('', [toolCall('getRelatedEntities', '', 'call_empty')]),
      completion('ok'),
    ]);
    const tools = fakeTools();
    await runAgent(provider, tools.registry).promise;
    expect(tools.execute).toHaveBeenCalledWith(
      'getRelatedEntities',
      {},
      expect.anything(),
    );
  });

  it('passes tool errors back to the model and continues', async () => {
    const provider = fakeProvider([
      completion('', [toolCall('queryEntity', { entityName: 'Nope' }, 'call_err')]),
      completion('That entity does not exist.'),
    ]);
    const tools = fakeTools({
      isError: true,
      content: { error: { code: 'VALIDATION_ERROR', message: 'Entity not found' } },
    });
    const result = await runAgent(provider, tools.registry).promise;

    expect(result.content).toBe('That entity does not exist.');
    expect(result.toolsUsed).toEqual(['queryEntity']);
    const toolMessages = provider.processToolResults.mock.calls[0]?.[1] as ToolResultMessage[];
    expect(toolMessages[0]?.content).toContain('Entity not found');
  });

  it('limits a single step to four tool calls', async () => {
    const calls = Array.from({ length: 7 }, (_, index) =>
      toolCall('searchEntities', { searchTerm: `term-${index}` }, `call_${index}`),
    );
    const provider = fakeProvider([completion('', calls), completion('done')]);
    const tools = fakeTools();
    await runAgent(provider, tools.registry).promise;

    expect(tools.execute).toHaveBeenCalledTimes(4);
    const assistantMessage = provider.generateWithTools.mock.calls[1]?.[0] as AIMessage[];
    const pushedAssistant = assistantMessage.find(
      (message) => message.role === 'assistant' && message.tool_calls,
    );
    expect(pushedAssistant?.tool_calls).toHaveLength(4);
  });

  it('emits a status per tool execution', async () => {
    const provider = fakeProvider([
      completion('', [
        toolCall('searchEntities', { searchTerm: 'customers' }, 'call_1'),
        toolCall('getEntitySchema', { entityName: 'CustomersV3' }, 'call_2'),
      ]),
      completion('done'),
    ]);
    const tools = fakeTools({ content: {}, meta: { entitySet: 'CustomersV3', rows: 2 } });
    const statuses: Array<{ phase: string; tool?: string; detail?: string }> = [];
    await runAgent(provider, tools.registry, {
      emitStatus: (update) =>
        statuses.push({ phase: update.phase, tool: update.tool, detail: update.detail }),
    }).promise;

    expect(statuses.map((item) => item.phase)).toEqual([
      'understanding',
      'searching_entities',
      'searching_entities',
      'reading_metadata',
      'reading_metadata',
      'completed',
    ]);
    expect(statuses.some((item) => item.detail === '2 row(s)')).toBe(true);
  });

  it('never lets a throwing status listener break the answer', async () => {
    const provider = fakeProvider([completion('fine')]);
    const tools = fakeTools();
    const result = await runAgent(provider, tools.registry, {
      emitStatus: () => {
        throw new Error('listener exploded');
      },
    }).promise;
    expect(result.content).toBe('fine');
  });
});

describe('Agent tool budget and fallbacks', () => {
  it('forces a final answer when the tool budget is exhausted', async () => {
    const provider = fakeProvider(
      [
        completion('', [toolCall('searchEntities', { searchTerm: 'a' }, 'c1')]),
        completion('', [toolCall('searchEntities', { searchTerm: 'b' }, 'c2')]),
      ],
      completion('Best effort answer from gathered evidence.'),
    );
    const tools = fakeTools({ content: {} });
    const statuses: string[] = [];
    const result = await runAgent(provider, tools.registry, {
      emitStatus: (update) => statuses.push(update.phase),
    }, { AI_MAX_TOOL_ITERATIONS: '2' }).promise;

    expect(result.content).toBe('Best effort answer from gathered evidence.');
    expect(result.iterations).toBe(2);
    expect(provider.generateResponse).toHaveBeenCalledTimes(1);
    expect(statuses).toContain('preparing_response');

    const finalMessages = provider.generateResponse.mock.calls[0]?.[0] as AIMessage[];
    expect(finalMessages.at(-1)?.content).toContain('tool-call budget is exhausted');
  });

  it('falls back to a safe message when the model returns empty content', async () => {
    const provider = fakeProvider([completion('   ')], completion(''));
    const tools = fakeTools();
    const result = await runAgent(provider, tools.registry).promise;

    expect(result.content).toContain('could not complete the analysis');
    expect(result.content).not.toContain('undefined');
  });

  it('requests a final response when the first completion is empty', async () => {
    const provider = fakeProvider([completion('', [])], completion('Recovered answer'));
    const tools = fakeTools();
    const result = await runAgent(provider, tools.registry).promise;
    expect(result.content).toBe('Recovered answer');
    expect(provider.generateResponse).toHaveBeenCalledTimes(1);
  });
});

describe('Agent failure behaviour', () => {
  it('rethrows provider errors and writes a failure audit entry', async () => {
    const provider = fakeProvider([]);
    provider.generateWithTools.mockRejectedValueOnce(
      new AppError({ status: 502, code: 'AI_UNAVAILABLE', publicMessage: 'AI down' }),
    );
    const tools = fakeTools();
    const { promise, logger } = runAgent(provider, tools.registry);

    await expect(promise).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(logger.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai.turn',
        outcome: 'failure',
        errorCode: 'AI_UNAVAILABLE',
      }),
    );
  });

  it('propagates aborts without a failure audit', async () => {
    const provider = fakeProvider([]);
    provider.generateWithTools.mockRejectedValueOnce(abortError());
    const tools = fakeTools();
    const { promise, logger } = runAgent(provider, tools.registry);

    await expect(promise).rejects.toSatisfy(isAbortError);
    expect(logger.audit).not.toHaveBeenCalled();
  });

  it('does not leak internal error messages to the caller', async () => {
    const provider = fakeProvider([]);
    provider.generateWithTools.mockRejectedValueOnce(new Error('internal-secret-stack'));
    const tools = fakeTools();
    const { promise } = runAgent(provider, tools.registry);

    await expect(promise).rejects.toThrow('internal-secret-stack');
    // The chat layer is responsible for converting unexpected errors to a
    // public body; the agent must simply not swallow or rewrite them.
  });
});
