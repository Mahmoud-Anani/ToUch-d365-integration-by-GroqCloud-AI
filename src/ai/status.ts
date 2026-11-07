export type AgentPhase =
  | 'understanding'
  | 'searching_entities'
  | 'reading_metadata'
  | 'querying_d365'
  | 'analyzing_data'
  | 'preparing_response'
  | 'completed';

export interface AgentStatus {
  phase: AgentPhase;
  label: string;
  tool?: string;
  entitySet?: string;
  detail?: string;
  at: string;
}

const LABELS: Record<AgentPhase, string> = {
  understanding: 'Understanding the question',
  searching_entities: 'Finding relevant business data',
  reading_metadata: 'Checking available business fields',
  querying_d365: 'Retrieving business data',
  analyzing_data: 'Analyzing business data',
  preparing_response: 'Preparing the response',
  completed: 'Completed',
};

export function status(
  phase: AgentPhase,
  extra: Omit<AgentStatus, 'phase' | 'label' | 'at'> = {},
): AgentStatus {
  return {
    phase,
    label: LABELS[phase],
    ...extra,
    at: new Date().toISOString(),
  };
}

export const TOOL_PHASE: Record<string, AgentPhase> = {
  searchEntities: 'searching_entities',
  getEntitySchema: 'reading_metadata',
  queryEntity: 'querying_d365',
  analyzeData: 'analyzing_data',
  getRelatedEntities: 'reading_metadata',
};
