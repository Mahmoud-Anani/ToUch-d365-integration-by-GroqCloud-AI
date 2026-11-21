/**
 * Deterministic business calculations. The LLM never performs arithmetic: all
 * percentages, rankings and comparisons are computed here from verified ERP
 * rows. Every result carries the denominator/formula so an answer can be
 * explained, and incompatible currencies or units are refused rather than
 * silently combined.
 */

export interface PercentageInput {
  numerator: number;
  denominator: number;
  numeratorLabel: string;
  denominatorLabel: string;
  /** Set when the two sides must share a currency (money metrics). */
  currency?: string;
  /** Set when the two sides must share a unit of measure (quantity metrics). */
  unit?: string;
  /** Allow a negative denominator (only meaningful for growth, never for rates). */
  allowNegativeDenominator?: boolean;
}

export interface PercentageResult {
  valid: boolean;
  percent: number | null;
  ratio: number | null;
  denominator: number;
  formula: string;
  warnings: string[];
}

export interface RankedItem<T = string> {
  key: T;
  value: number;
  count: number;
  label?: string;
}

export interface RankingResult<T = string> {
  items: Array<RankedItem<T>>;
  totalGroups: number;
  truncated: boolean;
  warnings: string[];
}

export interface PeriodRange {
  from: string;
  to: string;
  label: string;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Calculates a percentage from two verified numbers. A zero denominator never
 * divides; it returns null plus an explicit reason. A negative denominator is
 * rejected for rates/contributions and only allowed for signed growth.
 */
export function calculatePercentage(input: PercentageInput): PercentageResult {
  const warnings: string[] = [];
  const { numerator, denominator } = input;
  if (!finite(numerator) || !finite(denominator)) {
    return {
      valid: false,
      percent: null,
      ratio: null,
      denominator: finite(denominator) ? denominator : 0,
      formula: 'Not calculated: one or both figures are missing or invalid.',
      warnings: ['One or both figures are missing or invalid. No percentage was calculated.'],
    };
  }

  const formula = `(${input.numeratorLabel} ${numerator} / ${input.denominatorLabel} ${denominator}) × 100`;

  if (denominator === 0) {
    return {
      valid: false,
      percent: null,
      ratio: null,
      denominator: 0,
      formula: `${formula} — undefined because the denominator is zero.`,
      warnings: [`${input.denominatorLabel} is zero, so the percentage is undefined.`],
    };
  }
  if (denominator < 0 && input.allowNegativeDenominator !== true) {
    return {
      valid: false,
      percent: null,
      ratio: null,
      denominator,
      formula: `${formula} — not calculated because the denominator is negative.`,
      warnings: [`${input.denominatorLabel} is negative; this rate cannot be calculated reliably.`],
    };
  }
  if (numerator < 0 && input.allowNegativeDenominator !== true) {
    warnings.push(`${input.numeratorLabel} is negative; verify the data definition before using this rate.`);
  }

  const ratio = numerator / denominator;
  const percent = round2(ratio * 100);
  return {
    valid: true,
    percent,
    ratio: round2(ratio * 10000) / 10000,
    denominator,
    formula: `${formula} = ${percent}%`,
    warnings,
  };
}

/** Product share of a total: (product net sales / total net sales) × 100. */
export function salesContribution(
  productValue: number,
  totalValue: number,
  options: { currency?: string; productLabel?: string; measureLabel?: string } = {},
): PercentageResult {
  const measure = options.measureLabel ?? 'sales';
  const result = calculatePercentage({
    numerator: productValue,
    denominator: totalValue,
    numeratorLabel: options.productLabel ? `${options.productLabel} ${measure}` : `Product ${measure}`,
    denominatorLabel: `Total ${measure}`,
    ...(options.currency ? { currency: options.currency } : {}),
  });
  if (!result.valid) return result;
  return {
    ...result,
    formula: `${result.formula} (share of total ${measure} value)`,
  };
}

/** Return rate by quantity: (returned quantity / sold quantity) × 100. */
export function returnRate(
  returnedQuantity: number,
  soldQuantity: number,
  options: { unit?: string } = {},
): PercentageResult {
  return calculatePercentage({
    numerator: returnedQuantity,
    denominator: soldQuantity,
    numeratorLabel: 'Returned quantity',
    denominatorLabel: 'Sold quantity',
    ...(options.unit ? { unit: options.unit } : {}),
  });
}

/** Growth vs a previous period: ((current − previous) / |previous|) × 100. */
export function growthPercent(current: number, previous: number): PercentageResult {
  const result = calculatePercentage({
    numerator: current - previous,
    denominator: Math.abs(previous),
    numeratorLabel: 'Change',
    denominatorLabel: 'Previous period',
    allowNegativeDenominator: true,
  });
  if (!result.valid) return result;
  return {
    ...result,
    formula: `((${current} − ${previous}) / |${previous}|) × 100 = ${result.percent}%`,
  };
}

/**
 * Refuses to combine monetary or physical figures recorded in different
 * currencies or units. Returns business-readable warnings, not technical ones.
 */
export function compatibilityWarnings(
  values: Array<{ currency?: string | null; unit?: string | null }>,
): string[] {
  const currencies = new Set(
    values.map((item) => item.currency).filter((value): value is string => typeof value === 'string' && value.trim() !== ''),
  );
  const units = new Set(
    values.map((item) => item.unit).filter((value): value is string => typeof value === 'string' && value.trim() !== ''),
  );
  const warnings: string[] = [];
  if (currencies.size > 1) {
    warnings.push(
      `The records use more than one currency (${[...currencies].slice(0, 4).join(', ')}). Amounts must not be combined without conversion.`,
    );
  }
  if (units.size > 1) {
    warnings.push(
      `The records use more than one unit of measure (${[...units].slice(0, 4).join(', ')}). Quantities must not be combined without conversion.`,
    );
  }
  return warnings;
}

/** Groups verified rows by a business key and ranks by a summed measure. */
export function rankBySum<T extends Record<string, unknown>>(
  rows: T[],
  options: {
    keyField: string;
    valueField: string;
    limit?: number;
    countField?: string;
    /** Optional human-readable field used for display when keyField is a code. */
    labelField?: string;
    /** Use magnitudes (e.g. negative return quantities represent returned units). */
    absoluteValue?: boolean;
    /** Rank smallest values first (for low-stock questions). */
    ascending?: boolean;
  },
): RankingResult {
  const buckets = new Map<string, { key: string; value: number; count: number; first: T; label?: string }>();
  let missing = 0;
  for (const row of rows) {
    const rawKey = row[options.keyField];
    const key = rawKey === null || rawKey === undefined || rawKey === '' ? '(unspecified)' : String(rawKey);
    const rawValue = row[options.valueField];
    const value = typeof rawValue === 'string' && rawValue.trim() !== '' ? Number(rawValue) : rawValue;
    if (!finite(value)) {
      missing += 1;
      continue;
    }
    const bucket = buckets.get(key) ?? {
      key,
      value: 0,
      count: 0,
      first: row,
      ...(options.labelField && row[options.labelField]
        ? { label: String(row[options.labelField]) }
        : {}),
    };
    bucket.value += options.absoluteValue ? Math.abs(value) : value;
    bucket.count += 1;
    buckets.set(key, bucket);
  }

  const direction = options.ascending === true ? 1 : -1;
  const sorted = [...buckets.values()]
    .sort((a, b) => direction * (a.value - b.value) || a.key.localeCompare(b.key))
    .map((bucket) => ({
      key: bucket.key,
      value: round2(bucket.value),
      count: bucket.count,
      row: bucket.first,
    }));

  const limit = Math.max(1, options.limit ?? 10);
  const items = sorted.slice(0, limit).map(({ key, value, count, row }) => ({
    key,
    value,
    count,
    ...(options.labelField && row[options.labelField] ? { label: String(row[options.labelField]) } : {}),
  }));
  return {
    items,
    totalGroups: sorted.length,
    truncated: sorted.length > limit,
    warnings: [
      ...(missing > 0 ? [`${missing} record(s) had no usable value and were excluded from the ranking.`] : []),
      ...(sorted.length > limit
        ? [`Showing the top ${limit} of ${sorted.length} products; do not generalise the shown rows to the full population.`]
        : []),
    ],
  };
}

/** Builds an explicit date range for a "last N months/days" business question. */
export function relativePeriod(
  now: Date,
  options: { months?: number; days?: number; label?: string } = {},
): PeriodRange {
  const to = new Date(now);
  const from = new Date(now);
  if (options.months && options.months > 0) {
    from.setUTCMonth(from.getUTCMonth() - Math.trunc(options.months));
  } else if (options.days && options.days > 0) {
    from.setUTCDate(from.getUTCDate() - Math.trunc(options.days));
  }
  const iso = (value: Date): string => value.toISOString();
  return {
    from: iso(from),
    to: iso(to),
    label:
      options.label ??
      (options.months
        ? `the last ${options.months} month(s) (${iso(from).slice(0, 10)} to ${iso(to).slice(0, 10)})`
        : options.days
          ? `the last ${options.days} day(s) (${iso(from).slice(0, 10)} to ${iso(to).slice(0, 10)})`
          : 'all available records'),
  };
}
