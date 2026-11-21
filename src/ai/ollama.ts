import { AIProviderError, isAbortError } from '../errors';
import type { Logger } from '../logger';
import type { FetchLike } from '../d365/auth';
import type {
  AICompletion,
  AIModelCapabilities,
  AIMessage,
  AIProvider,
  AIRequestOptions,
  AIStatus,
  AIToolCall,
  AIToolDefinition,
  ToolResultMessage,
} from './types';

/**
 * Local-only AI provider. Every request goes to the Ollama daemon on the
 * loopback interface. No API key, cloud endpoint or remote fallback is used.
 */
export interface OllamaProviderOptions {
  baseUrl: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxCompletionTokens: number;
  /** GGUF context size reported by Ollama; bounds the KV cache. */
  numCtx?: number;
  /** Qwen3.5 is a reasoning model; thinking is off by default for short, auditable ERP answers. */
  thinking?: boolean;
  /** Defensive bound on serialized prompt size (the HTTP body limit is separate). */
  maxPromptChars?: number;
  /** Defensive bound on message count (history + tool iterations). */
  maxMessages?: number;
  /** Retry only transient network/5xx failures; never retries a model error. */
  maxRetries?: number;
  /** Generic label exposed to the UI. Never include a provider or model identifier here. */
  publicModelLabel?: string;
  name?: string;
  fetchImpl?: FetchLike;
  logger?: Logger;
  capabilities?: AIModelCapabilities;
}

export interface OllamaConnectionStatus {
  connected: boolean;
  modelAvailable: boolean;
}

interface OllamaToolCallWire {
  id?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

interface OllamaMessageWire {
  role?: unknown;
  content?: unknown;
  thinking?: unknown;
  tool_calls?: unknown;
}

interface OllamaChatResponse {
  model?: unknown;
  message?: OllamaMessageWire;
  done_reason?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  error?: unknown;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: unknown }>;
}

const DEFAULT_MAX_PROMPT_CHARS = 150_000;
const DEFAULT_MAX_MESSAGES = 80;
const STATUS_CACHE_MS = 10_000;
const STATUS_TIMEOUT_MS = 3_000;
/** The local runner may be reloading after a crash; allow it time to recover. */
const RETRY_BACKOFF_MS = 750;

function stripThinking(content: string): string {
  return content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning\s*>/gi, '')
    .replace(/<\/?reasoning\b[^>]*>/gi, '')
    .trim();
}

function normaliseModelName(name: string): string {
  return name.trim().toLowerCase();
}

function isModelMatch(installed: string, configured: string): boolean {
  const installedBase = normaliseModelName(installed).split(':')[0] ?? '';
  const configuredBase = normaliseModelName(configured).split(':')[0] ?? '';
  return installedBase.length > 0 && installedBase === configuredBase;
}

function argumentsToJson(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '{}';
  if (typeof value === 'object' && !Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  }
  return JSON.stringify(value);
}

/** Ollama expects already-decoded tool arguments on assistant history messages. */
function argumentsToObject(value: unknown): Record<string, unknown> {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/**
 * Qwen chat templates raise an error ("System message must be at the
 * beginning") for any system message after index 0, which surfaces as an HTTP
 * 500 from Ollama. Keep the full system content, but fold every system message
 * into one leading message so a late instruction can never break the turn.
 */
function toOllamaMessages(messages: AIMessage[]): Array<Record<string, unknown>> {
  const systemParts: string[] = [];
  const conversation: AIMessage[] = [];
  for (const message of messages) {
    const content = (message.content ?? '').trim();
    if (message.role === 'system') {
      if (content) systemParts.push(content);
    } else {
      conversation.push(message);
    }
  }

  const wire: Array<Record<string, unknown>> = [];
  if (systemParts.length > 0) {
    wire.push({ role: 'system', content: systemParts.join('\n\n') });
  }
  for (const message of conversation) {
    if (message.role === 'tool') {
      // Ollama accepts a plain tool result message; the backend has already
      // executed the tool and validated its arguments.
      wire.push({ role: 'tool', content: message.content ?? '' });
      continue;
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      wire.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls.map((call) => ({
          ...(call.id ? { id: call.id } : {}),
          function: {
            name: call.function.name,
            arguments: argumentsToObject(call.function.arguments),
          },
        })),
      });
      continue;
    }
    wire.push({ role: message.role, content: message.content ?? '' });
  }
  return wire;
}

function normalizeToolCalls(
  raw: unknown,
  allowed: Set<string>,
  logger?: Logger,
): AIToolCall[] {
  if (!Array.isArray(raw)) return [];
  const calls: AIToolCall[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index] as OllamaToolCallWire;
    const name = item?.function?.name;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (!allowed.has(name)) {
      // Only explicitly registered tools may ever reach the backend executor.
      logger?.warn('Ollama returned an unregistered tool call', { tool: name });
      continue;
    }
    calls.push({
      id: typeof item.id === 'string' && item.id ? item.id : `call_${index}_${Date.now()}`,
      type: 'function',
      function: {
        name,
        arguments: argumentsToJson(item.function?.arguments),
      },
    });
  }
  return calls;
}

/**
 * Compatibility path for Qwen builds that describe a tool call as JSON in the
 * message body instead of using Ollama's native `tool_calls` field. Only exact
 * registered tool names are accepted, and the JSON is removed from the answer.
 */
function extractStructuredToolCalls(
  content: string,
  allowed: Set<string>,
): { calls: AIToolCall[]; remaining: string } | undefined {
  const candidates: Array<{ text: string; remove: boolean }> = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenced.exec(content)) !== null) {
    if (match[1]) candidates.push({ text: match[1].trim(), remove: true });
  }
  const trimmed = content.trim();
  if (trimmed) candidates.push({ text: trimmed, remove: false });

  for (const candidate of candidates) {
    if (!candidate.text.startsWith('{') && !candidate.text.startsWith('[')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate.text);
    } catch {
      continue;
    }
    const entries: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? 'tool_calls' in parsed && Array.isArray((parsed as { tool_calls?: unknown }).tool_calls)
          ? (parsed as { tool_calls: unknown[] }).tool_calls
          : [parsed]
        : [];
    const calls: AIToolCall[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index] as Record<string, unknown>;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const fn = entry.function && typeof entry.function === 'object'
        ? (entry.function as Record<string, unknown>)
        : {};
      const name = typeof entry.name === 'string'
        ? entry.name
        : typeof entry.tool === 'string'
          ? entry.tool
          : typeof fn.name === 'string'
            ? fn.name
            : '';
      if (!name || !allowed.has(name)) continue;
      const args = entry.arguments ?? entry.parameters ?? fn.arguments ?? fn.parameters ?? {};
      calls.push({
        id: typeof entry.id === 'string' && entry.id ? entry.id : `call_json_${index}_${Date.now()}`,
        type: 'function',
        function: { name, arguments: argumentsToJson(args) },
      });
    }
    if (calls.length === 0) continue;
    const remaining = candidate.remove ? content.replace(candidate.text, '').trim() : '';
    return { calls, remaining };
  }
  return undefined;
}

function upstreamError(payload: OllamaChatResponse): string {
  const error = payload.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

function waitForRetry(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class OllamaProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities?: AIModelCapabilities;
  private readonly options: OllamaProviderOptions & {
    baseUrl: string;
    fetchImpl: FetchLike;
    maxPromptChars: number;
    maxMessages: number;
    maxRetries: number;
    thinking: boolean;
  };
  private cachedStatus?: { at: number; value: OllamaConnectionStatus };
  private readonly publicModelLabel: string;
  private readonly stats = {
    requests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    totalResponseMs: 0,
    lastSuccessAt: undefined as string | undefined,
  };

  constructor(options: OllamaProviderOptions) {
    this.options = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      fetchImpl: options.fetchImpl ?? fetch,
      maxPromptChars: options.maxPromptChars ?? DEFAULT_MAX_PROMPT_CHARS,
      maxMessages: options.maxMessages ?? DEFAULT_MAX_MESSAGES,
      maxRetries: options.maxRetries ?? 2,
      thinking: options.thinking ?? false,
    };
    this.name = options.name ?? 'ollama';
    this.model = options.model;
    this.publicModelLabel = options.publicModelLabel ?? 'AI assistant';
    this.capabilities = options.capabilities ?? {
      supportsTools: true,
      tasks: [
        'production_analysis',
        'manufacturing_efficiency_analysis',
        'waste_defect_detection',
        'root_cause_analysis',
        'general_question',
        'data_summarization',
      ],
      freeTier: 'verified',
      ...(options.numCtx ? { contextWindow: options.numCtx } : {}),
    };
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
    return toolCalls.map((call) => ({
      role: 'tool',
      content: byId.get(call.id)?.content ?? JSON.stringify({ error: 'Tool produced no result.' }),
    }));
  }

  /** Live, cached connectivity/model probe used by the health endpoint. */
  async getConnectionStatus(force = false): Promise<OllamaConnectionStatus> {
    const now = Date.now();
    if (!force && this.cachedStatus && now - this.cachedStatus.at < STATUS_CACHE_MS) {
      return this.cachedStatus.value;
    }
    try {
      const response = await this.options.fetchImpl(`${this.options.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
      const payload = (await response.json()) as OllamaTagsResponse;
      const models = Array.isArray(payload.models)
        ? payload.models
            .map((item) => (typeof item?.name === 'string' ? item.name : ''))
            .filter(Boolean)
        : [];
      const value = {
        connected: true,
        modelAvailable: models.some((name) => isModelMatch(name, this.model)),
      };
      this.cachedStatus = { at: now, value };
      return value;
    } catch (error) {
      this.options.logger?.warn('Ollama connectivity check failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      const value = { connected: false, modelAvailable: false };
      this.cachedStatus = { at: now, value };
      return value;
    }
  }

  /** Browser-safe health snapshot; the connection probe is cached for 10s. */
  async status(): Promise<AIStatus> {
    const connection = await this.getConnectionStatus();
    return {
      configured: true,
      available: connection.connected && connection.modelAvailable,
      model: this.publicModelLabel,
      requests: this.stats.requests,
      successfulRequests: this.stats.successfulRequests,
      failedRequests: this.stats.failedRequests,
      totalTokens: this.stats.totalTokens,
      averageResponseMs:
        this.stats.requests > 0 ? Math.round(this.stats.totalResponseMs / this.stats.requests) : 0,
      ...(this.stats.lastSuccessAt ? { lastSuccessAt: this.stats.lastSuccessAt } : {}),
    };
  }

  private assertPromptSize(messages: AIMessage[]): void {
    if (messages.length > this.options.maxMessages) {
      throw new AIProviderError({
        code: 'AI_CONTEXT_LENGTH',
        publicMessage:
          'This conversation has too many turns. Start a new chat or ask a narrower question.',
        message: `Ollama request exceeded ${this.options.maxMessages} messages`,
      });
    }
    const chars = messages.reduce(
      (total, message) => total + (message.content?.length ?? 0) + (message.name?.length ?? 0),
      0,
    );
    if (chars > this.options.maxPromptChars) {
      throw new AIProviderError({
        code: 'AI_CONTEXT_LENGTH',
        publicMessage:
          'This request is too large. Start a new chat or ask a narrower question.',
        message: `Ollama request exceeded ${this.options.maxPromptChars} prompt characters`,
      });
    }
  }

  private async request(
    messages: AIMessage[],
    tools: AIToolDefinition[] | undefined,
    options: AIRequestOptions,
    retry = 0,
  ): Promise<AICompletion> {
    this.assertPromptSize(messages);
    const started = Date.now();
    if (retry === 0) this.stats.requests += 1;
    const allowed = new Set((tools ?? []).map((tool) => tool.function.name));
    const maxCompletionTokens = options.maxCompletionTokens ?? this.options.maxCompletionTokens;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOllamaMessages(messages),
      stream: false,
      think: this.options.thinking,
      options: {
        temperature: options.temperature ?? this.options.temperature,
        num_predict: Math.max(1, Math.trunc(maxCompletionTokens)),
        ...(this.options.numCtx ? { num_ctx: this.options.numCtx } : {}),
      },
    };
    if (tools && tools.length > 0 && !options.disableTools) {
      // Ollama accepts the function-tool schema used by the existing registry.
      body.tools = tools;
    }

    let response: Response;
    try {
      response = await this.options.fetchImpl(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([
          ...(options.signal ? [options.signal] : []),
          AbortSignal.timeout(this.options.timeoutMs),
        ]),
      });
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason ?? error;
      if (retry < this.options.maxRetries && !isAbortError(error)) {
        await waitForRetry(RETRY_BACKOFF_MS * (retry + 1), options.signal);
        return this.request(messages, tools, options, retry + 1);
      }
      if (isAbortError(error)) {
        this.stats.failedRequests += 1;
        throw new AIProviderError({
          code: 'AI_UNAVAILABLE',
          publicMessage: 'The AI service did not respond in time. Please try again.',
          message: 'Ollama request timed out',
          cause: error,
        });
      }
      this.stats.failedRequests += 1;
      this.options.logger?.warn('Ollama request failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'The AI service is unavailable. Please try again shortly.',
        message: 'Ollama network error',
        cause: error,
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      this.stats.failedRequests += 1;
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'Unable to read the AI service response. Please try again.',
        message: 'Ollama response read failed',
        cause: error,
      });
    }

    let payload: OllamaChatResponse;
    try {
      payload = JSON.parse(text) as OllamaChatResponse;
    } catch {
      payload = {};
    }

    const upstream = upstreamError(payload);
    if (response.ok && upstream) {
      // Some runner failures are returned in a 200 body instead of the status line.
      this.options.logger?.warn('Ollama reported an error in a successful response', { upstream });
      this.stats.failedRequests += 1;
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage: 'The AI service is temporarily unavailable. Please try again shortly.',
        message: `Ollama response reported an error: ${upstream}`,
      });
    }

    if (!response.ok) {
      // Server-side only: the upstream text is diagnostic and never reaches the browser.
      this.options.logger?.warn('Ollama returned an error', {
        status: response.status,
        upstream,
        durationMs: Date.now() - started,
      });
      if (response.status === 404) {
        this.stats.failedRequests += 1;
        throw new AIProviderError({
          code: 'AI_MODEL_ERROR',
          publicMessage:
            'The AI service is not ready. Ask the administrator to check the service configuration and try again.',
          message: `Ollama model not found: ${upstream}`,
        });
      }
      if (
        response.status === 413 ||
        /context|too long|too many tokens/i.test(upstream)
      ) {
        this.stats.failedRequests += 1;
        throw new AIProviderError({
          code: 'AI_CONTEXT_LENGTH',
          publicMessage:
            'This conversation is too large. Start a new chat or ask a narrower question.',
          message: `Ollama context length exceeded: ${upstream}`,
        });
      }
      if (response.status >= 500 && retry < this.options.maxRetries) {
        await waitForRetry(RETRY_BACKOFF_MS * (retry + 1), options.signal);
        return this.request(messages, tools, options, retry + 1);
      }
      this.stats.failedRequests += 1;
      throw new AIProviderError({
        code: 'AI_UNAVAILABLE',
        publicMessage:
          response.status >= 500
            ? 'The AI service is temporarily unavailable. Please try again shortly.'
            : `The AI service rejected the request (${response.status}). Try a shorter question.`,
        message: `Ollama returned ${response.status}: ${upstream}`,
      });
    }

    if (!payload.message || typeof payload.message !== 'object') {
      this.stats.failedRequests += 1;
      throw new AIProviderError({
        code: 'AI_INVALID_RESPONSE',
        publicMessage: 'The AI service returned an empty response. Please try again.',
        message: 'Ollama response had no message',
      });
    }

    const content = stripThinking(
      typeof payload.message.content === 'string' ? payload.message.content : '',
    );
    const nativeCalls = normalizeToolCalls(payload.message.tool_calls, allowed, this.options.logger);
    const structured = nativeCalls.length === 0 && allowed.size > 0 && content
      ? extractStructuredToolCalls(content, allowed)
      : undefined;
    const toolCalls = structured?.calls ?? nativeCalls;
    const finalContent = structured ? structured.remaining : content;

    if (!finalContent && toolCalls.length === 0) {
      this.stats.failedRequests += 1;
      throw new AIProviderError({
        code: 'AI_INVALID_RESPONSE',
        publicMessage:
          'The AI service returned no usable answer. Try a shorter, more specific question.',
        message: 'Ollama response was empty',
      });
    }

    const promptTokens = typeof payload.prompt_eval_count === 'number' ? payload.prompt_eval_count : 0;
    const completionTokens = typeof payload.eval_count === 'number' ? payload.eval_count : 0;
    this.stats.successfulRequests += 1;
    this.stats.totalTokens += promptTokens + completionTokens;
    this.stats.totalResponseMs += Date.now() - started;
    this.stats.lastSuccessAt = new Date().toISOString();
    this.options.logger?.debug('Ollama completion received', {
      model: this.model,
      toolCalls: toolCalls.length,
      finishReason: typeof payload.done_reason === 'string' ? payload.done_reason : undefined,
      durationMs: Date.now() - started,
      totalTokens: promptTokens + completionTokens,
    });

    return {
      content: finalContent,
      toolCalls,
      ...(typeof payload.done_reason === 'string' ? { finishReason: payload.done_reason } : {}),
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      model: typeof payload.model === 'string' ? payload.model : this.model,
      provider: this.name,
    };
  }
}
