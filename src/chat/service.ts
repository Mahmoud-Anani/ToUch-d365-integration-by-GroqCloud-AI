import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import { NotFoundError, ValidationError } from '../errors';
import type { Agent, AgentResult } from '../ai/agent';
import type { Attachment, DataContextEntry, SourceReference } from '../ai/attachments';
import { friendlyLabel } from '../ai/business';
import type { ConversationStore } from './store';
import { DEFAULT_TITLE, normaliseTitle } from './store';
import type {
  ChatMessageMeta,
  ChatMessageRecord,
  ConversationRecord,
  ConversationSummary,
  PublicConversation,
} from './types';

const MAX_MESSAGE_CHARS = 4_000;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9-]{1,80}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export interface StartTurnInput {
  userId: string;
  conversationId?: string;
  message: string;
  locale?: string;
}

export interface PreparedTurn {
  conversation: ConversationRecord;
  userMessage: ChatMessageRecord;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  question: string;
  dataContext: DataContextEntry[];
  created: boolean;
}

function validateMessage(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('"message" is required and must be a string.');
  const message = raw.trim();
  if (!message) throw new ValidationError('"message" must not be empty.');
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new ValidationError(`"message" must be at most ${MAX_MESSAGE_CHARS} characters.`);
  }
  if (CONTROL_CHARS.test(message)) {
    throw new ValidationError('"message" contains invalid control characters.');
  }
  return message;
}

function validateConversationId(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || !CONVERSATION_ID_PATTERN.test(raw)) {
    throw new ValidationError('Invalid conversation id.');
  }
  return raw;
}

function titleFromMessage(message: string): string {
  const cleaned = message
    .replace(/[`*_~>#|[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return DEFAULT_TITLE;
  return cleaned.length > 64 ? `${cleaned.slice(0, 63)}…` : cleaned;
}

function mergeDataContext(
  next: DataContextEntry[],
  previous: DataContextEntry[] | undefined,
): DataContextEntry[] | undefined {
  if (next.length === 0) return undefined;
  const merged: DataContextEntry[] = [];
  const seen = new Set<string>();
  for (const entry of [...next, ...(previous ?? [])]) {
    const key = entry.entitySet;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
    if (merged.length >= 5) break;
  }
  return merged.length > 0 ? merged : undefined;
}

/**
 * The browser is a decision surface, not a diagnostics console. Full ERP
 * evidence, tool telemetry and source identifiers stay server-side; only
 * business-readable tables, metrics and a partial-data flag are published.
 */
function publicMeta(meta: ChatMessageMeta | undefined): ChatMessageMeta | undefined {
  if (meta?.complete === false) return { complete: false };
  return undefined;
}

function safeDisplayText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const base = value.split('·')[0]!.trim();
  // Legacy attachments can embed source identifiers after a separator or as a
  // camel-cased technical name. Neither belongs in a business answer.
  if (/(?:[A-Z][a-z]+){2,}|V\d+|[A-Z]{3,}/.test(base)) return 'Business summary';
  return base;
}

function publicAttachments(attachments: Attachment[] | undefined): Attachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((attachment) => {
    const subtitle = safeDisplayText(attachment.subtitle);
    if (attachment.type === 'table') {
      return {
        ...attachment,
        entitySet: undefined,
        title: safeDisplayText(attachment.title) ?? 'Business records',
        ...(subtitle ? { subtitle } : {}),
        columns: attachment.columns.map((column) => ({
          ...column,
          label: friendlyLabel(column.label),
        })),
      };
    }
    if (attachment.type === 'metric') {
      return {
        ...attachment,
        title: safeDisplayText(attachment.title) ?? 'Business summary',
        ...(subtitle ? { subtitle } : {}),
        items: attachment.items.map((item) => ({
          ...item,
          label: friendlyLabel(item.label),
          ...(item.hint ? { hint: safeDisplayText(item.hint) ?? '' } : {}),
        })),
      };
    }
    return {
      ...attachment,
      title: safeDisplayText(attachment.title) ?? 'Business summary',
      ...(subtitle ? { subtitle } : {}),
    };
  });
}

function businessSourceName(operation: string | undefined): string {
  const value = (operation ?? '').toLowerCase();
  if (value.includes('return')) return 'Return records';
  if (value.includes('inventory')) return 'Inventory records';
  if (value.includes('sales')) return 'Sales records';
  if (value.includes('supplier')) return 'Supplier records';
  if (value.includes('customer')) return 'Customer records';
  if (value.includes('product')) return 'Product records';
  if (value.includes('purchase')) return 'Purchase records';
  if (value.includes('production')) return 'Production records';
  return 'Business records';
}

/** Keep only business-readable notes; internal routing and model instructions stay server-side. */
function publicNote(note: string): string | undefined {
  const text = note.trim();
  const lower = text.toLowerCase();
  if (lower.includes('no records matched')) return 'No records matched this request.';
  if (lower.includes('no rows matched')) return 'No records matched this request.';
  if (lower.includes('no records were returned by the verified master')) {
    return 'No supplier, customer or product records were returned by the verified source.';
  }
  if (lower.includes('no records were found in the last')) return text;
  if (
    lower.includes('did not accept the requested server-side filter') ||
    lower.includes('bounded portion of matching records')
  ) {
    return 'Figures come from a partial review of available records.';
  }
  if (lower.startsWith('analysis covers')) {
    const period = text.match(/analysis covers (.+?)(?: by default)?(?:;|$)/i)?.[1];
    return period ? `Figures cover ${period}.` : undefined;
  }
  if (lower.startsWith('figures are based on the exact records')) {
    return 'Figures reflect only the records retrieved.';
  }
  if (lower.startsWith('resolved the product name')) return text;
  if (lower.startsWith('showing the top')) return text;
  if (lower.includes('point-in-time snapshot')) return text;
  if (lower.includes('real erp records were retrieved')) return text;
  if (lower.includes('bounded portion of available records was reviewed')) {
    return 'Results come from a partial review of available records.';
  }
  return undefined;
}

function publicSources(sources: SourceReference[] | undefined): SourceReference[] | undefined {
  if (!sources || sources.length === 0) return undefined;
  return sources.map((source) => {
    const name = businessSourceName(source.operation);
    const publicNotes = source.notes
      ?.map(publicNote)
      .filter((note): note is string => Boolean(note))
      .filter((note, index, notes) => notes.indexOf(note) === index);
    return {
      entitySet: name,
      entityType: name,
      operation: 'Business records checked',
      rowsReturned: source.rowsReturned,
      ...(source.totalMatches !== undefined ? { totalMatches: source.totalMatches } : {}),
      complete: source.complete,
      ...(publicNotes && publicNotes.length > 0 ? { notes: publicNotes } : {}),
    };
  });
}

function toPublic(conversation: ConversationRecord): PublicConversation {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => {
      const safeMeta = publicMeta(message.meta);
      const safeAttachments = publicAttachments(message.attachments);
      const safeSources = publicSources(message.sources);
      return {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(safeAttachments ? { attachments: safeAttachments } : {}),
        ...(safeSources ? { sources: safeSources } : {}),
        ...(safeMeta ? { meta: safeMeta } : {}),
      };
    }),
  };
}

export class ChatService {
  constructor(
    private readonly store: ConversationStore,
    private readonly agent: Agent,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  async listSummaries(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.store.list(userId);
    return conversations.map((conversation) => {
      const lastUser = [...conversation.messages]
        .reverse()
        .find((message) => message.role === 'user');
      return {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messageCount: conversation.messages.length,
        ...(lastUser
          ? { preview: lastUser.content.replace(/\s+/g, ' ').slice(0, 120) }
          : {}),
      };
    });
  }

  async create(userId: string, title?: string): Promise<PublicConversation> {
    const safeTitle =
      typeof title === 'string' && title.trim().length > 0 ? normaliseTitle(title) : DEFAULT_TITLE;
    const conversation = await this.store.create(userId, safeTitle);
    return toPublic(conversation);
  }

  async get(userId: string, id: string): Promise<PublicConversation> {
    const conversation = await this.store.get(userId, this.requireId(id));
    if (!conversation) throw new NotFoundError('Conversation not found.');
    return toPublic(conversation);
  }

  async getRecord(userId: string, id: string): Promise<ConversationRecord> {
    const conversation = await this.store.get(userId, this.requireId(id));
    if (!conversation) throw new NotFoundError('Conversation not found.');
    return conversation;
  }

  async rename(userId: string, id: string, title: unknown): Promise<PublicConversation> {
    if (typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('"title" must be a non-empty string.');
    }
    if (title.trim().length > 90) {
      throw new ValidationError('"title" must be at most 90 characters.');
    }
    const conversation = await this.getRecord(userId, id);
    conversation.title = normaliseTitle(title);
    conversation.updatedAt = new Date().toISOString();
    await this.store.save(conversation);
    return toPublic(conversation);
  }

  async delete(userId: string, id: string): Promise<void> {
    const deleted = await this.store.delete(userId, this.requireId(id));
    if (!deleted) throw new NotFoundError('Conversation not found.');
  }

  /**
   * Persists the user message before the AI call so a failed/slow answer never
   * loses the question. History excludes the new message; the agent receives it
   * separately as the current question.
   */
  async startTurn(input: StartTurnInput): Promise<PreparedTurn> {
    const message = validateMessage(input.message);
    const conversationId = validateConversationId(input.conversationId);

    let conversation: ConversationRecord;
    let created = false;
    if (conversationId) {
      const existing = await this.store.get(input.userId, conversationId);
      if (!existing) throw new NotFoundError('Conversation not found.');
      conversation = existing;
    } else {
      conversation = await this.store.create(input.userId);
      created = true;
    }

    const history = conversation.messages
      .filter((item) => item.role === 'user' || item.role === 'assistant')
      .map((item) => ({ role: item.role, content: item.content }));

    const timestamp = new Date().toISOString();
    const userMessage: ChatMessageRecord = {
      id: randomUUID(),
      role: 'user',
      content: message,
      createdAt: timestamp,
    };
    conversation.messages.push(userMessage);

    if (conversation.title === DEFAULT_TITLE && conversation.messages.length === 1) {
      conversation.title = titleFromMessage(message);
    }
    if (conversation.messages.length > this.config.conversations.maxMessages) {
      conversation.messages = conversation.messages.slice(-this.config.conversations.maxMessages);
    }
    conversation.updatedAt = timestamp;
    await this.store.save(conversation);

    return {
      conversation,
      userMessage,
      history,
      question: message,
      dataContext: conversation.dataContext ?? [],
      created,
    };
  }

  async generate(
    prepared: PreparedTurn,
    options: {
      locale?: string;
      signal?: AbortSignal;
      emitStatus?: Parameters<Agent['run']>[0]['emitStatus'];
    } = {},
  ): Promise<AgentResult> {
    return this.agent.run({
      question: prepared.question,
      history: prepared.history,
      dataContext: prepared.dataContext,
      userId: prepared.conversation.userId,
      conversationId: prepared.conversation.id,
      ...(options.locale ? { locale: options.locale } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.emitStatus ? { emitStatus: options.emitStatus } : {}),
    });
  }

  async completeTurn(prepared: PreparedTurn, result: AgentResult): Promise<PublicConversation> {    const conversation = prepared.conversation;
    const timestamp = new Date().toISOString();
    const assistantMessage: ChatMessageRecord = {
      id: randomUUID(),
      role: 'assistant',
      content: result.content,
      createdAt: timestamp,
      ...(result.attachments.length > 0 ? { attachments: result.attachments } : {}),
      ...(result.sources.length > 0 ? { sources: result.sources } : {}),
      meta: {
        model: result.model,
        provider: result.provider,
        task: result.task,
        fallbackUsed: result.fallbackUsed,
        durationMs: result.durationMs,
        iterations: result.iterations,
        toolsUsed: result.toolsUsed,
        ...(result.usage ? { usage: result.usage } : {}),
        complete: result.complete,
      },
    };
    conversation.messages.push(assistantMessage);
    if (conversation.messages.length > this.config.conversations.maxMessages) {
      conversation.messages = conversation.messages.slice(-this.config.conversations.maxMessages);
    }
    const merged = mergeDataContext(result.dataContext, conversation.dataContext);
    if (merged) conversation.dataContext = merged;
    else delete conversation.dataContext;
    conversation.updatedAt = timestamp;
    await this.store.save(conversation);

    this.logger.audit({
      action: 'chat.turn',
      outcome: 'success',
      userRef: prepared.conversation.userId,
      conversationRef: conversation.id,
      durationMs: result.durationMs,
      metadata: {
        iterations: result.iterations,
        tools: result.toolsUsed,
        attachments: result.attachments.length,
      },
    });

    return toPublic(conversation);
  }

  async touchAfterFailure(prepared: PreparedTurn): Promise<void> {
    // The user message is already persisted; this keeps the sidebar timestamp fresh.
    prepared.conversation.updatedAt = new Date().toISOString();
    try {
      await this.store.save(prepared.conversation);
    } catch {
      // Failure cleanup is best-effort.
    }
  }

  private requireId(id: string): string {
    if (!id || typeof id !== 'string' || !CONVERSATION_ID_PATTERN.test(id)) {
      throw new NotFoundError('Conversation not found.');
    }
    return id;
  }
}
