import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../src/ai/fallback';
import type { AIProvider } from '../src/ai/types';
import { AIProviderError } from '../src/errors';

const serviceOptions = {
  fallbackEnabled: true,
  maxRetries: 6,
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
      publicMessage: expect.stringContaining('All configured AI providers failed'),
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
