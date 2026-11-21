export type AgentPhase =
  | 'thinking'
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
  thinking: 'Thinking...',
  understanding: 'Understanding the question',
  searching_entities: 'Finding relevant business data',
  reading_metadata: 'Checking the available business information',
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
  // Legacy tool names (kept for compatibility with older conversations).
  searchEntities: 'searching_entities',
  getEntitySchema: 'reading_metadata',
  queryEntity: 'querying_d365',
  analyzeData: 'analyzing_data',
  getRelatedEntities: 'reading_metadata',
  // Controlled business-domain tools.
  search_erp_entities: 'searching_entities',
  get_entity_metadata: 'reading_metadata',
  search_erp_records: 'querying_d365',
  list_business_records: 'querying_d365',
  get_sales_summary: 'analyzing_data',
  get_inventory_summary: 'analyzing_data',
  get_returns_summary: 'analyzing_data',
  compare_business_periods: 'analyzing_data',
  analyze_business_metrics: 'analyzing_data',
};

/** Status safe to send to the browser: no tool, entity, field or query details. */
export function publicStatus(update: AgentStatus): Pick<AgentStatus, 'phase' | 'label' | 'at'> {
  return { phase: update.phase, label: update.label, at: update.at };
}
