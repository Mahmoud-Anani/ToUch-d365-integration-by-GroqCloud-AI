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
  model?: string;
  provider?: string;
}

export type AITask =
  | 'production_analysis'
  | 'manufacturing_efficiency_analysis'
  | 'waste_defect_detection'
  | 'root_cause_analysis'
  | 'general_question'
  | 'data_summarization';

export interface AIModelCapabilities {
  contextWindow?: number;
  supportsTools: boolean;
  tasks: AITask[];
  freeTier: 'verified' | 'unknown' | 'paid';
}

export interface AIRequestOptions {
  temperature?: number;
  signal?: AbortSignal;
  maxCompletionTokens?: number;
  task?: AITask;
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
  readonly priority?: number;
  readonly capabilities?: AIModelCapabilities;
  readonly primaryProviderName?: string;
  generateResponse(messages: AIMessage[], options?: AIRequestOptions): Promise<AICompletion>;
  generateWithTools(
    messages: AIMessage[],
    tools: AIToolDefinition[],
    options?: AIRequestOptions,
  ): Promise<AICompletion>;
  processToolResults(toolCalls: AIToolCall[], results: ToolResultMessage[]): AIMessage[];
}
