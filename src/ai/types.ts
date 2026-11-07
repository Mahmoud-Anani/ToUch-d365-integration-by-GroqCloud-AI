export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AIMessage {
  role: AIMessageRole;
  content: string | null;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface AICompletion {
  content: string;
  toolCalls: AIToolCall[];
  finishReason?: string;
  usage?: AIUsage;
}

export interface AIRequestOptions {
  temperature?: number;
  signal?: AbortSignal;
  /** When true the provider must not offer/execute tools (used for a final summary). */
  disableTools?: boolean;
}

export interface ToolResultMessage {
  toolCallId: string;
  name: string;
  content: string;
}

/**
 * Provider-neutral AI interface. Business logic depends only on this contract,
 * so another provider can be added without touching the agent or chat modules.
 */
export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AICompletion>;
  generateWithTools(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options?: AIRequestOptions,
  ): Promise<AICompletion>;
  processToolResults(toolCalls: AIToolCall[], results: ToolResultMessage[]): AIMessage[];
}
