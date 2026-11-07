import type {
  EntityMetadata,
  EntityProperty,
  EntitySearchResult,
  MetadataCatalogData,
  RelatedEntity,
} from './types';
import { isQueryableProperty } from './types';

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'all', 'show', 'list', 'display', 'get', 'me', 'please', 'of', 'in', 'on',
  'at', 'with', 'for', 'to', 'from', 'by', 'and', 'or', 'is', 'are', 'was', 'were', 'be', 'do',
  'does', 'did', 'we', 'i', 'you', 'my', 'our', 'have', 'has', 'how', 'many', 'much', 'what',
  'which', 'who', 'where', 'when', 'that', 'this', 'these', 'those', 'there', 'their', 'than',
  'greater', 'more', 'less', 'top', 'per', 'each', 'any', 'some', 'available', 'data',
  // Arabic / Egyptian
  'في', 'من', 'عن', 'على', 'الي', 'الى', 'كل', 'جميع', 'ايه', 'إيه', 'كام', 'كم', 'عدد',
  'عندي', 'عندنا', 'اللي', 'التي', 'الذي', 'هو', 'هي', 'ما', 'ماذا', 'اعرض', 'اعرضلي',
  'عرض', 'عرضلي', 'عايز', 'عاوز', 'ممكن', 'لو', 'سمحت', 'حسب', 'مع', 'او', 'أو', 'و',
  'ثم', 'موجود', 'الموجودة', 'الموجود', 'لي', 'لنا', 'داخل', 'بين', 'علي',
]);

const SYNONYMS: Record<string, string[]> = {
  customer: ['customer', 'customers', 'client'],
  customers: ['customer', 'customers', 'client'],
  client: ['customer', 'customers', 'client'],
  clients: ['customer', 'customers', 'client'],
  عميل: ['customer'],
  عملاء: ['customer'],
  العميل: ['customer'],
  العملاء: ['customer'],
  vendor: ['vendor', 'supplier'],
  vendors: ['vendor', 'supplier'],
  supplier: ['vendor', 'supplier'],
  suppliers: ['vendor', 'supplier'],
  مورد: ['vendor'],
  موردين: ['vendor'],
  المورد: ['vendor'],
  الموردين: ['vendor'],
  product: ['product', 'item'],
  products: ['product', 'item'],
  item: ['product', 'item'],
  items: ['product', 'item'],
  sku: ['product', 'item'],
  منتج: ['product', 'item'],
  منتجات: ['product', 'item'],
  المنتج: ['product', 'item'],
  المنتجات: ['product', 'item'],
  صنف: ['product', 'item'],
  اصناف: ['product', 'item'],
  warehouse: ['warehouse', 'site'],
  warehouses: ['warehouse', 'site'],
  مخزن: ['warehouse'],
  مخازن: ['warehouse'],
  مستودع: ['warehouse'],
  مستودعات: ['warehouse'],
  المخزن: ['warehouse'],
  المخازن: ['warehouse'],
  inventory: ['inventory', 'onhand', 'stock'],
  stock: ['inventory', 'onhand', 'stock'],
  مخزون: ['inventory', 'onhand', 'stock'],
  المخزون: ['inventory', 'onhand', 'stock'],
  متاح: ['available', 'onhand'],
  sales: ['sales'],
  sale: ['sales'],
  مبيعات: ['sales'],
  المبيعات: ['sales'],
  purchase: ['purchase', 'procurement'],
  purchases: ['purchase', 'procurement'],
  مشتريات: ['purchase', 'procurement'],
  المشتريات: ['purchase', 'procurement'],
  order: ['order'],
  orders: ['order'],
  طلب: ['order'],
  طلبات: ['order'],
  اوامر: ['order'],
  invoice: ['invoice'],
  invoices: ['invoice'],
  فاتورة: ['invoice'],
  فواتير: ['invoice'],
  quantity: ['quantity', 'qty'],
  quantities: ['quantity', 'qty'],
  كمية: ['quantity', 'qty'],
  كميات: ['quantity', 'qty'],
  الكمية: ['quantity', 'qty'],
  price: ['price'],
  prices: ['price'],
  سعر: ['price'],
  اسعار: ['price'],
  السعر: ['price'],
  amount: ['amount', 'total', 'value'],
  total: ['total', 'amount', 'value'],
  value: ['value', 'amount', 'total'],
  قيمة: ['amount', 'total', 'value'],
  اجمالي: ['total', 'amount'],
  إجمالي: ['total', 'amount'],
  totalamount: ['total', 'amount'],
  open: ['open'],
  مفتوح: ['open'],
  مفتوحة: ['open'],
  مفتوحه: ['open'],
  category: ['category', 'group'],
  categories: ['category', 'group'],
  تصنيف: ['category', 'group'],
  تصنيفات: ['category', 'group'],
  group: ['group', 'category'],
  grouped: ['group', 'category'],
};

function stripDiacritics(value: string): string {
  return value
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

function normalize(value: string): string {
  return stripDiacritics(splitCamel(value).toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCamel(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function stemEnglish(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('sses')) return token.slice(0, -2);
  if (token.endsWith('es') && /(ch|sh|x|z)$/.test(token.slice(0, -2))) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function tokenize(value: string): string[] {
  const normalized = normalize(value);
  if (!normalized) return [];
  return normalized
    .split(' ')
    .map((token) => {
      if (token.length > 3 && token.startsWith('ال')) return token.slice(2);
      return token;
    })
    .filter((token) => token.length > 0);
}

function expandQueryToken(token: string): string[] {
  const values = new Set<string>([token, stemEnglish(token)]);
  const synonyms = SYNONYMS[token];
  if (synonyms) {
    for (const synonym of synonyms.slice(0, 3)) values.add(synonym);
  }
  const stemmed = stemEnglish(token);
  if (SYNONYMS[stemmed]) {
    for (const synonym of (SYNONYMS[stemmed] as string[]).slice(0, 3)) values.add(synonym);
  }
  return [...values];
}

interface PropertySearchDoc {
  name: string;
  normalized: string;
  tokens: Set<string>;
}

interface EntitySearchDoc {
  entity: EntityMetadata;
  nameNormalized: string;
  typeNormalized: string;
  nameTokens: Set<string>;
  typeTokens: Set<string>;
  properties: PropertySearchDoc[];
}

interface ReverseRelation {
  entitySet: string;
  navigationProperty: string;
  isCollection: boolean;
}

export class MetadataCatalog {
  readonly data: MetadataCatalogData;
  private readonly bySet = new Map<string, EntityMetadata>();
  private readonly byType = new Map<string, EntityMetadata[]>();
  private readonly typeToSets = new Map<string, string[]>();
  private readonly reverse = new Map<string, ReverseRelation[]>();
  private searchDocs?: EntitySearchDoc[];

  constructor(data: MetadataCatalogData) {
    this.data = data;
    for (const entity of data.entities) {
      this.bySet.set(entity.entitySet.toLowerCase(), entity);
      if (entity.entityType) {
        const key = entity.entityType.toLowerCase();
        const list = this.byType.get(key) ?? [];
        list.push(entity);
        this.byType.set(key, list);
        const short = entity.entityTypeShort.toLowerCase();
        // D365 callers often know only the short EntityType name (e.g.
        // CustomerV3) while $metadata uses a namespace-qualified name.
        if (short !== key && !this.byType.has(short)) {
          this.byType.set(short, list);
        }
        const sets = this.typeToSets.get(short) ?? [];
        sets.push(entity.entitySet);
        this.typeToSets.set(short, sets);
      }
    }
    this.buildReverseIndex();
  }

  get entityCount(): number {
    return this.data.entities.length;
  }

  get queryableEntityCount(): number {
    return this.data.entities.filter((entity) => entity.metadataAvailable).length;
  }

  /**
   * Resolves an entity by its OData EntitySet name first, then by EntityType
   * name. Matching is case-insensitive so model casing mistakes are harmless.
   */
  getEntity(name: string): EntityMetadata | undefined {
    if (!name) return undefined;
    const lowered = name.toLowerCase();
    const bySet = this.bySet.get(lowered);
    if (bySet) return bySet;
    const byType = this.byType.get(lowered);
    if (byType && byType.length > 0) return byType[0];
    const short = lowered.includes('.') ? lowered.slice(lowered.lastIndexOf('.') + 1) : lowered;
    const byShort = this.byType.get(short);
    if (byShort && byShort.length > 0) return byShort[0];
    return undefined;
  }

  resolveProperty(entity: EntityMetadata, name: string): EntityProperty | undefined {
    return entity.properties.find((property) => property.name.toLowerCase() === name.toLowerCase());
  }

  getEntitySetsForType(type: string): string[] {
    const short = type.toLowerCase().includes('.') ? type.slice(type.lastIndexOf('.') + 1) : type;
    return this.typeToSets.get(short.toLowerCase()) ?? [];
  }

  search(term: string, limit = 10): EntitySearchResult[] {
    const rawTokens = tokenize(term).filter((token) => token.length > 0);
    const queryTokens = [...new Set(rawTokens.filter((token) => !STOPWORDS.has(token) && !/^v\d+$/.test(token)))];
    if (queryTokens.length === 0) return [];

    const exactNormalized = normalize(term);
    const docs = this.getSearchDocs();
    const expanded = new Map<string, string[]>();
    for (const token of queryTokens) expanded.set(token, expandQueryToken(token));

    const results: EntitySearchResult[] = [];
    for (const doc of docs) {
      let score = 0;
      let matchedQueryTokens = 0;
      const matchedProperties = new Set<string>();

      if (doc.nameNormalized === exactNormalized || doc.typeNormalized === exactNormalized) {
        score += 1_000;
      }

      for (const token of queryTokens) {
        const variants = expanded.get(token) ?? [token];
        let tokenMatched = false;

        for (const variant of variants) {
          // The entity's own name and type are far stronger signals than a
          // field that merely mentions the term. This keeps e.g.
          // InventoryOnHandForAI above entities that only have an
          // "Inventory..." field for the query "inventory".
          if (doc.nameNormalized === variant) {
            score += 300;
            tokenMatched = true;
          } else if (doc.nameTokens.has(variant)) {
            score += 160;
            tokenMatched = true;
          } else if (variant.length >= 3 && doc.nameNormalized.includes(variant)) {
            score += 50;
            tokenMatched = true;
          }

          if (doc.typeNormalized === variant) {
            score += 180;
            tokenMatched = true;
          } else if (doc.typeTokens.has(variant)) {
            score += 100;
            tokenMatched = true;
          } else if (variant.length >= 4 && doc.typeNormalized.includes(variant)) {
            score += 30;
            tokenMatched = true;
          }

          // Cap property contributions so an entity with dozens of
          // coincidental field matches cannot drown out a name match.
          let propertyTokenMatches = 0;
          let propertySubstringMatches = 0;
          for (const property of doc.properties) {
            if (property.tokens.has(variant)) {
              propertyTokenMatches += 1;
              tokenMatched = true;
              if (matchedProperties.size < 10) matchedProperties.add(property.name);
            } else if (variant.length >= 4 && property.normalized.includes(variant)) {
              propertySubstringMatches += 1;
              tokenMatched = true;
              if (matchedProperties.size < 10) matchedProperties.add(property.name);
            }
          }
          score += Math.min(propertyTokenMatches, 3) * 24;
          score += Math.min(propertySubstringMatches, 3) * 8;
        }

        if (tokenMatched) matchedQueryTokens += 1;
      }

      if (matchedQueryTokens === 0) continue;
      if (matchedQueryTokens === queryTokens.length) score += 150;
      else if (matchedQueryTokens >= Math.ceil(queryTokens.length / 2)) score += 50;
      if (!doc.entity.metadataAvailable) score -= 50;

      results.push({
        entitySet: doc.entity.entitySet,
        entityType: doc.entity.entityType,
        keys: doc.entity.keys,
        propertyCount: doc.entity.properties.length,
        metadataAvailable: doc.entity.metadataAvailable,
        ...(doc.entity.description ? { description: doc.entity.description } : {}),
        score,
        matchedProperties: [...matchedProperties].slice(0, 8),
      });
    }

    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.entitySet.length !== b.entitySet.length) return a.entitySet.length - b.entitySet.length;
      return a.entitySet.localeCompare(b.entitySet);
    });

    return results.slice(0, Math.max(1, Math.min(limit, 25)));
  }

  getRelated(entityName: string, limit = 40): { entity: EntityMetadata; related: RelatedEntity[] } | undefined {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;
    if (!entity.metadataAvailable) return { entity, related: [] };

    const related: RelatedEntity[] = [];
    const seen = new Set<string>();
    const add = (item: RelatedEntity) => {
      const key = `${item.direction}:${item.entitySet ?? item.entityType}:${item.navigationProperty ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      related.push(item);
    };

    for (const navigation of entity.navigationProperties) {
      const targetSets = this.getEntitySetsForType(navigation.targetType);
      if (targetSets.length === 0) {
        add({
          direction: 'outgoing',
          navigationProperty: navigation.name,
          entityType: navigation.targetType,
          isCollection: navigation.isCollection,
        });
      } else {
        for (const entitySet of targetSets) {
          add({
            direction: 'outgoing',
            navigationProperty: navigation.name,
            entitySet,
            entityType: navigation.targetType,
            isCollection: navigation.isCollection,
          });
        }
      }
    }

    const incoming = this.reverse.get(entity.entityTypeShort.toLowerCase()) ?? [];
    for (const relation of incoming) {
      add({
        direction: 'incoming',
        navigationProperty: relation.navigationProperty,
        entitySet: relation.entitySet,
        entityType: entity.entityType,
        isCollection: relation.isCollection,
      });
    }

    related.sort((a, b) => {
      if (a.direction !== b.direction) return a.direction === 'outgoing' ? -1 : 1;
      return (a.entitySet ?? a.entityType).localeCompare(b.entitySet ?? b.entityType);
    });

    return { entity, related: related.slice(0, Math.max(1, Math.min(limit, 100))) };
  }

  getSchema(
    entityName: string,
    options: { fieldContains?: string; maxFields: number },
  ): {
    entity: EntityMetadata;
    properties: EntityProperty[];
    propertiesTotal: number;
    truncated: boolean;
    navigationTotal: number;
    navigation: EntityMetadata['navigationProperties'];
  } | undefined {
    const entity = this.getEntity(entityName);
    if (!entity) return undefined;

    const filter = options.fieldContains?.trim().toLowerCase();
    const matching = filter
      ? entity.properties.filter((property) => property.name.toLowerCase().includes(filter))
      : entity.properties;
    const keyProperties = entity.properties.filter((property) => property.isKey);
    const ordered = [
      ...keyProperties,
      ...matching.filter((property) => !property.isKey),
    ].filter((property, index, items) => items.findIndex((item) => item.name === property.name) === index);

    const maxFields = Math.max(1, options.maxFields);
    const properties = ordered.slice(0, maxFields).filter(isQueryableProperty);
    const navigation = entity.navigationProperties.slice(0, 40);

    return {
      entity,
      properties,
      propertiesTotal: entity.properties.length,
      truncated: ordered.length > maxFields || entity.navigationProperties.length > navigation.length,
      navigationTotal: entity.navigationProperties.length,
      navigation,
    };
  }

  private buildReverseIndex(): void {
    for (const entity of this.data.entities) {
      if (!entity.metadataAvailable) continue;
      for (const navigation of entity.navigationProperties) {
        const key = navigation.targetTypeShort.toLowerCase();
        const list = this.reverse.get(key) ?? [];
        list.push({
          entitySet: entity.entitySet,
          navigationProperty: navigation.name,
          isCollection: navigation.isCollection,
        });
        this.reverse.set(key, list);
      }
    }
  }

  private getSearchDocs(): EntitySearchDoc[] {
    if (this.searchDocs) return this.searchDocs;
    this.searchDocs = this.data.entities.map((entity) => {
      const nameNormalized = normalize(splitCamel(entity.entitySet));
      const typeNormalized = normalize(splitCamel(entity.entityTypeShort));
      return {
        entity,
        nameNormalized,
        typeNormalized,
        nameTokens: new Set(tokenize(splitCamel(entity.entitySet))),
        typeTokens: new Set(tokenize(splitCamel(entity.entityTypeShort))),
        properties: entity.properties.map((property) => {
          const propertyName = splitCamel(property.name);
          const normalized = normalize(propertyName);
          return {
            name: property.name,
            normalized,
            tokens: new Set(normalized.split(' ').filter(Boolean)),
          };
        }),
      };
    });
    return this.searchDocs;
  }
}
