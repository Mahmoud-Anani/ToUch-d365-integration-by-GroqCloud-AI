import { AIProviderError, isAbortError } from '../errors';
import type { Logger } from '../logger';
import type {
  AICompletion,
  AIMessage,
  AIProvider,
  AIRequestOptions,
  AITask,
  AIToolCall,
  AIToolDefinition,
  ToolResultMessage,
} from './types';

export interface ProviderHealth {
  name: string;
  model: string;
  priority: number;
  freeTier: string;
  contextWindow?: number;
  supportsTools: boolean;
  tasks: AITask[];
  available: boolean;
  unavailableReason?: string;
  retryAt?: string;
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  quotaExhaustions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  averageResponseMs: number;
  lastSuccessAt?: string;
}

interface ProviderStats {
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitErrors: number;
  quotaExhaustions: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalResponseMs: number;
  lastSuccessAt?: string;
  consecutiveFailures: number;
  unavailableReason?: string;
  unavailableCode?: AIProviderError['code'];
  retryAt?: number;
}

export interface AIServiceStatus {
  activeProvider?: string;
  providers: ProviderHealth[];
  fallbackHistory: Array<{ from: string; to: string; reason: string; at: string }>;
}

export interface AIServiceOptions {
  fallbackEnabled: boolean;
  maxRetries: number;
  cooldownMs: number;
  maxCooldownMs: number;
  primaryProvider?: string;
}

export interface AIServiceRequest {
  task: AITask;
  prompt: string;
  context?: unknown;
  signal?: AbortSignal;
  maxCompletionTokens?: number;
}

export interface AIServiceResponse {
  success: true;
  provider: string;
  model: string;
  task: AITask;
  data: { content: string };
  metadata: {
    responseTimeMs: number;
    fallbackUsed: boolean;
    usage?: AICompletion['usage'];
  };
}

export class AIService implements AIProvider {
  readonly name = 'ai-service';
  readonly model: string;
  readonly primaryProviderName?: string;
  private readonly providers: AIProvider[];
  private readonly stats = new Map<string, ProviderStats>();
  private activeProvider?: string;
  private readonly fallbackHistory: AIServiceStatus['fallbackHistory'] = [];

  constructor(
    providers: AIProvider[],
    private readonly options: AIServiceOptions,
    private readonly logger?: Logger,
  ) {
    this.providers = [...providers].sort(
      (left, right) => (left.priority ?? 0) - (right.priority ?? 0),
    );
    const primary =
      this.providers.find((provider) => provider.name === options.primaryProvider) ??
      this.providers[0];
    this.primaryProviderName = primary?.name;
    this.model = primary?.model ?? 'unconfigured';
    for (const provider of this.providers) {
      this.stats.set(provider.name, {
        requests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitErrors: 0,
        quotaExhaustions: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalResponseMs: 0,
        consecutiveFailures: 0,
      });
    }
  }

  async generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AICompletion> {
    return this.run((provider) => provider.generateResponse(messages, options), options, false);
  }

  async generate(request: AIServiceRequest): Promise<AIServiceResponse> {
    const messages: AIMessage[] = [];
    if (request.context !== undefined) {
      const context =
        typeof request.context === 'string'
          ? request.context
          : JSON.stringify(request.context);
      messages.push({
        role: 'system',
        content: `Use the following context only as supplied evidence:\n${context}`,
      });
    }
    messages.push({ role: 'user', content: request.prompt });
    const started = Date.now();
    const completion = await this.generateResponse(messages, {
      task: request.task,
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.maxCompletionTokens
        ? { maxCompletionTokens: request.maxCompletionTokens }
        : {}),
    });
    const provider = completion.provider ?? this.primaryProviderName ?? 'unknown';
    return {
      success: true,
      provider,
      model: completion.model ?? this.model,
      task: request.task,
      data: { content: completion.content },
      metadata: {
        responseTimeMs: Date.now() - started,
        fallbackUsed: provider !== this.primaryProviderName,
        ...(completion.usage ? { usage: completion.usage } : {}),
      },
    };
  }

  async generateWithTools(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options?: AIRequestOptions,
  ): Promise<AICompletion> {
    return this.run(
      (provider) => provider.generateWithTools(messages, tools, options),
      options,
      !options?.disableTools && tools.length > 0,
    );
  }

  processToolResults(toolCalls: AIToolCall[], results: ToolResultMessage[]): AIMessage[] {
    const byId = new Map(results.map((result) => [result.toolCallId, result]));
    return toolCalls.map((call) => ({
      role: 'tool',
      tool_call_id: call.id,
      name: call.function.name,
      content:
        byId.get(call.id)?.content ?? JSON.stringify({ error: 'Tool produced no result.' }),
    }));
  }

  status(): AIServiceStatus {
    return {
      ...(this.activeProvider ? { activeProvider: this.activeProvider } : {}),
      fallbackHistory: this.fallbackHistory.map((entry) => ({ ...entry })),
      providers: this.providers.map((provider) => {
        const stats = this.stats.get(provider.name)!;
        const retryAt = stats.retryAt;
        return {
          name: provider.name,
          model: provider.model,
          priority: provider.priority ?? 0,
          freeTier: provider.capabilities?.freeTier ?? 'unknown',
          ...(provider.capabilities?.contextWindow
            ? { contextWindow: provider.capabilities.contextWindow }
            : {}),
          supportsTools: provider.capabilities?.supportsTools ?? true,
          tasks: provider.capabilities?.tasks ?? [
            'production_analysis',
            'manufacturing_efficiency_analysis',
            'waste_defect_detection',
            'root_cause_analysis',
            'general_question',
            'data_summarization',
          ],
          available: !retryAt || retryAt <= Date.now(),
          ...(stats.unavailableReason ? { unavailableReason: stats.unavailableReason } : {}),
          ...(retryAt && retryAt > Date.now()
            ? { retryAt: new Date(retryAt).toISOString() }
            : {}),
          requests: stats.requests,
          successfulRequests: stats.successfulRequests,
          failedRequests: stats.failedRequests,
          rateLimitErrors: stats.rateLimitErrors,
          quotaExhaustions: stats.quotaExhaustions,
          promptTokens: stats.promptTokens,
          completionTokens: stats.completionTokens,
          totalTokens: stats.totalTokens,
          averageResponseMs:
            stats.requests > 0 ? Math.round(stats.totalResponseMs / stats.requests) : 0,
          ...(stats.lastSuccessAt ? { lastSuccessAt: stats.lastSuccessAt } : {}),
        };
      }),
    };
  }

  private eligible(provider: AIProvider, task: AITask, requiresTools: boolean): boolean {
    const capabilities = provider.capabilities;
    if (requiresTools && capabilities?.supportsTools === false) return false;
    return !capabilities?.tasks || capabilities.tasks.includes(task);
  }

  private async run(
    request: (provider: AIProvider) => Promise<AICompletion>,
    requestOptions: AIRequestOptions | undefined,
    requiresTools: boolean,
  ): Promise<AICompletion> {
    if (requestOptions?.signal?.aborted) {
      throw requestOptions.signal.reason ?? new DOMException('Aborted', 'AbortError');
    }
    const task = requestOptions?.task ?? 'general_question';
    const eligible = this.providers.filter((provider) =>
      this.eligible(provider, task, requiresTools),
    );
    if (eligible.length === 0) {
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'No configured AI model supports this request.',
      });
    }
    const maxAttempts = this.options.fallbackEnabled
      ? Math.min(eligible.length, Math.max(1, this.options.maxRetries + 1))
      : 1;
    const attempted = eligible.slice(0, maxAttempts);
    let firstQuota: AIProviderError | undefined;
    let firstRateLimit: AIProviderError | undefined;
    let lastError: AIProviderError | undefined;
    let availableAttempt = false;

    for (const provider of attempted) {
      if (requestOptions?.signal?.aborted) {
        throw requestOptions.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      const state = this.stats.get(provider.name)!;
      if (state.retryAt && state.retryAt > Date.now()) continue;
      availableAttempt = true;
      state.requests += 1;
      const started = Date.now();
      try {
        const completion = await request(provider);
        const durationMs = Date.now() - started;
        state.totalResponseMs += durationMs;
        state.successfulRequests += 1;
        state.consecutiveFailures = 0;
        state.retryAt = undefined;
        state.unavailableReason = undefined;
        state.unavailableCode = undefined;
        state.lastSuccessAt = new Date().toISOString();
        state.promptTokens += completion.usage?.promptTokens ?? 0;
        state.completionTokens += completion.usage?.completionTokens ?? 0;
        state.totalTokens += completion.usage?.totalTokens ?? 0;
        this.activeProvider = provider.name;
        return {
          ...completion,
          model: completion.model ?? provider.model,
          provider: provider.name,
        };
      } catch (error) {
        if (requestOptions?.signal?.aborted || isAbortError(error)) throw error;
        if (!(error instanceof AIProviderError)) throw error;
        const durationMs = Date.now() - started;
        state.totalResponseMs += durationMs;
        state.failedRequests += 1;
        state.consecutiveFailures += 1;
        lastError = error;
        this.coolDown(provider, state, error);
        if (error.code === 'AI_RATE_LIMITED') {
          state.rateLimitErrors += 1;
          firstRateLimit ??= error;
        } else if (error.code === 'AI_QUOTA_EXHAUSTED') {
          state.quotaExhaustions += 1;
          firstQuota ??= error;
        }
        this.logger?.warn('AI provider request failed; evaluating fallback', {
          provider: provider.name,
          model: provider.model,
          code: error.code,
          retryAt: state.retryAt ? new Date(state.retryAt).toISOString() : undefined,
        });
        const nextProvider = attempted
          .slice(attempted.indexOf(provider) + 1)
          .find((candidate) => {
            const retryAt = this.stats.get(candidate.name)!.retryAt;
            return !retryAt || retryAt <= Date.now();
          });
        if (nextProvider) {
          this.fallbackHistory.push({
            from: provider.name,
            to: nextProvider.name,
            reason: error.code,
            at: new Date().toISOString(),
          });
          if (this.fallbackHistory.length > 50) this.fallbackHistory.shift();
        }
      }
    }

    if (!availableAttempt) {
      const coolingProviders = attempted
        .map((provider) => ({ provider, state: this.stats.get(provider.name)! }))
        .filter(({ state }) => state.retryAt !== undefined);
      const retryAt = coolingProviders
        .map(({ state }) => state.retryAt!)
        .sort((left, right) => left - right)[0];
      if (retryAt) {
        const codes = coolingProviders.map(({ state }) => state.unavailableCode);
        const code = codes.includes('AI_QUOTA_EXHAUSTED')
          ? 'AI_QUOTA_EXHAUSTED'
          : codes.includes('AI_RATE_LIMITED')
            ? 'AI_RATE_LIMITED'
            : codes.includes('AI_AUTH_ERROR')
              ? 'AI_AUTH_ERROR'
              : 'AI_UNAVAILABLE';
        const retryAfterSeconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000));
        throw new AIProviderError({
          code,
          publicMessage:
            code === 'AI_AUTH_ERROR'
              ? `All configured AI providers are temporarily unavailable; check provider credentials and retry in ${retryAfterSeconds} seconds.`
              : `All configured AI providers are temporarily unavailable. Retry in ${retryAfterSeconds} seconds.`,
          retryAfterSeconds,
        });
      }
    }
    if (attempted.length < eligible.length || (!this.options.fallbackEnabled && eligible.length > 1)) {
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage:
          'AI provider attempts failed before all configured fallbacks were tried. Increase AI_MAX_RETRIES or enable AI_FALLBACK_ENABLED.',
        cause: lastError,
      });
    }
    if (firstQuota) {
      throw new AIProviderError({
        code: 'AI_QUOTA_EXHAUSTED',
        publicMessage:
          'All configured AI providers failed; at least one usage quota is exhausted. Please retry after the provider quota resets.',
        retryAfterSeconds: firstQuota.retryAfterSeconds,
        cause: firstQuota,
      });
    }
    if (firstRateLimit) {
      throw new AIProviderError({
        code: 'AI_RATE_LIMITED',
        publicMessage:
          'All configured AI providers failed; at least one provider is rate limited. Please retry after the limit resets.',
        retryAfterSeconds: firstRateLimit.retryAfterSeconds,
        cause: firstRateLimit,
      });
    }
    if (lastError && this.providers.length === 1) throw lastError;
    if (lastError) {
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage:
          'All configured AI providers failed. Check provider credentials and availability, then try again.',
        cause: lastError,
      });
    }
    throw new AIProviderError({
      code: 'AI_UNAVAILABLE',
      publicMessage: 'All configured AI providers are temporarily unavailable. Please try again later.',
    });
  }

  private coolDown(provider: AIProvider, state: ProviderStats, error: AIProviderError): void {
    const base = this.options.cooldownMs;
    const exponential = Math.min(
      this.options.maxCooldownMs,
      base * 2 ** Math.min(state.consecutiveFailures - 1, 10),
    );
    let delayMs = exponential;
    switch (error.code) {
      case 'AI_QUOTA_EXHAUSTED':
        delayMs = Math.max(error.retryAfterSeconds ? error.retryAfterSeconds * 1_000 : 3_600_000, base);
        break;
      case 'AI_RATE_LIMITED':
        delayMs = Math.max(error.retryAfterSeconds ? error.retryAfterSeconds * 1_000 : base, base);
        break;
      case 'AI_AUTH_ERROR':
        delayMs = this.options.maxCooldownMs;
        break;
      case 'AI_MODEL_ERROR':
        delayMs = this.options.maxCooldownMs;
        break;
      case 'AI_UNAVAILABLE':
        break;
      case 'AI_CONTEXT_LENGTH':
      case 'AI_INVALID_RESPONSE':
        delayMs = base;
        break;
    }
    state.retryAt = Date.now() + Math.min(delayMs, this.options.maxCooldownMs);
    state.unavailableReason =
      error.code === 'AI_QUOTA_EXHAUSTED'
        ? 'quota_exhausted'
        : error.code === 'AI_RATE_LIMITED'
          ? 'rate_limited'
          : error.code.toLowerCase();
    state.unavailableCode = error.code;
    this.logger?.debug('AI provider cooldown applied', {
      provider: provider.name,
      reason: state.unavailableReason,
      retryAt: new Date(state.retryAt).toISOString(),
    });
  }
}
