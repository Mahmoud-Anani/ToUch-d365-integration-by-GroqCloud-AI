import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../src/ai/fallback';
import type { AIProvider } from '../src/ai/types';
import { AIProviderError } from '../src/errors';

const serviceOptions = {
  fallbackEnabled: true,
  cooldownMs: 1_000,
  maxCooldownMs: 10_000,
  primaryProvider: 'primary',
};

function provider(
  name: string,
  model: string,
  generateResponse: AIProvider['generateResponse'],
  capabilities: AIProvider['capabilities'] = {
    supportsTools: true,
    tasks: ['production_analysis', 'general_question', 'data_summarization'],
    freeTier: 'unknown',
  },
): AIProvider {
  return {
    name,
    model,
    capabilities,
    generateResponse,
    generateWithTools: vi.fn(async () => ({
      content: '',
      toolCalls: [],
      model,
      provider: name,
    })),
    processToolResults: vi.fn(() => []),
  };
}

function unavailable(code: 'AI_UNAVAILABLE' | 'AI_RATE_LIMITED' | 'AI_QUOTA_EXHAUSTED' | 'AI_AUTH_ERROR') {
  return new AIProviderError({
    code,
    publicMessage: code,
    retryAfterSeconds: code === 'AI_RATE_LIMITED' ? 5 : undefined,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AIService provider orchestration', () => {
  it('uses the primary provider when it succeeds and records usage', async () => {
    const primary = provider(
      'primary',
      'model-a',
      vi.fn(async () => ({
        content: 'Primary answer',
        toolCalls: [],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      })),
    );
    const service = new AIService([primary], serviceOptions);

    await expect(
      service.generate({ task: 'general_question', prompt: 'Question' }),
    ).resolves.toMatchObject({
      success: true,
      provider: 'primary',
      model: 'model-a',
      task: 'general_question',
      data: { content: 'Primary answer' },
      metadata: { fallbackUsed: false, usage: { totalTokens: 15 } },
    });
    expect(service.status().providers[0]).toMatchObject({
      requests: 1,
      successfulRequests: 1,
      totalTokens: 15,
    });
  });

  it('automatically falls back when the primary quota is exhausted', async () => {
    const primary = provider(
      'primary',
      'model-a',
      vi.fn(async () => {
        throw unavailable('AI_QUOTA_EXHAUSTED');
      }),
    );
    const fallback = provider(
      'fallback',
      'model-b',
      vi.fn(async () => ({ content: 'Recovered', toolCalls: [], model: 'model-b' })),
    );
    const service = new AIService([primary, fallback], serviceOptions);

    await expect(
      service.generate({ task: 'general_question', prompt: 'Question' }),
    ).resolves.toMatchObject({
      provider: 'fallback',
      model: 'model-b',
      metadata: { fallbackUsed: true },
    });
    expect(service.status()).toMatchObject({
      activeProvider: 'fallback',
      fallbackHistory: [{ from: 'primary', to: 'fallback', reason: 'AI_QUOTA_EXHAUSTED' }],
      providers: [
        { quotaExhaustions: 1, failedRequests: 1 },
        { successfulRequests: 1 },
      ],
    });
  });

  it('tries every tool-capable model in priority order until one succeeds', async () => {
    const models = [
      provider('first', 'model-a', vi.fn(async () => ({ content: '', toolCalls: [] }))),
      provider('second', 'model-b', vi.fn(async () => ({ content: '', toolCalls: [] }))),
      provider('third', 'model-c', vi.fn(async () => ({ content: '', toolCalls: [] }))),
      provider('fourth', 'model-d', vi.fn(async () => ({ content: '', toolCalls: [] }))),
    ];
    models[0]!.generateWithTools = vi.fn(async () => {
      throw unavailable('AI_QUOTA_EXHAUSTED');
    });
    models[1]!.generateWithTools = vi.fn(async () => {
      throw unavailable('AI_RATE_LIMITED');
    });
    models[2]!.generateWithTools = vi.fn(async () => {
      throw unavailable('AI_AUTH_ERROR');
    });
    models[3]!.generateWithTools = vi.fn(async () => ({
      content: 'Recovered on fourth model',
      toolCalls: [],
    }));
    const service = new AIService(models, serviceOptions);

    await expect(
      service.generateWithTools(
        [{ role: 'user', content: 'Question' }],
        [{ type: 'function', function: { name: 'query', description: 'query', parameters: {} } }],
        { task: 'general_question' },
      ),
    ).resolves.toMatchObject({
      content: 'Recovered on fourth model',
      provider: 'fourth',
      model: 'model-d',
    });
    for (const model of models) expect(model.generateWithTools).toHaveBeenCalledOnce();
    expect(service.status().fallbackHistory.map(({ from, to }) => [from, to])).toEqual([
      ['first', 'second'],
      ['second', 'third'],
      ['third', 'fourth'],
    ]);
  });

  it('tries all models when each one fails and reports that the sequence is exhausted', async () => {
    const models = ['first', 'second', 'third', 'fourth'].map((name) =>
      provider(name, `${name}-model`, vi.fn(async () => {
        throw unavailable('AI_RATE_LIMITED');
      })),
    );
    const service = new AIService(models, serviceOptions);

    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      publicMessage: expect.stringContaining('All eligible AI models failed'),
    });
    for (const model of models) expect(model.generateResponse).toHaveBeenCalledOnce();
  });

  it('honors provider-supplied rate-limit reset times beyond the local backoff cap', async () => {
    const rateLimited = provider(
      'primary',
      'model-a',
      vi.fn(async () => {
        throw new AIProviderError({
          code: 'AI_RATE_LIMITED',
          publicMessage: 'Rate limited',
          retryAfterSeconds: 3_856,
        });
      }),
    );
    const fallback = provider(
      'fallback',
      'model-b',
      vi.fn(async () => ({ content: 'Recovered', toolCalls: [] })),
    );
    const service = new AIService([rateLimited, fallback], serviceOptions);
    const before = Date.now();

    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).resolves.toMatchObject({ provider: 'fallback' });
    const retryAt = Date.parse(service.status().providers[0]!.retryAt!);
    expect(retryAt - before).toBeGreaterThanOrEqual(3_856_000);
  });

  it('tries configured providers in priority order and reports when all fail', async () => {
    const providers = [
      provider('first', 'model-a', vi.fn(async () => { throw unavailable('AI_AUTH_ERROR'); })),
      provider('second', 'model-b', vi.fn(async () => { throw unavailable('AI_UNAVAILABLE'); })),
      provider('third', 'model-c', vi.fn(async () => { throw unavailable('AI_UNAVAILABLE'); })),
    ];
    const service = new AIService(providers, serviceOptions);

    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
      publicMessage: expect.stringContaining('All eligible AI models failed'),
    });
    for (const item of providers) expect(item.generateResponse).toHaveBeenCalledOnce();
  });

  it('does not retry a provider during cooldown and exposes its retry time', async () => {
    const primary = provider(
      'primary',
      'model-a',
      vi.fn(async () => { throw unavailable('AI_RATE_LIMITED'); }),
    );
    const service = new AIService([primary], serviceOptions);
    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });

    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' });
    expect(primary.generateResponse).toHaveBeenCalledOnce();
    expect(service.status().providers[0]).toMatchObject({
      available: false,
      rateLimitErrors: 1,
      unavailableReason: 'rate_limited',
    });
  });

  it('re-allows a temporarily failed provider after its cooldown', async () => {
    vi.useFakeTimers();
    const primary = provider(
      'primary',
      'model-a',
      vi.fn()
        .mockRejectedValueOnce(unavailable('AI_UNAVAILABLE'))
        .mockResolvedValueOnce({ content: 'Recovered', toolCalls: [] }),
    );
    const service = new AIService([primary], serviceOptions);
    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(1_001);

    await expect(
      service.generateResponse([{ role: 'user', content: 'Question' }]),
    ).resolves.toMatchObject({ content: 'Recovered' });
    expect(primary.generateResponse).toHaveBeenCalledTimes(2);
  });

  it('skips models that do not support the requested task or tools', async () => {
    const textOnly = provider(
      'text-only',
      'model-a',
      vi.fn(async () => ({ content: 'No tools', toolCalls: [] })),
      { supportsTools: false, tasks: ['general_question'], freeTier: 'unknown' },
    );
    const toolsModel = provider(
      'tools',
      'model-b',
      vi.fn(async () => ({ content: 'Available', toolCalls: [] })),
      { supportsTools: true, tasks: ['production_analysis'], freeTier: 'verified' },
    );
    toolsModel.generateWithTools = vi.fn(async () => ({
      content: 'Available',
      toolCalls: [],
      model: 'model-b',
    }));
    const service = new AIService([textOnly, toolsModel], serviceOptions);

    await expect(
      service.generateWithTools(
        [{ role: 'user', content: 'Production' }],
        [{ type: 'function', function: { name: 'query', description: 'query', parameters: {} } }],
        { task: 'production_analysis' },
      ),
    ).resolves.toMatchObject({ content: 'Available', provider: 'tools' });
    expect(textOnly.generateWithTools).not.toHaveBeenCalled();
  });

  it('explains when configured models are excluded from ERP tool-call fallback', async () => {
    const primary = provider(
      'primary',
      'model-a',
      vi.fn(async () => ({ content: '', toolCalls: [] })),
    );
    primary.generateWithTools = vi.fn(async () => {
      throw unavailable('AI_RATE_LIMITED');
    });
    const skipped = [
      provider(
        'text-only-a',
        'model-b',
        vi.fn(async () => ({ content: '', toolCalls: [] })),
        { supportsTools: false, tasks: ['general_question'], freeTier: 'unknown' },
      ),
      provider(
        'text-only-b',
        'model-c',
        vi.fn(async () => ({ content: '', toolCalls: [] })),
        { supportsTools: false, tasks: ['general_question'], freeTier: 'unknown' },
      ),
    ];
    const service = new AIService([primary, ...skipped], serviceOptions);

    await expect(
      service.generateWithTools(
        [{ role: 'user', content: 'Question' }],
        [{ type: 'function', function: { name: 'query', description: 'query', parameters: {} } }],
        { task: 'general_question' },
      ),
    ).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      publicMessage: expect.stringContaining(
        '2 configured model(s) were skipped because tool calling is not enabled',
      ),
    });
    for (const model of skipped) expect(model.generateWithTools).not.toHaveBeenCalled();
  });

  it('normalizes task-based generate responses and falls back on invalid output', async () => {
    const invalid = provider(
      'primary',
      'model-a',
      vi.fn(async () => { throw unavailable('AI_UNAVAILABLE'); }),
    );
    const fallback = provider(
      'fallback',
      'model-b',
      vi.fn(async () => ({ content: 'Summary', toolCalls: [] })),
    );
    const service = new AIService([invalid, fallback], serviceOptions);

    const result = await service.generate({
      task: 'data_summarization',
      prompt: 'Summarize',
      context: { rows: 4 },
    });
    expect(result).toMatchObject({
      success: true,
      provider: 'fallback',
      task: 'data_summarization',
      data: { content: 'Summary' },
      metadata: { fallbackUsed: true },
    });
  });
});
