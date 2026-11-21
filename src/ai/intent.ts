/**
 * Deterministic first-pass routing. A small local model can call a tool just
 * because tools were offered; a greeting such as "Hello" must never trigger an
 * OData search. ERP signals always win, so genuine business questions keep the
 * full read-only tool workflow. The system prompt remains the second layer of
 * protection for everything this conservative classifier cannot decide.
 */
export type QuestionIntent = 'erp' | 'general';

export type ListCategory = 'suppliers' | 'customers' | 'products';

export interface ListIntent {
  category: ListCategory;
}

export interface NamedSearchIntent {
  category: 'products';
  searchTerm: string;
}

const ERP_TERMS =
  /\b(customer|customers|client|clients|vendor|vendors|supplier|suppliers|sale|sales|order|orders|invoice|invoices|return|returns|returned|refund|refunds|credit\s*note|credit\s*notes|purchase|purchases|inventory|stock|warehouse|warehouses|product|products|item|items|production|manufactur\w*|factory|defect\w*|waste|scrap|reject\w*|efficien\w*|productivity|throughput|employee|employees|worker|workers|ledger|account|accounts|balance|revenue|cost|costs|price|prices|quantity|quantities|report|reports|dashboard|d365|dynamics|erp|finance|financial|operations|material|materials|batch|batches|shipment|shipments|delivery|deliveries)\b/i;

const ERP_TERMS_AR =
  /(مبيعات|مخزون|مستودع|مخازن|عميل|عملاء|مورد|موردين|طلب|طلبات|فاتورة|فواتير|منتج|منتجات|صنف|أصناف|مرتجع|مرتجعات|ارتجاع|ارجاع|إرجاع|إنتاج|تصنيع|مصنع|عيب|عيوب|هالك|فاقد|مرفوض|كفاءة|إنتاجية|مالية|حساب|حسابات|رصيد|تكلفة|سعر|كمية|تقرير|تقارير|ديناميكس|شحن|مستلم|مادة|مواد|دفعة|دفعات)/u;

const SOCIAL_OPENING =
  /^(hi|hello|hey|yo|hiya|howdy|greetings|good\s+(morning|afternoon|evening|day)|salam|salaam|assalamu?\s*alaikum|ahlan|marhaban|thanks|thank\s*you|thx|bye|goodbye|see\s*you|how\s+are\s+you|how's\s+it\s+going|who\s+are\s+you|what\s+can\s+you\s+do|what\s+do\s+you\s+do|help(?:\s+me)?|ok|okay|sure|cool|great|nice|مرحبا|اهلا|أهلا|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|هاي|هلا|شكرا|مع\s+السلامة|وداعا|كيف\s+حالك|كيف\s+الحال|من\s+انت|من\s+أنت|ماذا\s+تستطيع|ماذا\s+يمكنك|مساعدة|حسنا|تمام)/iu;

const GENERAL_TOPIC =
  /^(what|who|where|when|why|how)\s+(is|are|was|were|do|does|did|can|could|would|should)\b|^(tell\s+me\s+about|explain|define|translate|weather|forecast|joke|recipe|capital\s+of|population\s+of|news|sports|movie|song|game)/iu;

// A plain \b is an ASCII word boundary and does not work after Arabic letters.
// Look ahead for a non-Arabic character (or end of text) instead.
const GENERAL_TOPIC_AR = /^(ما\s+هو|ما\s+هي|لماذا|كيف|متى|أين|من\s+هو|كم)(?=$|[^\p{Script=Arabic}])/u;

function normalize(question: string): string {
  return question
    .normalize('NFKC')
    // Arabic diacritics and tatweel are decoration, not meaning.
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[!¡.؟?،,\s؛;:…]+$/gu, '')
    .trim()
    .toLowerCase();
}

const LIST_TERMS = /\b(list|directory|catalogue|catalog)\b/i;
const LIST_TERMS_AR = /(قائمه|قايمه|قائمة|قوائم|اعرض|أظهر|عرض)/u;
const SUPPLIER_TERMS = /\b(suppliers?|vendors?)\b/i;
const SUPPLIER_TERMS_AR = /(مورد|موردين|موردي)/u;
const CUSTOMER_TERMS = /\b(customers?|clients?)\b/i;
const CUSTOMER_TERMS_AR = /(عميل|عملاء|زبون|زبائن)/u;
const PRODUCT_TERMS = /\b(products?|items?)\b/i;
const PRODUCT_TERMS_AR = /(منتج|منتجات|صنف|أصناف|اصناف)/u;
const RANKING_TERMS = /\b(top|most|best|highest|lowest|ranking|trend|increased|decreased)\b/i;
const RANKING_TERMS_AR = /(اكتر|أكثر|اعلي|أعلى|اقل|أقل|معدل|نسبة|اتجاه|زياده|زيادة|مقارنة)/u;
const NAMED_PRODUCT_TERMS =
  /\bthe\s+([a-z][a-z0-9-]*)\s+(?:(?:appliance|brand|line|type)\s+)?(?:products?|items?)\b/i;
const NAMED_PRODUCT_TERMS_GENERIC =
  /\b(?:show|find|display|list|get)\s+me\s+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)?)\s+(?:products?|items?)\b/i;

/**
 * Deterministically recognises plain "list all X" requests. These questions
 * must read the master data source directly; a model-invented search term or a
 * transaction entity would otherwise turn a populated list into "no data".
 */
export function detectListIntent(question: string): ListIntent | undefined {
  const text = normalize(question);
  const hasList = LIST_TERMS.test(text) || LIST_TERMS_AR.test(text);
  if (!hasList || RANKING_TERMS.test(text) || RANKING_TERMS_AR.test(text)) return undefined;
  if (SUPPLIER_TERMS.test(text) || SUPPLIER_TERMS_AR.test(text)) return { category: 'suppliers' };
  if (CUSTOMER_TERMS.test(text) || CUSTOMER_TERMS_AR.test(text)) return { category: 'customers' };
  if (PRODUCT_TERMS.test(text) || PRODUCT_TERMS_AR.test(text)) return { category: 'products' };
  return undefined;
}

/**
 * Recognises questions about a specifically named product line. These must use
 * record search with that business term, not an unfiltered master list or an
 * invented count. Only the simple English descriptor form is deterministic;
 * other wording remains on the model-driven tool path.
 */
export function detectNamedSearchIntent(question: string): NamedSearchIntent | undefined {
  if (detectListIntent(question)) return undefined;
  const normalized = normalize(question);
  if (RANKING_TERMS.test(normalized) || RANKING_TERMS_AR.test(normalized)) return undefined;
  const match = NAMED_PRODUCT_TERMS.exec(question) ?? NAMED_PRODUCT_TERMS_GENERIC.exec(question);
  if (!match?.[1]) return undefined;
  const searchTerm = match[1]
    .replace(/\b(appliance|brand|line|type|currently|listed|our|erp)\b/gi, '')
    .trim();
  if (!searchTerm || /^(all|any|some|other|our|the)$/i.test(searchTerm)) return undefined;
  return { category: 'products', searchTerm };
}

export function classifyQuestionIntent(question: string): QuestionIntent {
  const text = normalize(question);
  if (!text) return 'erp';
  if (ERP_TERMS.test(text) || ERP_TERMS_AR.test(text)) return 'erp';
  if (SOCIAL_OPENING.test(text) || GENERAL_TOPIC.test(text) || GENERAL_TOPIC_AR.test(text)) {
    return 'general';
  }
  // Ambiguous short fragments ("how many?") stay on the ERP path so real
  // follow-up questions continue to use live D365 evidence.
  return 'erp';
}
