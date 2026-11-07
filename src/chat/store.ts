import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Logger } from '../logger';
import type { ConversationRecord } from './types';

const STORE_VERSION = 1;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const DEFAULT_TITLE = 'New conversation';
const MAX_TITLE_LENGTH = 90;

interface StoreFile {
  version: number;
  conversations: ConversationRecord[];
}

export interface ConversationStore {
  list(userId: string): Promise<ConversationRecord[]>;
  get(userId: string, id: string): Promise<ConversationRecord | undefined>;
  create(userId: string, title?: string): Promise<ConversationRecord>;
  save(conversation: ConversationRecord): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface ConversationStoreOptions {
  filePath?: string;
  persistent: boolean;
  maxPerUser: number;
  retentionDays: number;
  logger?: Logger;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normaliseTitle(title: string | undefined): string {
  const value = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return DEFAULT_TITLE;
  return value.length > MAX_TITLE_LENGTH ? `${value.slice(0, MAX_TITLE_LENGTH - 1)}…` : value;
}

function isValidRecord(value: unknown): value is ConversationRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return false;
  if (typeof record.userId !== 'string' || record.userId.length === 0) return false;
  if (typeof record.title !== 'string') return false;
  if (typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string') return false;
  if (!Array.isArray(record.messages)) return false;
  return record.messages.every((message) => {
    if (!message || typeof message !== 'object') return false;
    const item = message as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string' &&
      typeof item.createdAt === 'string'
    );
  });
}

/**
 * Conversation store backed by a single JSON file (default) or memory.
 * All reads are per-user; ownership is checked before every mutation.
 */
export class JsonConversationStore implements ConversationStore {
  private readonly records = new Map<string, ConversationRecord>();
  private readonly options: ConversationStoreOptions;
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: ConversationStoreOptions) {
    this.options = options;
  }

  async list(userId: string): Promise<ConversationRecord[]> {
    await this.ensureLoaded();
    this.prune();
    return [...this.records.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((record) => clone(record));
  }

  async get(userId: string, id: string): Promise<ConversationRecord | undefined> {
    await this.ensureLoaded();
    const record = this.records.get(id);
    if (!record || record.userId !== userId) return undefined;
    return clone(record);
  }

  async create(userId: string, title?: string): Promise<ConversationRecord> {
    await this.ensureLoaded();
    this.prune();
    const timestamp = nowIso();
    const record: ConversationRecord = {
      id: randomUUID(),
      userId,
      title: normaliseTitle(title),
      createdAt: timestamp,
      updatedAt: timestamp,
      messages: [],
    };
    this.records.set(record.id, record);
    this.prune();
    await this.persist();
    return clone(record);
  }

  async save(conversation: ConversationRecord): Promise<void> {
    await this.ensureLoaded();
    if (!isValidRecord(conversation)) {
      throw new Error('Invalid conversation record.');
    }
    const existing = this.records.get(conversation.id);
    if (existing && existing.userId !== conversation.userId) {
      throw new Error('Conversation ownership mismatch.');
    }
    this.records.set(conversation.id, clone(conversation));
    this.prune();
    await this.persist();
  }

  async delete(userId: string, id: string): Promise<boolean> {
    await this.ensureLoaded();
    const existing = this.records.get(id);
    if (!existing || existing.userId !== userId) return false;
    this.records.delete(id);
    await this.persist();
    return true;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.options.persistent || !this.options.filePath) return;

    const file = this.options.filePath;
    if (!existsSync(file)) return;
    try {
      if (statSync(file).size > MAX_FILE_BYTES) {
        this.options.logger?.warn('Conversation store file is too large; starting with an empty store', {
          path: file,
        });
        return;
      }
      const raw = readFileSync(file, 'utf8');
      const payload = JSON.parse(raw) as Partial<StoreFile>;
      if (!payload || !Array.isArray(payload.conversations)) return;
      for (const record of payload.conversations) {
        if (isValidRecord(record)) this.records.set(record.id, record);
      }
      this.prune();
    } catch (error) {
      this.options.logger?.warn('Conversation store could not be read; moving it aside', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      try {
        renameSync(file, `${file}.corrupt-${Date.now()}`);
      } catch {
        // Keep serving with an empty in-memory store.
      }
    }
  }

  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.options.retentionDays * 86_400_000;
    for (const [id, record] of this.records) {
      const updated = Date.parse(record.updatedAt);
      if (!Number.isFinite(updated) || updated < cutoff) this.records.delete(id);
    }

    const byUser = new Map<string, ConversationRecord[]>();
    for (const record of this.records.values()) {
      const list = byUser.get(record.userId) ?? [];
      list.push(record);
      byUser.set(record.userId, list);
    }
    for (const list of byUser.values()) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      for (const record of list.slice(this.options.maxPerUser)) {
        this.records.delete(record.id);
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.options.persistent || !this.options.filePath) return;
    const file = this.options.filePath;
    const snapshot: StoreFile = {
      version: STORE_VERSION,
      conversations: [...this.records.values()],
    };
    const payload = JSON.stringify(snapshot);
    this.writeChain = this.writeChain.then(async () => {
      mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp-${process.pid}-${randomUUID()}`;
      writeFileSync(temp, payload, { encoding: 'utf8', mode: 0o600 });
      try {
        renameSync(temp, file);
      } catch {
        try {
          unlinkSync(file);
        } catch {
          // ignore
        }
        renameSync(temp, file);
      }
    });
    try {
      await this.writeChain;
    } catch (error) {
      this.options.logger?.warn('Unable to persist conversation store', {
        error: error instanceof Error ? error.name : 'UnknownError',
        path: file,
      });
    }
  }
}

export function createConversationStore(
  options: ConversationStoreOptions,
): ConversationStore {
  return new JsonConversationStore(options);
}

export { DEFAULT_TITLE, normaliseTitle };
