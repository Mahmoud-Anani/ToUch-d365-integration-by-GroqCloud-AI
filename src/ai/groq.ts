import { AIProviderError, isAbortError } from '../errors';
import type { Logger } from '../logger';
import type { FetchLike } from '../d365/auth';
import type {
  AICompletion,
  AIModelCapabilities,
  AIMessage,
  AIProvider,
  AIRequestOptions,
  AIToolCall,
  AIToolDefinition,
  ToolResultMessage,
} from './types';

export interface OpenAICompatibleProviderOptions {
  name?: string;
  apiKey?: string;
  allowUnauthenticated?: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxCompletionTokens?: number;
  maxTokenParameter?: 'max_tokens' | 'max_completion_tokens';
  maxRateLimitRetries?: number;
  maxTransientErrorRetries?: number;
  priority?: number;
  capabilities?: AIModelCapabilities;
  fetchImpl?: FetchLike;
  logger?: Logger;
}

export type GroqProviderOptions = OpenAICompatibleProviderOptions;

interface GroqToolCall {
  id?: unknown;
  type?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

interface GroqChoice {
  message?: {
    role?: unknown;
    content?: unknown;
    tool_calls?: unknown;
  };
  finish_reason?: unknown;
}

interface GroqResponse {
  choices?: GroqChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string | number;
    status?: string;
  };
}

const MAX_AUTOMATIC_RETRY_DELAY_SECONDS = 60;
const MAX_TOTAL_RATE_LIMIT_WAIT_MS = 60_000;
const MAX_TOOL_ERROR_RETRIES = 1;

function retryDelaySeconds(response: Response, upstreamMessage: string): number {
  const delays: number[] = [];
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) delays.push(Math.ceil(seconds));
    else {
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(dateDelay) && dateDelay >= 0) delays.push(Math.ceil(dateDelay / 1_000));
    }
  }

  const messageDelay = /try again in\s+(\d+(?:\.\d+)?)\s*(ms|s|m)/i.exec(upstreamMessage);
  if (messageDelay) {
    const amount = Number(messageDelay[1]);
    const seconds = messageDelay[2]?.toLowerCase() === 'm'
      ? amount * 60
      : messageDelay[2]?.toLowerCase() === 'ms'
        ? amount / 1_000
        : amount;
    delays.push(Math.max(0, Math.ceil(seconds)));
  }

  const tokenReset = response.headers.get('x-ratelimit-reset-tokens');
  const requestReset = response.headers.get('x-ratelimit-reset-requests');
  for (const reset of [tokenReset, requestReset]) {
    const resetDelay = reset ? /(\d+(?:\.\d+)?)\s*(ms|s|m)/i.exec(reset) : null;
    if (resetDelay) {
      const amount = Number(resetDelay[1]);
      const seconds = resetDelay[2]?.toLowerCase() === 'm'
        ? amount * 60
        : resetDelay[2]?.toLowerCase() === 'ms'
          ? amount / 1_000
          : amount;
      delays.push(Math.max(0, Math.ceil(seconds)));
    }
  }
  return delays.length > 0 ? Math.max(...delays) : 15;
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeToolCalls(raw: unknown): AIToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: AIToolCall[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const call = raw[index] as GroqToolCall;
    const name = call?.function?.name;
    const args = call?.function?.arguments;
    if (typeof name !== 'string' || name.length === 0) continue;
    calls.push({
      id: typeof call.id === 'string' && call.id ? call.id : `call_${index}_${Date.now()}`,
      type: 'function',
      function: {
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}),
      },
    });
  }
  return calls;
}

function toGroqMessages(messages: AIMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.tool_call_id,
        ...(message.name ? { name: message.name } : {}),
        content: message.content ?? '',
      };
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      return {
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: call.function,
        })),
      };
    }
    return { role: message.role, content: message.content ?? '' };
  });
}

function errorMessage(payload: GroqResponse): string {
  return typeof payload.error?.message === 'string' ? payload.error.message : '';
}

function errorCode(payload: GroqResponse): string {
  return String(payload.error?.code ?? '').toLowerCase();
}

function isQuotaExhausted(response: Response, payload: GroqResponse, message: string): boolean {
  const code = errorCode(payload);
  return (
    /quota|resource_exhausted|insufficient_quota|billing_hard_limit|daily.?limit|monthly.?limit/i.test(
      `${code} ${payload.error?.type ?? ''} ${payload.error?.status ?? ''} ${message}`,
    ) ||
    response.headers.get('x-ratelimit-remaining-requests') === '0'
  );
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  readonly priority?: number;
  readonly capabilities?: AIModelCapabilities;
  private readonly options: OpenAICompatibleProviderOptions & {
    apiKey?: string;
    fetchImpl: FetchLike;
    maxRateLimitRetries: number;
    maxTransientErrorRetries: number;
  };

  constructor(options: OpenAICompatibleProviderOptions) {
    this.options = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      fetchImpl: options.fetchImpl ?? fetch,
      maxRateLimitRetries: options.maxRateLimitRetries ?? 0,
      maxTransientErrorRetries: options.maxTransientErrorRetries ?? 0,
    };
    this.name = options.name ?? 'openai-compatible';
    this.model = options.model;
    this.priority = options.priority;
    this.capabilities = options.capabilities;
  }

  async generateResponse(messages: AIMessage[], options: AIRequestOptions = {}): Promise<AICompletion> {
    return this.request(messages, undefined, { ...options, disableTools: true });
  }

  async generateWithTools(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options: AIRequestOptions = {},
  ): Promise<AICompletion> {
    if (options.disableTools) return this.request(messages, undefined, options);
    return this.request(messages, tools, options);
  }

  processToolResults(toolCalls: AIToolCall[], results: ToolResultMessage[]): AIMessage[] {
    const byId = new Map(results.map((result) => [result.toolCallId, result]));
    return toolCalls.map((call) => {
      const result = byId.get(call.id);
      return {
        role: 'tool',
        tool_call_id: call.id,
        name: call.function.name,
        content: result?.content ?? JSON.stringify({ error: 'Tool produced no result.' }),
      };
    });
  }

  private async request(
    messages: AIMessage[],
    tools: AIToolDefinition[] | undefined,
    options: AIRequestOptions,
    rateLimitRetries = 0,
    totalRateLimitWaitMs = 0,
    toolErrorRetries = 0,
    transientErrorRetries = 0,
  ): Promise<AICompletion> {
    if (!this.options.apiKey && !this.options.allowUnauthenticated) {
      throw new AIProviderError({
        code: 'AI_AUTH_ERROR',
        publicMessage: 'The AI provider is not configured. Set a server-side provider API key to enable chat.',
      });
    }

    const body: Record<string, unknown> = {
      model: this.options.model,
      messages: toGroqMessages(messages),
      temperature: options.temperature ?? this.options.temperature,
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }
    const maxCompletionTokens = options.maxCompletionTokens
      ? Math.min(options.maxCompletionTokens, this.options.maxCompletionTokens ?? options.maxCompletionTokens)
      : this.options.maxCompletionTokens;
    if (maxCompletionTokens) {
      body[this.options.maxTokenParameter ?? 'max_completion_tokens'] = maxCompletionTokens;
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await this.options.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...(this.options.apiKey
            ? { Authorization: `Bearer ${this.options.apiKey}` }
            : {}),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(this.options.timeoutMs),
        ]),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new AIProviderError({
          code: 'AI_UNAVAILABLE',
          publicMessage: 'The AI request timed out or was cancelled. Please try again.',
          message: `${this.name} request aborted`,
          cause: error,
        });
      }
      this.options.logger?.warn(`${this.name} network error`, { error: (error as Error).name });
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'Unable to reach the AI provider. Please try again shortly.',
        message: `${this.name} network error`,
        cause: error,
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'Unable to read the AI provider response.',
        message: `${this.name} response read failed`,
        cause: error,
      });
    }

    let payload: GroqResponse;
    try {
      payload = JSON.parse(text) as GroqResponse;
    } catch {
      payload = {};
    }

    if (!response.ok) {
      this.options.logger?.warn(`${this.name} request failed`, {
        status: response.status,
        errorType: payload.error?.type,
        errorCode: payload.error?.code,
        durationMs: Date.now() - started,
      });
      const upstreamMessage = errorMessage(payload);
      if (
        response.status === 401 ||
        response.status === 403 ||
        /api.?key.?invalid|invalid.?api.?key|unauthenticated|authentication.?failed/i.test(
          `${errorCode(payload)} ${payload.error?.status ?? ''} ${upstreamMessage}`,
        )
      ) {
        throw new AIProviderError({
          code: 'AI_AUTH_ERROR',
          publicMessage: 'The AI provider rejected its API key. Check the server-side provider configuration.',
          message: `${this.name} returned ${response.status}`,
        });
      }
      if (response.status === 404) {
        throw new AIProviderError({
          code: 'AI_MODEL_ERROR',
          publicMessage: `The configured AI model "${this.options.model}" is not available. Check the provider model configuration.`,
          message: `${this.name} model not found`,
        });
      }
      if (response.status === 402 && isQuotaExhausted(response, payload, upstreamMessage)) {
        const retryAfterSeconds = retryDelaySeconds(response, upstreamMessage);
        throw new AIProviderError({
          code: 'AI_QUOTA_EXHAUSTED',
          publicMessage: `The ${this.name} usage quota is exhausted. Please try another configured provider or retry in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        });
      }
      if (response.status === 429) {
        const retryAfterSeconds = retryDelaySeconds(response, upstreamMessage);
        const delayMs = retryAfterSeconds * 1_000;
        if (
          rateLimitRetries < this.options.maxRateLimitRetries &&
          retryAfterSeconds <= MAX_AUTOMATIC_RETRY_DELAY_SECONDS &&
          totalRateLimitWaitMs + delayMs <= MAX_TOTAL_RATE_LIMIT_WAIT_MS
        ) {
          this.options.logger?.info(`Retrying ${this.name} request after rate limit`, {
            retry: rateLimitRetries + 1,
            retryAfterSeconds,
            errorType: payload.error?.type,
            errorCode: payload.error?.code,
          });
          await waitForRetry(delayMs, options.signal);
          return this.request(
            messages,
            tools,
            options,
            rateLimitRetries + 1,
            totalRateLimitWaitMs + delayMs,
            toolErrorRetries,
            transientErrorRetries,
          );
        }

        const retryInSeconds = Math.max(1, retryAfterSeconds);
        const quotaExhausted = isQuotaExhausted(response, payload, upstreamMessage);
        const publicMessage = quotaExhausted
          ? `The ${this.name} usage quota is exhausted. Please try another configured provider or retry in ${retryInSeconds} seconds.`
          : payload.error?.type === 'tokens'
            ? `The ${this.name} per-minute token limit is temporarily exhausted. Please try again in ${retryInSeconds} seconds.`
            : `The ${this.name} provider is temporarily rate limited. Please try another provider or retry in ${retryInSeconds} seconds.`;
        throw new AIProviderError({
          code: quotaExhausted ? 'AI_QUOTA_EXHAUSTED' : 'AI_RATE_LIMITED',
          publicMessage,
          retryAfterSeconds: retryInSeconds,
        });
      }
      if (
        response.status === 413 ||
        /context.{0,20}(length|window)|too many tokens|maximum context/i.test(upstreamMessage)
      ) {
        throw new AIProviderError({
          code: 'AI_CONTEXT_LENGTH',
          publicMessage:
            'This conversation is too large for the AI model. Start a new chat or ask a narrower question.',
          message: `${this.name} context length exceeded`,
        });
      }
      if (
        response.status === 400 &&
        payload.error?.code === 'tool_use_failed' &&
        tools &&
        toolErrorRetries < MAX_TOOL_ERROR_RETRIES
      ) {
        this.options.logger?.info(`Retrying ${this.name} tool-call generation once`, {
          model: this.options.model,
          retry: toolErrorRetries + 1,
        });
        return this.request(
          messages,
          tools,
          { ...options, temperature: 0 },
          rateLimitRetries,
          totalRateLimitWaitMs,
          toolErrorRetries + 1,
          transientErrorRetries,
        );
      }
      if (response.status === 400) {
        throw new AIProviderError({
          code: 'AI_INVALID_RESPONSE',
          publicMessage:
            payload.error?.code === 'tool_use_failed'
              ? 'The AI could not form a valid ERP lookup. Please rephrase the question or ask for one entity or calculation at a time.'
              : 'The AI rejected this request format. Please retry with a shorter or more specific question.',
          message: `${this.name} rejected the request (${String(payload.error?.code ?? 'invalid_request')})`,
        });
      }
      if (
        response.status >= 500 &&
        response.status <= 504 &&
        transientErrorRetries < this.options.maxTransientErrorRetries
      ) {
        const delayMs = 1_000 * (transientErrorRetries + 1);
        this.options.logger?.info(`Retrying transient ${this.name} server error`, {
          status: response.status,
          retry: transientErrorRetries + 1,
        });
        await waitForRetry(delayMs, options.signal);
        return this.request(
          messages,
          tools,
          options,
          rateLimitRetries,
          totalRateLimitWaitMs,
          toolErrorRetries,
          transientErrorRetries + 1,
        );
      }
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage:
          response.status >= 500
            ? 'The AI service is temporarily unavailable after several attempts. Please try again shortly.'
            : `The AI service returned an unexpected response (${response.status}). Please try again with a more specific question.`,
        message: `${this.name} returned ${response.status}`,
      });
    }

    const choice = payload.choices?.[0];
    if (!choice?.message) {
      throw new AIProviderError({
        code: 'AI_INVALID_RESPONSE',
        publicMessage: 'The AI provider returned an empty response. Please try again.',
        message: `${this.name} response had no message`,
      });
    }

    const content =
      typeof choice.message.content === 'string'
        ? choice.message.content
        : Array.isArray(choice.message.content)
          ? (choice.message.content as Array<{ text?: unknown }>)
              .map((part) => (typeof part?.text === 'string' ? part.text : ''))
              .join('')
          : '';
    const toolCalls = normalizeToolCalls(choice.message.tool_calls);
    if (!content.trim() && toolCalls.length === 0) {
      throw new AIProviderError({
        code: 'AI_INVALID_RESPONSE',
        publicMessage: 'The AI provider returned an empty response. Please try again.',
        message: `${this.name} response was empty`,
      });
    }
    const usage = payload.usage
      ? {
          ...(typeof payload.usage.prompt_tokens === 'number'
            ? { promptTokens: payload.usage.prompt_tokens }
            : {}),
          ...(typeof payload.usage.completion_tokens === 'number'
            ? { completionTokens: payload.usage.completion_tokens }
            : {}),
          ...(typeof payload.usage.total_tokens === 'number'
            ? { totalTokens: payload.usage.total_tokens }
            : {}),
        }
      : undefined;

    this.options.logger?.debug(`${this.name} completion received`, {
      model: this.options.model,
      toolCalls: toolCalls.length,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : undefined,
      durationMs: Date.now() - started,
      totalTokens: usage?.totalTokens,
    });

    return {
      content,
      toolCalls,
      ...(typeof choice.finish_reason === 'string' ? { finishReason: choice.finish_reason } : {}),
      ...(usage ? { usage } : {}),
      model: this.model,
      provider: this.name,
    };
  }
}

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(options: GroqProviderOptions) {
    super({
      ...options,
      name: options.name ?? 'groq',
      maxRateLimitRetries: options.maxRateLimitRetries ?? 2,
      maxTransientErrorRetries: options.maxTransientErrorRetries ?? 2,
    });
  }
}
