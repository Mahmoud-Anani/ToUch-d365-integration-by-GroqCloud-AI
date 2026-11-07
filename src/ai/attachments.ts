import type { PropertyKind } from '../metadata/types';

export type CellValue = string | number | boolean | null;

export interface TableColumn {
  key: string;
  label: string;
  type?: PropertyKind | 'unknown';
  isKey?: boolean;
}

export interface TableAttachment {
  type: 'table';
  id: string;
  title: string;
  subtitle?: string;
  entitySet?: string;
  columns: TableColumn[];
  rows: Record<string, CellValue>[];
  totalRows?: number;
  truncated: boolean;
}

export interface ChartAttachment {
  type: 'chart';
  id: string;
  title: string;
  chartType: 'bar';
  labels: string[];
  values: number[];
  valueLabel?: string;
  subtitle?: string;
}

export interface MetricAttachment {
  type: 'metric';
  id: string;
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: string; hint?: string }>;
}

export type Attachment = TableAttachment | ChartAttachment | MetricAttachment;

export interface SourceReference {
  entitySet: string;
  entityType: string;
  operation?: string;
  filter?: string;
  rowsReturned?: number;
  totalMatches?: number;
  complete: boolean;
  notes?: string[];
}

export interface DataContextEntry {
  entitySet: string;
  entityType: string;
  operation: string;
  select?: string[];
  filter?: string;
  orderBy?: string;
  totalMatches?: number;
  rowsReturned: number;
  complete: boolean;
  capturedAt: string;
  sampleRows?: Record<string, CellValue>[];
  summary?: Record<string, CellValue>;
}

const MAX_CELL_LENGTH = 300;
const MAX_ATTACHMENTS = 10;
const MAX_TOTAL_ROWS = 500;

export function toCellValue(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH)}…` : value;
  }
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return null;
    return serialized.length > MAX_CELL_LENGTH ? `${serialized.slice(0, MAX_CELL_LENGTH)}…` : serialized;
  } catch {
    return null;
  }
}

export function sanitizeRow(
  row: Record<string, unknown>,
  columns: TableColumn[],
): Record<string, CellValue> {
  const result: Record<string, CellValue> = {};
  for (const column of columns) {
    if (column.key.startsWith('@')) continue;
    result[column.key] = toCellValue(row[column.key]);
  }
  return result;
}

export function dataRowsFromOData(
  rows: Record<string, unknown>[],
  columns: TableColumn[],
): Record<string, CellValue>[] {
  return rows.map((row) => sanitizeRow(row, columns));
}

export class AttachmentCollector {
  readonly attachments: Attachment[] = [];
  readonly sources: SourceReference[] = [];
  readonly dataContext: DataContextEntry[] = [];

  addAttachment(attachment: Attachment): void {
    if (this.attachments.length >= MAX_ATTACHMENTS) return;
    let id = attachment.id;
    let counter = 2;
    while (this.attachments.some((item) => item.id === id)) {
      id = `${attachment.id}-${counter}`;
      counter += 1;
    }
    const rowsSoFar = this.attachments.reduce(
      (total, item) => total + (item.type === 'table' ? item.rows.length : 0),
      0,
    );
    if (attachment.type === 'table' && rowsSoFar >= MAX_TOTAL_ROWS) return;
    const next = { ...attachment, id } as Attachment;
    if (next.type === 'table' && rowsSoFar + next.rows.length > MAX_TOTAL_ROWS) {
      next.rows = next.rows.slice(0, Math.max(0, MAX_TOTAL_ROWS - rowsSoFar));
      next.truncated = true;
    }
    this.attachments.push(next);
  }

  addSource(source: SourceReference): void {
    const existing = this.sources.find(
      (item) => item.entitySet === source.entitySet && item.filter === source.filter,
    );
    if (existing) {
      existing.rowsReturned = Math.max(existing.rowsReturned ?? 0, source.rowsReturned ?? 0);
      existing.complete = existing.complete && source.complete;
      existing.notes = [...new Set([...(existing.notes ?? []), ...(source.notes ?? [])])];
      return;
    }
    if (this.sources.length < 12) this.sources.push(source);
  }

  addDataContext(entry: DataContextEntry): void {
    this.dataContext.unshift(entry);
    this.dataContext.splice(5);
  }
}
