import type { AppConfig } from '../config';
import { isAbortError } from '../errors';
import type { Logger } from '../logger';
import { AttachmentCollector, type Attachment, type DataContextEntry, type SourceReference } from './attachments';
import { buildSystemPrompt, formatDataContext } from './prompt';
import { status, TOOL_PHASE, type AgentStatus } from './status';
import type { ToolRegistry } from './tools';
import type { AIProvider, AIMessage, AIUsage, ToolResultMessage } from './types';

export interface AgentHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentInput {
  question: string;
  history?: AgentHistoryMessage[];
  dataContext?: DataContextEntry[];
  userId: string;
  conversationId?: string;
  locale?: string;
  signal?: AbortSignal;
  emitStatus?: (update: AgentStatus) => void;
}

export interface AgentResult {
  content: string;
  attachments: Attachment[];
  sources: SourceReference[];
  dataContext: DataContextEntry[];
  usage?: AIUsage;
  iterations: number;
  toolsUsed: string[];
  durationMs: number;
  model: string;
  complete: boolean;
}

const MAX_TOOL_CALLS_PER_STEP = 4;
const MAX_HISTORY_MESSAGE_CHARS = 4_000;
const FALLBACK_MESSAGE =
  'I could not complete the analysis within the allowed tool budget. Please narrow the question (for example, specify an entity, period or filter), or start a new chat.';

function trimContent(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function parseToolArguments(raw: string): { value?: Record<string, unknown>; error?: string } {
  const text = raw.trim();
  if (!text) return { value: {} };
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Tool arguments must be a JSON object.' };
    }
    return { value: parsed as Record<string, unknown> };
  } catch {
    return { error: 'Tool arguments were not valid JSON.' };
  }
}

function safeEmit(
  emit: ((update: AgentStatus) => void) | undefined,
  update: AgentStatus,
): void {
  if (!emit) return;
  try {
    emit(update);
  } catch {
    // A broken progress listener must never break the answer.
  }
}

export class Agent {
  readonly model: string;

  constructor(
    private readonly provider: AIProvider,
    private readonly tools: ToolRegistry,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.model = provider.model;
  }

  async run(input: AgentInput): Promise<AgentResult> {
    const started = Date.now();
    const collector = new AttachmentCollector();
    const toolsUsed = new Set<string>();
    const usage: Required<AIUsage> = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let usageSeen = false;
    let iterations = 0;

    const addUsage = (value?: AIUsage): void => {
      if (!value) return;
      usageSeen = true;
      usage.promptTokens += value.promptTokens ?? 0;
      usage.completionTokens += value.completionTokens ?? 0;
      usage.totalTokens += value.totalTokens ?? 0;
    };

    const messages: AIMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({
          locale: input.locale,
          maxContextChars: this.config.ai.maxContextChars,
        }),
      },
    ];

    const context = formatDataContext(
      input.dataContext ?? [],
      Math.min(this.config.ai.maxContextChars, 2_500),
    );
    if (context) {
      messages.push({ role: 'system', content: context });
    }

    const history = (input.history ?? [])
      .filter((message) => message.content.trim().length > 0)
      .slice(-Math.max(0, this.config.ai.maxHistoryMessages));
    for (const message of history) {
      messages.push({
        role: message.role,
        content: trimContent(message.content, MAX_HISTORY_MESSAGE_CHARS),
      });
    }
    messages.push({ role: 'user', content: input.question });

    safeEmit(input.emitStatus, status('understanding'));

    const emitToolStatus = (name: string, entitySet?: string): void => {
      const phase = TOOL_PHASE[name] ?? 'querying_d365';
      safeEmit(input.emitStatus, status(phase, { tool: name, ...(entitySet ? { entitySet } : {}) }));
    };

    try {
      let finalContent = '';
      let completed = false;

      for (let step = 0; step < this.config.ai.maxToolIterations; step += 1) {
        iterations = step + 1;
        const completion = await this.provider.generateWithTools(messages, this.tools.definitions, {
          signal: input.signal,
        });
        addUsage(completion.usage);

        if (completion.toolCalls.length === 0) {
          finalContent = completion.content.trim();
          completed = true;
          break;
        }

        const calls = completion.toolCalls.slice(0, MAX_TOOL_CALLS_PER_STEP);
        messages.push({
          role: 'assistant',
          content: completion.content || null,
          tool_calls: calls,
        });

        const results: ToolResultMessage[] = [];
        for (const call of calls) {
          const name = call.function.name;
          toolsUsed.add(name);
          emitToolStatus(name);

          const parsed = parseToolArguments(call.function.arguments);
          if (parsed.error) {
            this.logger.warn('Malformed tool arguments rejected', {
              tool: name,
              code: 'INVALID_TOOL_ARGUMENTS',
            });
            results.push({
              toolCallId: call.id,
              name,
              content: JSON.stringify({
                error: { code: 'INVALID_TOOL_ARGUMENTS', message: parsed.error },
              }),
            });
            continue;
          }

          const result = await this.tools.execute(name, parsed.value, {
            userId: input.userId,
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
            toolCallId: call.id,
            collector,
            ...(input.signal ? { signal: input.signal } : {}),
            emitStatus: (update) => safeEmit(input.emitStatus, update),
          });

          const contentType =
            result.meta?.entitySet !== undefined
              ? status(
                  result.isError ? 'querying_d365' : (TOOL_PHASE[name] ?? 'querying_d365'),
                  {
                    tool: name,
                    entitySet: result.meta.entitySet,
                    detail: result.isError ? 'Tool error' : `${result.meta.rows ?? 0} row(s)`,
                  },
                )
              : status(TOOL_PHASE[name] ?? 'querying_d365', {
                  tool: name,
                  detail: result.isError ? 'Tool error' : undefined,
                });
          safeEmit(input.emitStatus, contentType);

          results.push({
            toolCallId: call.id,
            name,
            content: JSON.stringify(result.content),
          });
        }

        messages.push(...this.provider.processToolResults(calls, results));
      }

      if (!completed) {
        safeEmit(input.emitStatus, status('preparing_response', { detail: 'Tool budget reached' }));
        messages.push({
          role: 'system',
          content:
            'The tool-call budget is exhausted. Using only the evidence already gathered, provide the best final answer now. State clearly what is partial or unknown. Do not call tools or invent data.',
        });
        const completion = await this.provider.generateResponse(messages, { signal: input.signal });
        addUsage(completion.usage);
        finalContent = completion.content.trim();
        completed = true;
      }

      if (!finalContent) {
        safeEmit(input.emitStatus, status('preparing_response'));
        const completion = await this.provider.generateResponse(messages, { signal: input.signal });
        addUsage(completion.usage);
        finalContent = completion.content.trim();
      }

      const content = finalContent || FALLBACK_MESSAGE;
      safeEmit(input.emitStatus, status('completed'));

      const durationMs = Date.now() - started;
      this.logger.audit({
        action: 'ai.turn',
        outcome: 'success',
        userRef: input.userId,
        ...(input.conversationId ? { conversationRef: input.conversationId } : {}),
        durationMs,
        metadata: {
          model: this.model,
          iterations,
          tools: [...toolsUsed],
          totalTokens: usageSeen ? usage.totalTokens : undefined,
        },
      });

      return {
        content,
        attachments: collector.attachments,
        sources: collector.sources,
        dataContext: collector.dataContext,
        ...(usageSeen
          ? {
              usage: {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens,
              },
            }
          : {}),
        iterations,
        toolsUsed: [...toolsUsed],
        durationMs,
        model: this.model,
        complete: completed,
      };
    } catch (error) {
      if (isAbortError(error)) throw error;
      this.logger.audit({
        action: 'ai.turn',
        outcome: 'failure',
        userRef: input.userId,
        ...(input.conversationId ? { conversationRef: input.conversationId } : {}),
        durationMs: Date.now() - started,
        errorCode: (error as { code?: string }).code ?? 'AI_ERROR',
        metadata: { model: this.model, iterations, tools: [...toolsUsed] },
      });
      throw error;
    }
  }
}
