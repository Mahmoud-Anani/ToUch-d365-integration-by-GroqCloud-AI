import type { CellValue, DataContextEntry } from './attachments';

/**
 * The model may use technical names internally to choose a read-only lookup,
 * but they must never become part of the answer shown to a business user.
 * This module is the translation boundary between tool evidence and the
 * decision brief the user sees.
 */

const FIELD_LABELS: Record<string, string> = {
  dataareaid: 'Company',
  customeraccount: 'Customer',
  customername: 'Customer name',
  partytype: 'Customer type',
  salesorderaccount: 'Customer',
  itemnumber: 'Product',
  productname: 'Product name',
  salesordernumber: 'Order',
  purchaseordernumber: 'Purchase order',
  invoiceaccount: 'Customer',
  vendaccount: 'Supplier',
  vendname: 'Supplier name',
  vendoraccountnumber: 'Supplier',
  vendoraccount: 'Supplier',
  vendorname: 'Supplier name',
  vendororganizationname: 'Supplier name',
  vendorsearchname: 'Supplier search name',
  vendorknownasname: 'Supplier known as',
  namealias: 'Name alias',
  accountnum: 'Account',
  customeraccountnum: 'Customer',
  custaccount: 'Customer',
  customernamealias: 'Customer name',
  addresscountryregionid: 'Country',
  salestaxgroup: 'Tax group',
  primarycontactfaxextension: 'Fax extension',
  isfuelsurchargeapplied: 'Fuel surcharge',
  createddatetime: 'Created',
  modifieddatetime: 'Last changed',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function friendlyLabel(key: string): string {
  const clean = key.replace(/^@/, '').trim();
  const mapped = FIELD_LABELS[clean.toLowerCase().replace(/[\s_-]+/g, '')];
  if (mapped) return mapped;
  const words = clean
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Value';
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function friendlyRows(
  rows: unknown,
  limit = 20,
): Array<Record<string, CellValue>> {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).map((row) => {
    const record = asRecord(row) ?? {};
    const result: Record<string, CellValue> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith('@')) continue;
      result[friendlyLabel(key)] = value as CellValue;
    }
    return result;
  });
}

function safeNotes(notes: unknown): string[] | undefined {
  if (!Array.isArray(notes)) return undefined;
  const cleaned = notes
    .filter((note): note is string => typeof note === 'string')
    .map((note) =>
      note
        .replace(/\bEntitySet\b/gi, 'record set')
        .replace(/\bentity type\b/gi, 'record type')
        .replace(/\bfield\(s\)/gi, 'detail(s)')
        .replace(/\brow\(s\)/gi, 'record(s)'),
    )
    .filter((note) => note.trim().length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
}

function errorEvidence(error: unknown): Record<string, unknown> {
  const record = asRecord(error) ?? { message: error };
  const message = typeof record.message === 'string' ? record.message : '';
  const missing =
    /does not exist|not found|could not be found|no verified|invalid|unsupported|unknown|required/i.test(
      message,
    );
  return {
    problem: missing
      ? 'That business information is not available in the requested form. Use broader business terms or a different measure.'
      : 'The business information could not be retrieved right now. Try a narrower or clearer request.',
  };
}

function measureLabel(operation: unknown): string {
  switch (typeof operation === 'string' ? operation.toLowerCase() : '') {
    case 'count':
      return 'Total number';
    case 'sum':
      return 'Total amount';
    case 'average':
      return 'Average';
    case 'min':
      return 'Lowest value';
    case 'max':
      return 'Highest value';
    case 'groupby':
      return 'Breakdown';
    case 'comparison':
      return 'Comparison';
    default:
      return 'Result';
  }
}

function internalRouting(items: unknown, keys: string[]): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map((item) => {
    const record = asRecord(item) ?? {};
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (record[key] !== undefined) result[key] = record[key];
    }
    return result;
  });
}

/**
 * Produce the evidence the model sees. Routing identifiers are kept in a
 * clearly marked private field so the model can perform the next lookup; the
 * prompt forbids ever surfacing them.
 */
export function toModelEvidence(toolName: string, content: unknown): unknown {
  const data = asRecord(content);
  if (!data) return content;
  if (data.error !== undefined) return errorEvidence(data.error);
  const notes = safeNotes(data.notes);

  switch (toolName) {
    case 'searchEntities': {
      const results = Array.isArray(data.results) ? data.results : [];
      return {
        matchCount: Array.isArray(data.results) ? data.results.length : 0,
        _internalRouting: internalRouting(results, [
          'entitySet',
          'entityType',
          'description',
          'metadataAvailable',
        ]),
        _internalNote: 'Routing identifiers are private. Never mention or display them.',
      };
    }
    case 'getEntitySchema': {
      const properties = Array.isArray(data.properties) ? data.properties : [];
      return {
        _internalRouting: {
          entity: data.entitySet,
          type: data.entityType,
          fields: internalRouting(properties, ['name']).map((item) => item.name),
        },
        _internalNote: 'Field names are private. Use them only for the next lookup.',
      };
    }
    case 'queryEntity': {
      const rows = Array.isArray(data.rows) ? data.rows : [];
      return {
        resultCount: data.totalMatches ?? data.rowsReturned ?? rows.length,
        returnedCount: data.rowsReturned ?? rows.length,
        complete: data.complete === true,
        records: friendlyRows(rows),
        ...(notes ? { notes } : {}),
      };
    }
    case 'analyzeData': {
      const groups = Array.isArray(data.groups) ? data.groups : undefined;
      const comparison = asRecord(data.comparison);
      const left = asRecord(comparison?.left);
      const right = asRecord(comparison?.right);
      return {
        measure: measureLabel(data.operation),
        value: data.value,
        count: data.count,
        ...(groups
          ? {
              breakdown: groups.slice(0, 20).map((group) => {
                const row = asRecord(group) ?? {};
                return { label: row.key, count: row.count, value: row.value };
              }),
            }
          : {}),
        ...(comparison
          ? {
              comparison: {
                leftLabel: left?.label,
                leftValue: left?.value ?? left?.count,
                rightLabel: right?.label,
                rightValue: right?.value ?? right?.count,
                difference: comparison.difference,
                changePercent: comparison.percentageDifference,
              },
            }
          : {}),
        complete: data.complete === true,
        ...(notes ? { notes } : {}),
      };
    }
    case 'getRelatedEntities': {
      const related = Array.isArray(data.related) ? data.related : [];
      return {
        relationshipCount: related.length,
        _internalRouting: internalRouting(related, [
          'entitySet',
          'entityType',
          'navigationProperty',
          'direction',
        ]),
        _internalNote: 'Relationship names are private. Never mention or display them.',
      };
    }
    case 'search_erp_entities': {
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const areas = Array.isArray(data.detectedBusinessAreas) ? data.detectedBusinessAreas : [];
      return {
        detectedBusinessAreas: areas.slice(0, 8).map((item) => {
          const area = asRecord(item) ?? {};
          return { area: area.area, confidence: area.confidence };
        }),
        // Only business categories are exposed. Source identifiers stay inside
        // the backend registry and are never given to the model or user.
        availableDataSources: candidates.slice(0, 8).map((item) => {
          const candidate = asRecord(item) ?? {};
          const categories = Array.isArray(candidate.categories) ? candidate.categories : [];
          return {
            businessCategories: categories,
            description: categories.join(', ') || 'Business records',
            confidence: candidate.confidence,
          };
        }),
      };
    }
    case 'get_entity_metadata': {
      const properties = Array.isArray(data.properties) ? data.properties : [];
      const relationships = Array.isArray(data.relationships)
        ? data.relationships
        : Array.isArray(data.navigationProperties)
          ? data.navigationProperties
          : [];
      return {
        availableDetails: properties
          .slice(0, 30)
          .map((item) => {
            const property = asRecord(item) ?? {};
            return typeof property.name === 'string' ? friendlyLabel(property.name) : 'Detail';
          })
          .filter((label, index, labels) => labels.indexOf(label) === index),
        keyDetailCount: Array.isArray(data.keys) ? data.keys.length : 0,
        relationshipCount: relationships.length,
      };
    }
    case 'search_erp_records': {
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const note = safeNotes(data.warnings);
      return {
        searchTerm: data.searchTerm,
        matchCount: data.rowsReturned ?? rows.length,
        records: friendlyRows(rows),
        ...(data.note ? { note: data.note } : {}),
        ...(note ? { notes: note } : {}),
      };
    }
    case 'list_business_records': {
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const note = safeNotes(data.warnings);
      const fields = asRecord(data.fields) ?? {};
      return {
        businessArea: data.businessArea,
        accountLabel: friendlyLabel(typeof fields.account === 'string' ? fields.account : 'account'),
        nameLabel: friendlyLabel(typeof fields.name === 'string' ? fields.name : 'name'),
        recordCount: data.rowsReturned ?? rows.length,
        records: friendlyRows(rows),
        ...(data.note ? { note: data.note } : {}),
        ...(note ? { notes: note } : {}),
      };
    }
    case 'get_sales_summary':
    case 'get_returns_summary':
    case 'get_inventory_summary': {
      const top = Array.isArray(data.topResults) ? data.topResults : [];
      const contribution = asRecord(data.topContribution);
      const note = safeNotes(data.warnings);
      return {
        businessArea: data.businessArea,
        period: data.period,
        total: data.totalMeasuredValue,
        recordsUsed: data.recordsUsed,
        dataStatus: data.complete === true ? 'complete' : 'partial',
        leaders: top.slice(0, 10).map((item) => {
          const row = asRecord(item) ?? {};
          return { product: row.label ?? row.key, value: row.value, count: row.count };
        }),
        leaderCount: data.topResultCount,
        ...(contribution ? { topShare: contribution.percent } : {}),
        ...(note ? { notes: note } : {}),
      };
    }
    case 'compare_business_periods': {
      const previous = asRecord(data.previous) ?? {};
      const current = asRecord(data.current) ?? {};
      const change = asRecord(data.change) ?? {};
      const previousRange = asRecord(data.previousRange) ?? {};
      const currentRange = asRecord(data.currentRange) ?? {};
      const note = safeNotes(data.warnings);
      const increases = Array.isArray(data.increases) ? data.increases : [];
      return {
        businessArea: data.businessArea,
        previousPeriod: {
          from: previousRange.from,
          to: previousRange.to,
          total: previous.total,
          records: previous.records,
        },
        currentPeriod: {
          from: currentRange.from,
          to: currentRange.to,
          total: current.total,
          records: current.records,
        },
        change: { amount: change.amount, percent: change.percent, valid: change.valid },
        productsCompared: data.productsCompared,
        increases: increases.slice(0, 10).map((item) => {
          const row = asRecord(item) ?? {};
          return {
            product: row.product,
            previous: row.previous,
            current: row.current,
            increase: row.amount,
            percent: row.percent,
          };
        }),
        ...(note ? { notes: note } : {}),
      };
    }
    case 'analyze_business_metrics': {
      const note = safeNotes(data.warnings);
      return {
        metric: data.metric,
        percent: data.percent,
        valid: data.valid,
        ...(data.note ? { note: data.note } : {}),
        ...(note ? { notes: note } : {}),
      };
    }
    default:
      return content;
  }
}

/** Business-only memory of earlier turns; no entity, field, filter or query names. */
export function formatBusinessContext(entries: DataContextEntry[], maxChars: number): string {
  if (entries.length === 0) return '';
  const lines: string[] = [
    'Facts from earlier turns in this conversation. They may be stale; re-check when freshness matters. Use these only as business context.',
  ];
  let used = lines[0]?.length ?? 0;

  for (const entry of entries.slice(0, 5)) {
    const examples = entry.sampleRows?.slice(0, 3) ?? [];
    const summary = entry.summary ? friendlyRows([entry.summary], 1)[0] : undefined;
    const block = JSON.stringify({
      when: entry.capturedAt,
      complete: entry.complete,
      availableRecords: entry.totalMatches ?? entry.rowsReturned,
      shownRecords: entry.rowsReturned,
      ...(summary ? { figures: summary } : {}),
      ...(examples.length > 0 ? { examples: friendlyRows(examples) } : {}),
    });
    const clipped = block.length > Math.max(0, maxChars - used - 8)
      ? `${block.slice(0, Math.max(0, maxChars - used - 8))}…`
      : block;
    if (!clipped) break;
    lines.push(`- ${clipped}`);
    used += clipped.length + 3;
    if (used >= maxChars) break;
  }
  return lines.join('\n');
}
