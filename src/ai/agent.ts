import type { AppConfig } from '../config';
import { isAbortError } from '../errors';
import type { Logger } from '../logger';
import { AttachmentCollector, type Attachment, type DataContextEntry, type SourceReference } from './attachments';
import { formatBusinessContext, toModelEvidence } from './business';
import { classifyQuestionIntent, detectListIntent, detectNamedSearchIntent } from './intent';
import { buildSystemPrompt } from './prompt';
import { status, TOOL_PHASE, type AgentStatus } from './status';
import type { ToolRegistry } from './tools';
import type {
  AICompletion,
  AIProvider,
  AIMessage,
  AIToolCall,
  AIUsage,
  AITask,
  ToolResultMessage,
} from './types';

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
  provider: string;
  task: AITask;
  fallbackUsed: boolean;
  complete: boolean;
}

const MAX_TOOL_CALLS_PER_STEP = 4;
const MAX_HISTORY_MESSAGE_CHARS = 4_000;
const FALLBACK_MESSAGE =
  'I could not complete the analysis within the allowed time. Please try again, or narrow the period or product.';
const NO_ERP_EVIDENCE_MESSAGE =
  'I could not retrieve the required ERP evidence. Please try again.';

function trimContent(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Guarantees an explicit business-language partial-data warning in the answer. */
export function withPartialNotice(content: string, sources: SourceReference[], locale?: string): string {
  if (!sources.some((source) => source.complete === false)) return content;
  const note =
    locale === 'ar'
      ? 'تنبيه: تستند النتيجة إلى مراجعة جزئية للسجلات المتاحة.'
      : 'Note: this result is based on a partial review of the available records.';
  return content.includes(note) ? content : `${content}\n\n${note}`;
}

const FORBIDDEN_FOLLOWUP =
  /(يرجى التحقق|التحقق من|تأكد من|مراجعة إعدادات|تزويدي بالبيانات|الفترة الصحيحة|الفترة المطلوبة|مبيعات حديثة|please\s+(?:check|verify|provide)|verify\s+(?:the|that)|check\s+(?:system|settings|configuration|whether|the\s+period)|provide\s+the\s+period)/i;

/**
 * Deterministic answer guard. A small model can still add "please check your
 * settings" after a historical fallback. That would contradict the evidence
 * boundary, so remove those lines and state the actual covered period.
 */
export function guardAnswer(content: string, sources: SourceReference[], locale?: string): string {
  const fallbackNote = sources
    .flatMap((source) => source.notes ?? [])
    .find(
      (note) =>
        /figures below cover all available recorded history/i.test(note) ||
        /most recent recorded periods with data/i.test(note) ||
        /all available recorded history falls in a single recorded period/i.test(note),
    );
  let guarded = withPartialNotice(content, sources, locale);
  if (fallbackNote) {
    const kept = guarded
      .split('\n')
      .filter((line) => !FORBIDDEN_FOLLOWUP.test(line))
      .join('\n')
      .trim();
    guarded = kept || guarded;
    if (/most recent recorded periods with data/i.test(fallbackNote)) {
      const periods = fallbackNote.split('data: ')[1]?.replace(/\.$/, '') ?? '';
      const statement = locale === 'ar'
        ? `الرد مبني على الفترتين المسجلتين المتاحتين فعلياً: ${periods}.`
        : `The comparison covers the two recorded periods with data: ${periods}.`;
      if (!guarded.includes(statement)) guarded = `${guarded}\n\n${statement}`;
    } else if (/single recorded period/i.test(fallbackNote)) {
      const statement = locale === 'ar'
        ? 'تقع كل السجلات المتاحة في فترة مسجلة واحدة، لذلك لا يمكن تحديد زيادة بين فترتين؛ الأرقام المعروضة هي إجماليات تلك الفترة.'
        : 'All available records fall in one recorded period, so no between-period increase can be determined; the figures shown are totals for that period.';
      if (!guarded.includes(statement)) guarded = `${guarded}\n\n${statement}`;
    } else {
      const statement = locale === 'ar'
        ? 'الأرقام المذكورة تغطي كامل السجلات المتاحة فعلياً.'
        : 'These figures cover all available recorded history.';
      if (!guarded.includes(statement)) guarded = `${guarded}\n\n${statement}`;
    }
  }
  const topNNote = sources
    .filter((source) => source.operation === 'inventory_summary')
    .flatMap((source) => source.notes ?? [])
    .find((note) => /Showing the top (\d+) of (\d+) products/i.test(note));
  if (topNNote) {
    const match = /Showing the top (\d+) of (\d+) products/i.exec(topNNote);
    const shown = match?.[1] ?? '';
    const total = match?.[2] ?? '';
    const invalidClaim =
      locale === 'ar'
        ? /(صفر تماماً لـ|جميع المنتجات|كل المنتجات|لا يمكن تحديد|تحتاج إلى مقارنة مخزون تاريخي)/u
        : /(all products|every product|cannot be determined|need historical inventory)/i;
    const kept = guarded
      .split('\n')
      .filter((line) => !invalidClaim.test(line))
      .join('\n')
      .trim();
    guarded = kept || guarded;
    const statement = locale === 'ar'
      ? `القائمة المرفقة تعرض ${shown} منتجاً بمخزون صفري من أصل ${total} منتجاً تم فحصها، ولا يمكن تعميم النتيجة على المنتجات غير المعروضة.`
      : `The attached list shows ${shown} zero-stock products out of ${total} products reviewed; the result cannot be generalised to products not shown.`;
    if (!guarded.includes(statement)) guarded = `${guarded}\n\n${statement}`;
  }
  return guarded;
}

function taskForQuestion(question: string): AITask {
  const normalized = question.toLowerCase();
  if (/root cause|سبب جذري|تحليل السبب/.test(normalized)) return 'root_cause_analysis';
  if (/defect|waste|scrap|reject|عيوب|هالك|فاقد|مرفوض/.test(normalized)) {
    return 'waste_defect_detection';
  }
  if (/efficien|productivity|throughput|كفاءة|إنتاجية|معدل الإنتاج/.test(normalized)) {
    return 'manufacturing_efficiency_analysis';
  }
  if (/manufactur|production|factory|line output|تصنيع|إنتاج|مصنع/.test(normalized)) {
    return 'production_analysis';
  }
  if (/customer|sales|inventory|supplier|order|revenue|مبيعات|مخزون|عميل|مورد|طلب/.test(normalized)) {
    return 'general_question';
  }
  return 'general_question';
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
    let completionTokensUsed = 0;
    let model = this.model;
    let providerName = this.provider.primaryProviderName ?? this.provider.name;
    const task = taskForQuestion(input.question);
    const needsTools = classifyQuestionIntent(input.question) === 'erp';
    let iterations = 0;
    let forcedToolRetries = 0;

    const addUsage = (completion: AICompletion, requestedMaxTokens: number): void => {
      model = completion.model ?? model;
      providerName = completion.provider ?? providerName;
      if (completion.usage) {
        usageSeen = true;
        usage.promptTokens += completion.usage.promptTokens ?? 0;
        usage.completionTokens += completion.usage.completionTokens ?? 0;
        usage.totalTokens += completion.usage.totalTokens ?? 0;
      }
      completionTokensUsed += completion.usage?.completionTokens ?? requestedMaxTokens;
    };

    const systemPrompt = buildSystemPrompt({
      locale: input.locale,
      maxContextChars: this.config.ai.maxContextChars,
    });
    const context = formatBusinessContext(
      input.dataContext ?? [],
      Math.min(this.config.ai.maxContextChars, 2_500),
    );
    // Qwen templates only accept a system message at index 0. Keep the snapshot
    // evidence, but append it to the single leading system message.
    const messages: AIMessage[] = [
      { role: 'system', content: context ? `${systemPrompt}\n\n${context}` : systemPrompt },
    ];

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

    safeEmit(input.emitStatus, status('thinking'));

    const emitToolStatus = (name: string, entitySet?: string): void => {
      const phase = TOOL_PHASE[name] ?? 'querying_d365';
      safeEmit(input.emitStatus, status(phase, { tool: name, ...(entitySet ? { entitySet } : {}) }));
    };

    // Plain list questions are deterministic reads of the verified master data
    // source. Pre-load the evidence instead of letting a small model invent a
    // search term or pick an invoice table, then let it answer from real rows.
    const listIntent = needsTools ? detectListIntent(input.question) : undefined;
    if (listIntent) {
      const call: AIToolCall = {
        id: 'forced-list-1',
        type: 'function',
        function: {
          name: 'list_business_records',
          arguments: JSON.stringify({ question: input.question, category: listIntent.category, limit: 50 }),
        },
      };
      messages.push({ role: 'assistant', content: null, tool_calls: [call] });
      toolsUsed.add(call.function.name);
      emitToolStatus(call.function.name);
      try {
        const result = await this.tools.execute(
          call.function.name,
          { question: input.question, category: listIntent.category, limit: 50 },
          {
            userId: input.userId,
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
            toolCallId: call.id,
            collector,
            ...(input.signal ? { signal: input.signal } : {}),
            emitStatus: (update) => safeEmit(input.emitStatus, update),
          },
        );
        emitToolStatus(call.function.name, result.meta?.entitySet);
        messages.push(
          ...this.provider.processToolResults(
            [call],
            [
              {
                toolCallId: call.id,
                name: call.function.name,
                content: JSON.stringify(toModelEvidence(call.function.name, result.content)),
              },
            ],
          ),
        );
      } catch (error) {
        this.logger.warn('Deterministic list retrieval failed', {
          tool: call.function.name,
          category: listIntent.category,
          error: error instanceof Error ? error.name : 'UnknownError',
        });
        messages.push(
          ...this.provider.processToolResults(
            [call],
            [
              {
                toolCallId: call.id,
                name: call.function.name,
                content: JSON.stringify({
                  problem: 'The supplier, customer or product list could not be retrieved from ERP.',
                }),
              },
            ],
          ),
        );
      }
    }

    // A named product line must be searched by that business term. Without this
    // pre-load a small model can choose the unfiltered list tool and then invent
    // a count of "Touch" products from unrelated master rows.
    const namedSearchIntent = needsTools && !listIntent ? detectNamedSearchIntent(input.question) : undefined;
    if (namedSearchIntent) {
      const args = {
        question: input.question,
        searchTerm: namedSearchIntent.searchTerm,
        category: namedSearchIntent.category,
        limit: 50,
      };
      const call: AIToolCall = {
        id: 'forced-search-1',
        type: 'function',
        function: { name: 'search_erp_records', arguments: JSON.stringify(args) },
      };
      messages.push({ role: 'assistant', content: null, tool_calls: [call] });
      toolsUsed.add(call.function.name);
      emitToolStatus(call.function.name);
      try {
        const result = await this.tools.execute(call.function.name, args, {
          userId: input.userId,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          toolCallId: call.id,
          collector,
          ...(input.signal ? { signal: input.signal } : {}),
          emitStatus: (update) => safeEmit(input.emitStatus, update),
        });
        emitToolStatus(call.function.name, result.meta?.entitySet);
        messages.push(
          ...this.provider.processToolResults(
            [call],
            [
              {
                toolCallId: call.id,
                name: call.function.name,
                content: JSON.stringify(toModelEvidence(call.function.name, result.content)),
              },
            ],
          ),
        );
      } catch (error) {
        this.logger.warn('Deterministic named-record search failed', {
          tool: call.function.name,
          searchTerm: namedSearchIntent.searchTerm,
          error: error instanceof Error ? error.name : 'UnknownError',
        });
        messages.push(
          ...this.provider.processToolResults(
            [call],
            [
              {
                toolCallId: call.id,
                name: call.function.name,
                content: JSON.stringify({ problem: 'The named product records could not be retrieved from ERP.' }),
              },
            ],
          ),
        );
      }
    }

    try {
      let finalContent = '';
      let completed = false;
      const finalTokenReserve = Math.min(
        this.config.ai.maxCompletionTokens,
        Math.max(128, Math.floor(this.config.ai.maxTurnCompletionTokens * 0.2)),
      );

      // A named product search already has its evidence. Hiding the unfiltered
      // list tool prevents the model from replacing that evidence with an
      // unrelated master-list table.
      const visibleToolDefinitions = namedSearchIntent
        ? this.tools.definitions.filter((definition) => definition.function.name !== 'list_business_records')
        : this.tools.definitions;

      // General conversation is answered without exposing any ERP tool to the model.
      for (let step = 0; step < (needsTools ? this.config.ai.maxToolIterations : 0); step += 1) {
        const remainingTokens =
          this.config.ai.maxTurnCompletionTokens - completionTokensUsed - finalTokenReserve;
        const requestMaxTokens = Math.min(this.config.ai.maxCompletionTokens, remainingTokens);
        if (requestMaxTokens <= 0) break;

        iterations = step + 1;
        const completion = await this.provider.generateWithTools(messages, visibleToolDefinitions, {
          signal: input.signal,
          maxCompletionTokens: requestMaxTokens,
          task,
        });
        addUsage(completion, requestMaxTokens);

        if (completion.toolCalls.length === 0) {
          // A small local model sometimes declines to call a tool and answers
          // from assumption, including fabricated "no data" answers. An ERP
          // question must never be answered without retrieved evidence.
          if (needsTools && toolsUsed.size === 0) {
            if (forcedToolRetries < 2) {
              forcedToolRetries += 1;
              messages.push({
                role: 'user',
                content:
                  forcedToolRetries === 1
                    ? 'You must use the appropriate read-only business tool to retrieve real records before answering this question. Do not answer from assumption. Call exactly one tool now.'
                    : 'Call the tool now. Answering without retrieved ERP evidence is not allowed. If no suitable tool exists, call the record search tool.',
              });
              continue;
            }
            finalContent = NO_ERP_EVIDENCE_MESSAGE;
            completed = true;
            break;
          }
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
            // Give the model business evidence, not raw ERP metadata. The
            // collector keeps the full result for audit and memory.
            content: JSON.stringify(toModelEvidence(name, result.content)),
          });
        }

        messages.push(...this.provider.processToolResults(calls, results));
      }

      if (!completed) {
        const remainingTokens = this.config.ai.maxTurnCompletionTokens - completionTokensUsed;
        if (remainingTokens <= 0) {
          finalContent = FALLBACK_MESSAGE;
          completed = false;
        } else {
          safeEmit(
            input.emitStatus,
            status('preparing_response', {
              detail: needsTools
                ? completionTokensUsed + finalTokenReserve >=
                  this.config.ai.maxTurnCompletionTokens
                  ? 'Completion token budget reached'
                  : 'Tool budget reached'
                : undefined,
            }),
          );
          // A user-role instruction keeps the single-system-message invariant
          // required by the Qwen chat template. General questions need no
          // extra instruction: the original user message stays the last query.
          if (needsTools) {
            messages.push({
              role: 'user',
              content:
                'The tool-call budget is exhausted, or the completion-token budget has been reached. Using only the evidence already gathered, provide the best final answer now. State clearly what is partial or unknown. Do not call tools or invent data.',
            });
          }
          const completion = await this.provider.generateResponse(messages, {
            signal: input.signal,
            maxCompletionTokens: Math.min(this.config.ai.maxCompletionTokens, remainingTokens),
            task: needsTools ? 'data_summarization' : 'general_question',
          });
          addUsage(completion, Math.min(this.config.ai.maxCompletionTokens, remainingTokens));
          finalContent = completion.content.trim();
          completed = true;
        }
      }

      if (!finalContent) {
        safeEmit(input.emitStatus, status('preparing_response'));
        const remainingTokens = this.config.ai.maxTurnCompletionTokens - completionTokensUsed;
        if (remainingTokens > 0) {
          const requestMaxTokens = Math.min(this.config.ai.maxCompletionTokens, remainingTokens);
          const completion = await this.provider.generateResponse(messages, {
            signal: input.signal,
            maxCompletionTokens: requestMaxTokens,
            task: 'data_summarization',
          });
          addUsage(completion, requestMaxTokens);
          finalContent = completion.content.trim();
        }
      }

      const content = guardAnswer(finalContent || FALLBACK_MESSAGE, collector.sources, input.locale);
      safeEmit(input.emitStatus, status('completed'));

      const durationMs = Date.now() - started;
      this.logger.audit({
        action: 'ai.turn',
        outcome: 'success',
        userRef: input.userId,
        ...(input.conversationId ? { conversationRef: input.conversationId } : {}),
        durationMs,
        metadata: {
          model,
          provider: providerName,
          task,
          fallbackUsed:
            providerName !== (this.provider.primaryProviderName ?? this.provider.name),
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
        model,
        provider: providerName,
        task,
        fallbackUsed:
          providerName !== (this.provider.primaryProviderName ?? this.provider.name),
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
        metadata: { model, iterations, tools: [...toolsUsed] },
      });
      throw error;
    }
  }
}
