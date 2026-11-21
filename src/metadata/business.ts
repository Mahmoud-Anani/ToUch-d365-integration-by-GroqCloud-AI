/**
 * Business terminology resolution over the verified D365 metadata catalog.
 *
 * The vocabularies below translate Arabic/English business language into
 * search concepts. They deliberately do not name entity sets; candidates are
 * discovered from metadata names, keys, properties and navigation links so the
 * resolver stays correct when the customer's metadata changes.
 */
import { MetadataCatalog } from './catalog';
import type { EntityMetadata, EntitySearchResult, MetadataCatalogData } from './types';
import { isDateProperty, isNumericProperty } from './types';

export type BusinessCategory =
  | 'sales'
  | 'returns'
  | 'products'
  | 'inventory'
  | 'purchasing'
  | 'production'
  | 'customers'
  | 'suppliers';

export interface CategorySignal {
  category: BusinessCategory;
  confidence: number;
  matchedTerms: string[];
}

export interface BusinessFieldHint {
  name: string;
  reason: string;
  kind: string;
}

export interface BusinessCandidate {
  entitySet: string;
  entityTypeShort: string;
  keys: string[];
  propertyCount: number;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  categories: BusinessCategory[];
  matchedTerms: string[];
  fieldHints: BusinessFieldHint[];
  relationships: Array<{ property: string; targetTypeShort: string; isCollection: boolean }>;
  verifiedRelationship: boolean;
}

export interface BusinessResolution {
  question: string;
  language: 'ar' | 'en';
  signals: CategorySignal[];
  candidates: BusinessCandidate[];
  notes: string[];
}

interface Vocabulary {
  category: BusinessCategory;
  /** Terms that identify a business domain. */
  domain: string[];
  /** Terms that indicate a fact/transaction entity rather than a setup entity. */
  fact: string[];
  /** Fields we look for to confirm an entity is useful for analytics. */
  fields: Array<{ pattern: RegExp; reason: string }>;
}

const VOCABULARIES: Vocabulary[] = [
  {
    category: 'sales',
    domain: [
      'sales', 'sale', 'order', 'invoice', 'revenue', 'turnover', ' sold', 'selling',
      'مبيعات', 'بيع', 'مبيع', 'فاتورة', 'طلب', 'طلبات', 'ايراد', 'إيراد', 'تحصيل',
    ],
    fact: [
      'salesorder', 'salesinvoice', 'invoice', 'salesline', 'invoiceline', 'orderline',
      'custinvoice', 'sales', 'orders', 'fact', 'transaction', 'تورد', 'طلب', 'فاتورة',
    ],
    fields: [
      { pattern: /^(salesordernumber|ordernumber|invoicenumber|invoicedate|salesdate|customername|customeraccount|itemnumber|productname|salesamount|lineamount|netamount|quantity|salesqty|dataareaid)$/i, reason: 'sales measure or dimension' },
      { pattern: /(amount|value|price|total).*(sales|line|net)/i, reason: 'sales value measure' },
      { pattern: /(sales|invoice|order).*(date|number)/i, reason: 'sales date or reference' },
    ],
  },
  {
    category: 'returns',
    domain: [
      'return', 'returns', 'refund', 'rma', 'returned', 'مرتجع', 'مرتجعات', 'ارجاع', 'إرجاع',
      'راجع', 'استرجاع', 'استبدال', 'رد', 'مرتجع',
    ],
    fact: [
      'returnorder', 'rma', 'returnline', 'returns', 'return', 'returned', 'creditnote',
      'مرتجع', 'ارجاع', 'راجع',
    ],
    fields: [
      { pattern: /^(returnordernumber|returndate|returnqty|returnedquantity|quantity|itemnumber|productname|reasoncode|customername|dataareaid)$/i, reason: 'return measure or dimension' },
      { pattern: /(return|rma).*(quantity|qty|date|number|reason)/i, reason: 'return detail' },
    ],
  },
  {
    category: 'products',
    domain: [
      'product', 'products', 'item', 'items', 'sku', 'catalog', 'touch', 'هاتف', 'منتج',
      'منتجات', 'صنف', 'أصناف', 'اصناف', 'مادة', 'موديل', 'تاتش', 'اتش دي ام اي', 'hdmi',
    ],
    fact: [
      'releasedproduct', 'product', 'sellableproduct', 'item', 'productmaster', 'catalog',
      'منتج', 'صنف', 'تاتش',
    ],
    fields: [
      { pattern: /^(itemnumber|productname|displayproductnumber|itemname|producttype|itemtype|productgroup|dataareaid)$/i, reason: 'product identity or classification' },
      { pattern: /(product|item).*(name|number|group|type)/i, reason: 'product description' },
    ],
  },
  {
    category: 'inventory',
    domain: [
      'inventory', 'stock', 'on hand', 'onhand', 'warehouse', 'available', 'availability',
      'مخزون', 'رصيد', 'مخزني', 'متوفر', 'التوفر', 'مستودع', 'كمية', 'نفاد',
    ],
    fact: [
      'onhand', 'inventory', 'warehouse', 'invent', 'stock', 'availability', 'onhandforai',
      'مخزون', 'رصيد', 'مستودع',
    ],
    fields: [
      { pattern: /^(itemnumber|warehouseid|siteid|onhandquantity|availablequantity|availablephysical|availphysical|physicalquantity|inventorystatus|dataareaid)$/i, reason: 'stock quantity or location' },
      { pattern: /(onhand|available|physical|inventory).*(quantity|qty|physical)/i, reason: 'inventory measure' },
    ],
  },
  {
    category: 'purchasing',
    domain: [
      'purchase', 'purchasing', 'vendor', 'supplier', 'procurement', 'مشتريات', 'شراء',
      'مورد', 'موردين', 'موردي',
    ],
    fact: [
      'purchaseorder', 'purchaseline', 'vendor', 'purch', 'purchase', 'مشتريات', 'مورد',
    ],
    fields: [
      { pattern: /^(purchaseordernumber|vendoraccountnumber|vendoraccount|vendaccount|vendorname|vendororganizationname|vendorsearchname|vendname|itemnumber|purchqty|purchaseqty|dataareaid)$/i, reason: 'purchase measure or supplier' },
    ],
  },
  {
    category: 'production',
    domain: [
      'production', 'manufacturing', 'batch', 'route', 'work order', 'إنتاج', 'تصنيع',
      'تشغيل', 'أمر تشغيل', ' Bacha', 'انتاج',
    ],
    fact: [
      'productionorder', 'route', 'batch', 'prod', 'manufactur', 'إنتاج', 'انتاج', 'تشغيل',
    ],
    fields: [
      { pattern: /^(productionordernumber|itemnumber|quantity|route|batchnumber|dataareaid)$/i, reason: 'production measure or reference' },
    ],
  },
  {
    category: 'customers',
    domain: ['customer', 'client', 'عميل', 'عملاء', 'زبون', 'زبائن'],
    fact: ['customer', 'cust', 'عميل', 'عملاء'],
    fields: [
      { pattern: /^(customeraccount|customeraccountnum|customervaccount|custaccount|dataareaid)$/i, reason: 'customer account' },
      { pattern: /^(customername|customernamealias|partyname|name)$/i, reason: 'customer name' },
    ],
  },
  {
    category: 'suppliers',
    domain: ['supplier', 'vendor', 'مورد', 'موردين', 'موردي'],
    fact: ['vendor', 'supplier', 'vend', 'مورد'],
    fields: [
      { pattern: /^(vendoraccountnumber|vendoraccount|vendaccount|accountnum|dataareaid)$/i, reason: 'supplier account' },
      { pattern: /^(vendororganizationname|vendorname|vendorsearchname|vendorknownasname|vendname|namealias|name)$/i, reason: 'supplier name' },
    ],
  },
];

const NOISE = new Set([
  'the', 'a', 'an', 'show', 'list', 'display', 'get', 'me', 'please', 'of', 'in', 'on', 'at',
  'for', 'to', 'from', 'by', 'and', 'or', 'is', 'are', 'was', 'were', 'we', 'i', 'you', 'my',
  'our', 'have', 'has', 'how', 'many', 'much', 'what', 'which', 'who', 'where', 'when', 'that',
  'this', 'these', 'those', 'there', 'their', 'top', 'per', 'each', 'all', 'with', 'than',
  'about', 'give', 'need', 'want', 'find', 'tell', 'last', 'lastest', 'recent', 'months',
  'month', 'days', 'day', 'year', 'years', 'high', 'low', 'most', 'increased', 'increase',
  'decrease', 'compare', 'compared', 'rate', 'value', 'total', 'number', 'count', 'items',
  'products', 'product', 'في', 'من', 'عن', 'على', 'الي', 'الى', 'كل', 'جميع', 'ايه', 'إيه',
  'كام', 'كم', 'عدد', 'عندي', 'عندنا', 'اللي', 'التي', 'الذي', 'هو', 'هي', 'ما', 'ماذا',
  'اعرض', 'اعرضلي', 'عرض', 'عرضلي', 'عايز', 'عاوز', 'ممكن', 'لو', 'سمحت', 'حسب', 'مع',
  'او', 'أو', 'و', 'ثم', 'موجود', 'الموجودة', 'الموجود', 'لي', 'لنا', 'داخل', 'بين', 'على',
  'ئه', 'يه', 'ية', 'يا', 'اه', 'ال', 'بال', 'لل', 'من', 'ما', 'ها', 'انا', 'احنا', 'ليه',
  'لي', 'اكتر', 'اقل', 'اعلي', 'الاعلي', 'الاقل', 'اخر', 'آخر', 'اشهر', 'شهور', 'ايام',
  'سنة', 'سنوات', 'مقارنة', 'معدل', 'نسبة', 'اجمالي', 'المجموع', 'القيمة', 'العدد', 'المنتج',
  'المنتجات', 'الصنف', 'الاصناف', 'الأصناف', 'المخزون', 'الرصيد', 'المبيعات', 'المرتجع',
  // List-intent words are not business domains and must not seed a category.
  'قائمه', 'قايمه', 'قائمة', 'القائمه', 'القايمه', 'القائمة', 'قوائم', 'اريد', 'اريده', 'اريدها',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();
}

function isArabicText(value: string): boolean {
  return /[\u0600-\u06ff]/.test(value);
}

/**
 * Strips Arabic clitics (بـ/لـ/كـ/فـ/وـ), the definite article and common
 * suffixes. "بالموردين" must resolve to the same concept as "الموردين" and
 * "موردين"; otherwise natural Arabic list questions find no business domain.
 */
function stem(value: string): string[] {
  const variants = new Set<string>([value]);
  let stripped = value;
  if (stripped.length > 3 && isArabicText(stripped)) {
    if (stripped.startsWith('لل')) {
      stripped = stripped.slice(2);
    } else if (/[بلكفو]/.test(stripped[0] ?? '')) {
      stripped = stripped.slice(1);
    }
    if (stripped.length > 3 && stripped.startsWith('ال')) stripped = stripped.slice(2);
    variants.add(stripped);
  }
  if (value.length > 3 && value.startsWith('ال')) variants.add(value.slice(2));
  if (value.length > 3 && value.endsWith('ا')) variants.add(value.slice(0, -1));
  if (value.length > 3 && value.endsWith('ه')) variants.add(value.slice(0, -1));
  if (value.length > 3 && value.endsWith('s') && !value.endsWith('ss')) variants.add(value.slice(0, -1));
  return [...variants];
}

function tokenize(value: string): string[] {
  return normalize(value).split(/\s+/).filter(Boolean);
}

/** True when a vocabulary term matches any token variant in the text. */
function matchesTerm(term: string, tokens: string[], text: string): boolean {
  const normalized = normalize(term);
  if (!normalized) return false;
  if (normalized.includes(' ')) {
    const stemmedWords = normalized.split(' ').map((word) => stem(word).pop() ?? word);
    return text.includes(` ${stemmedWords.join(' ')} `);
  }
  return tokens.some((token) =>
    stem(token).some(
      (variant) =>
        variant === normalized ||
        (variant.length >= 3 && variant.includes(normalized)) ||
        (normalized.length >= 3 && normalized.includes(variant)),
    ),
  );
}

function detectLanguage(question: string): 'ar' | 'en' {
  return /[\u0600-\u06ff]/.test(question) ? 'ar' : 'en';
}

/** Detects business domains from natural-language terms. */
export function detectBusinessSignals(question: string): CategorySignal[] {
  const tokens = tokenize(question);
  const text = ` ${tokens.join(' ')} `;
  const signals: CategorySignal[] = [];
  for (const vocabulary of VOCABULARIES) {
    const matchedTerms: string[] = [];
    let score = 0;
    for (const term of vocabulary.domain) {
      if (matchesTerm(term, tokens, text)) {
        matchedTerms.push(term.trim());
        score += normalize(term).includes(' ') ? 3 : 2;
      }
    }
    // Specific intent language (e.g. "returns increased") strengthens a category.
    for (const term of vocabulary.fact) {
      if (matchesTerm(term, tokens, text)) {
        if (!matchedTerms.includes(term.trim())) matchedTerms.push(term.trim());
        score += 1;
      }
    }
    if (score > 0) {
      signals.push({ category: vocabulary.category, confidence: Math.min(1, score / 6), matchedTerms });
    }
  }
  // Ranking/analysis intent ("top", "most", "trend", "increased") is a request
  // for a measurable fact, not a setup list. When products are the subject of
  // a ranking, sales is the implied measure, so add a sales signal to guide
  // discovery toward invoice/order lines rather than product setup tables.
  const rankingTerms = [
    'top', 'most', 'best', 'highest', 'lowest', 'rank', 'ranking', 'trend', 'increased',
    'increase', 'decreased', 'growth', 'compare', 'rate', 'اقل', 'اكتر', 'اعلي', 'الاعلي',
    'الاقل', 'الاكثر', 'معدل', 'نسبه', 'نسبة', 'اتجاه', 'زياده', 'زيادة', 'مقارنة',
  ];
  const hasRankingIntent = rankingTerms.some((term) => matchesTerm(term, tokens, text));
  if (hasRankingIntent) {
    const hasProducts = signals.some((signal) => signal.category === 'products');
    const hasOtherFactDomain = signals.some((signal) =>
      ['returns', 'inventory', 'purchasing', 'production'].includes(signal.category),
    );
    if (hasProducts && !hasOtherFactDomain && !signals.some((signal) => signal.category === 'sales')) {
      signals.push({ category: 'sales', confidence: 0.5, matchedTerms: ['ranking by sales'] });
    }
  }

  return signals.sort((a, b) => b.confidence - a.confidence);
}

function candidateFromEntity(
  entity: EntityMetadata,
  signals: CategorySignal[],
  queryTerms: string[],
): BusinessCandidate | undefined {
  const entityName = normalize(`${entity.entitySet} ${entity.entityTypeShort}`);
  const propertyNames = entity.properties.map((property) => normalize(property.name));
  const allText = `${entityName} ${propertyNames.join(' ')} ${normalize(entity.description ?? '')}`;
  const categoryScores = new Map<BusinessCategory, number>();
  const matchedTerms = new Set<string>();
  const fieldHints: BusinessFieldHint[] = [];

  for (const signal of signals) {
    const vocabulary = VOCABULARIES.find((item) => item.category === signal.category);
    if (!vocabulary) continue;
    let score = signal.confidence * 6;
    for (const term of vocabulary.fact) {
      const normalized = normalize(term);
      if (normalized && entityName.includes(normalized)) {
        score += 5;
        matchedTerms.add(term.trim());
      }
    }
    for (const fieldRule of vocabulary.fields) {
      const matches = entity.properties.filter((property) => fieldRule.pattern.test(property.name));
      if (matches.length > 0) {
        score += Math.min(6, matches.length * 2);
        for (const match of matches.slice(0, 6)) {
          if (!fieldHints.some((hint) => hint.name === match.name)) {
            fieldHints.push({ name: match.name, reason: fieldRule.reason, kind: match.type });
          }
        }
      }
    }
    if (fieldHints.length === 0 && !matchedTerms.has(signal.category)) {
      score -= 3;
    }
    if (score > 0) categoryScores.set(signal.category, score);
  }

  for (const term of queryTerms) {
    if (term.length > 1 && allText.includes(term)) {
      for (const category of categoryScores.keys()) {
        categoryScores.set(category, (categoryScores.get(category) ?? 0) + 1);
      }
    }
  }

  const categories = [...categoryScores.entries()]
    .filter(([, score]) => score > 3)
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
  if (categories.length === 0) return undefined;

  const rawScore = Math.max(...categoryScores.values()) + Math.min(4, fieldHints.length);
  const numericCount = entity.properties.filter(isNumericProperty).length;
  const dateCount = entity.properties.filter(isDateProperty).length;
  // Prefer measurable transaction entities over configuration/setup tables.
  const lowerName = entity.entitySet.toLowerCase();
  const setupPenalty = /(settings|setup|groups|types|codes|parameters|configuration|template|tolerance|coverage)/.test(lowerName)
    ? 8
    : 0;
  const factBonus =
    (dateCount > 0 ? 3 : 0) +
    (numericCount > 0 ? 2 : 0) +
    (fieldHints.some((hint) => /itemnumber|productname|customeraccount|invoice|order/i.test(hint.name)) ? 2 : 0);
  const score = rawScore - setupPenalty + factBonus;
  const enrichment = Math.min(4, numericCount + dateCount) + Math.min(3, fieldHints.length);
  const total = score + enrichment;
  return {
    entitySet: entity.entitySet,
    entityTypeShort: entity.entityTypeShort,
    keys: entity.keys,
    propertyCount: entity.properties.length,
    score: Math.round(total * 10) / 10,
    confidence: total >= 18 ? 'high' : total >= 11 ? 'medium' : 'low',
    categories,
    matchedTerms: [...matchedTerms].slice(0, 8),
    fieldHints: fieldHints.slice(0, 10),
    relationships: entity.navigationProperties.slice(0, 8).map((nav) => ({
      property: nav.name,
      targetTypeShort: nav.targetTypeShort,
      isCollection: nav.isCollection,
    })),
    verifiedRelationship: entity.navigationProperties.length > 0,
  };
}

/**
 * Resolves a natural-language business question into verified metadata
 * candidates. Search results from the existing metadata catalog are included
 * as evidence, then re-ranked using business domain signals.
 */
export function resolveBusinessEntities(
  data: MetadataCatalogData,
  question: string,
  options: { limit?: number; searchResults?: EntitySearchResult[] } = {},
): BusinessResolution {
  const signals = detectBusinessSignals(question);
  const queryTerms = tokenize(question).filter((term) => term.length > 2 && !NOISE.has(term));
  const primary = signals[0]?.category;
  const searchTerms = queryTerms.length > 0 ? queryTerms.slice(0, 5).join(' ') : (primary ?? question);

  // Use the existing catalog search as a candidate source, then add entities
  // that match domain vocabularies even when the name is not obvious.
  const catalog = new MetadataCatalog(data);
  const seedNames = new Set<string>();
  for (const result of options.searchResults ?? catalog.search(searchTerms, 25)) {
    seedNames.add(result.entitySet.toLowerCase());
  }
  // Domain-driven candidates: scan names for high-confidence fact terms.
  for (const signal of signals.filter((item) => item.confidence >= 0.5)) {
    const vocabulary = VOCABULARIES.find((item) => item.category === signal.category);
    if (!vocabulary) continue;
    for (const entity of data.entities) {
      const name = normalize(entity.entitySet);
      if (vocabulary.fact.some((term) => name.includes(normalize(term)))) {
        seedNames.add(entity.entitySet.toLowerCase());
      }
    }
  }

  const candidates: BusinessCandidate[] = [];
  for (const name of seedNames) {
    const entity = data.entities.find((item) => item.entitySet.toLowerCase() === name);
    if (!entity || !entity.metadataAvailable) continue;
    const candidate = candidateFromEntity(entity, signals, queryTerms);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => b.score - a.score || a.entitySet.localeCompare(b.entitySet));

  return {
    question,
    language: detectLanguage(question),
    signals,
    candidates: candidates.slice(0, options.limit ?? 8),
    notes: [
      'Candidates are derived from verified ERP metadata names, keys, properties and relationships.',
      'Relationship flags are set only when the metadata itself declares navigation properties.',
      ...(signals.length === 0
        ? ['No known business domain was detected in the question; broaden the wording.']
        : []),
      ...(candidates.length === 0
        ? ['No verified metadata candidate matched the detected business domain.']
        : []),
    ],
  };
}
