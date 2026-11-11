import { describe, expect, it, vi } from 'vitest';
import { GroqProvider, OpenAICompatibleProvider } from '../src/ai/groq';
import { AIProviderError } from '../src/errors';
import { jsonResponse } from './helpers';

const providerOptions = {
  apiKey: 'test-key',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-120b',
  temperature: 0,
  timeoutMs: 5_000,
  maxCompletionTokens: 1_024,
};

describe('GroqProvider rate-limit handling', () => {
  it('distinguishes quota exhaustion from a temporary token rate limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'insufficient_quota',
            message: 'Monthly quota exhausted.',
          },
        },
        { status: 429 },
      ),
    );
    const provider = new OpenAICompatibleProvider({
      ...providerOptions,
      name: 'openrouter',
      fetchImpl,
    });

    await expect(
      provider.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_QUOTA_EXHAUSTED' });
  });

  it('retries a transient token-per-minute limit using Retry-After', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              type: 'tokens',
              code: 'rate_limit_exceeded',
              message: 'Please try again in 1s.',
            },
          },
          { status: 429, headers: { 'retry-after': '0' } },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { role: 'assistant', content: 'ERP answer', tool_calls: [] } }],
        }),
      );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });

    const result = await provider.generateResponse([{ role: 'user', content: 'Question' }]);

    expect(result.content).toBe('ERP answer');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns an actionable error when the rate limit persists', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            type: 'tokens',
            code: 'rate_limit_exceeded',
            message: 'Please try again in 1s.',
          },
        },
        { status: 429, headers: { 'retry-after': '0' } },
      ),
    );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });

    await expect(
      provider.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      publicMessage: expect.stringContaining('per-minute token limit'),
      retryAfterSeconds: 1,
    } satisfies Partial<AIProviderError>);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('retries malformed model tool output once at zero temperature', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() =>
        jsonResponse(
          {
            error: {
              type: 'invalid_request_error',
              code: 'tool_use_failed',
              message: 'The generated tool call was invalid.',
            },
          },
          { status: 400 },
        ),
      )
      .mockImplementationOnce(() =>
        jsonResponse({
          choices: [{ message: { role: 'assistant', content: 'I found the records.' } }],
        }),
      );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });
    const tool = {
      type: 'function' as const,
      function: {
        name: 'searchEntities',
        description: 'Find ERP entities.',
        parameters: { type: 'object', properties: {} },
      },
    };

    const result = await provider.generateWithTools(
      [{ role: 'user', content: 'Find orders.' }],
      [tool],
    );

    expect(result.content).toBe('I found the records.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string) as {
      temperature: number;
      max_completion_tokens: number;
    };
    expect(retryBody.temperature).toBe(0);
    expect(retryBody.max_completion_tokens).toBe(1_024);
  });

  it('caps completion tokens at the per-request budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'Short answer' } }],
      }),
    );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });

    await provider.generateResponse([{ role: 'user', content: 'Question' }], {
      maxCompletionTokens: 128,
    });

    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as {
      max_completion_tokens: number;
    };
    expect(requestBody.max_completion_tokens).toBe(128);
  });

  it('uses the configured compatible token field and normalizes provider metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { role: 'assistant', content: 'Gemini answer' } }],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      }),
    );
    const provider = new OpenAICompatibleProvider({
      ...providerOptions,
      name: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-flash',
      maxTokenParameter: 'max_tokens',
      fetchImpl,
    });

    const result = await provider.generateResponse(
      [{ role: 'user', content: 'Question' }],
      { maxCompletionTokens: 200 },
    );
    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as {
      max_tokens: number;
      max_completion_tokens?: number;
    };

    expect(requestBody).toMatchObject({ max_tokens: 200 });
    expect(requestBody.max_completion_tokens).toBeUndefined();
    expect(result).toMatchObject({
      content: 'Gemini answer',
      provider: 'gemini',
      model: 'gemini-flash',
      usage: { totalTokens: 7 },
    });
  });

  it('rejects empty success payloads so the orchestrator can fail over', async () => {
    const provider = new OpenAICompatibleProvider({
      ...providerOptions,
      name: 'cerebras',
      fetchImpl: vi.fn().mockResolvedValue(
        jsonResponse({ choices: [{ message: { role: 'assistant', content: '' } }] }),
      ),
    });

    await expect(
      provider.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });

  it('normalizes connection failures for circuit-breaker failover', async () => {
    const provider = new OpenAICompatibleProvider({
      ...providerOptions,
      name: 'sambanova',
      fetchImpl: vi.fn().mockRejectedValue(new Error('connection reset')),
    });

    await expect(
      provider.generateResponse([{ role: 'user', content: 'Question' }]),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('returns a useful validation message if Groq repeatedly rejects tool calls', async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            type: 'invalid_request_error',
            code: 'tool_use_failed',
            message: 'The generated tool call was invalid.',
          },
        },
        { status: 400 },
      ),
    );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });
    const tool = {
      type: 'function' as const,
      function: {
        name: 'searchEntities',
        description: 'Find ERP entities.',
        parameters: { type: 'object', properties: {} },
      },
    };

    await expect(
      provider.generateWithTools([{ role: 'user', content: 'Find orders.' }], [tool]),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      publicMessage: expect.stringContaining('valid ERP lookup'),
    } satisfies Partial<AIProviderError>);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries transient Groq server failures', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({}, { status: 503 }))
      .mockImplementationOnce(() =>
        jsonResponse({
          choices: [{ message: { role: 'assistant', content: 'Recovered response' } }],
        }),
      );
    const provider = new GroqProvider({ ...providerOptions, fetchImpl });

    const result = await provider.generateResponse([{ role: 'user', content: 'Question' }]);

    expect(result.content).toBe('Recovered response');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
