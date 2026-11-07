import type { Attachment, DataContextEntry, SourceReference } from '../ai/attachments';
import type { AIUsage } from '../ai/types';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageMeta {
  model?: string;
  durationMs?: number;
  iterations?: number;
  toolsUsed?: string[];
  usage?: AIUsage;
  complete?: boolean;
  error?: boolean;
}

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  sources?: SourceReference[];
  meta?: ChatMessageMeta;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageRecord[];
  dataContext?: DataContextEntry[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview?: string;
}

export interface PublicChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  sources?: SourceReference[];
  meta?: ChatMessageMeta;
}

export interface PublicConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: PublicChatMessage[];
}
