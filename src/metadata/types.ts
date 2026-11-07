export interface EntityProperty {
  name: string;
  /** OData/EDM type, e.g. Edm.String, Edm.Decimal, Microsoft.Dynamics.DataEntities.NoYes */
  type: string;
  isKey: boolean;
  nullable: boolean;
  isCollection: boolean;
  description?: string;
}

export interface EntityNavigationProperty {
  name: string;
  targetType: string;
  targetTypeShort: string;
  isCollection: boolean;
}

export interface EntityMetadata {
  entitySet: string;
  entityType: string;
  entityTypeShort: string;
  keys: string[];
  properties: EntityProperty[];
  navigationProperties: EntityNavigationProperty[];
  description?: string;
  metadataAvailable: boolean;
}

export interface MetadataCatalogData {
  schemaVersion: 1;
  fetchedAt: number;
  baseUrl: string;
  entities: EntityMetadata[];
  advertisedEntitySetCount: number;
  missingEntityTypes: string[];
  warnings: string[];
}

export interface EntitySearchResult {
  entitySet: string;
  entityType: string;
  keys: string[];
  propertyCount: number;
  metadataAvailable: boolean;
  description?: string;
  score: number;
  matchedProperties: string[];
}

export interface RelatedEntity {
  direction: 'outgoing' | 'incoming';
  navigationProperty?: string;
  entitySet?: string;
  entityType: string;
  isCollection?: boolean;
}

export type PropertyKind = 'string' | 'number' | 'boolean' | 'date' | 'guid' | 'binary' | 'unknown';

export function propertyKind(type: string): PropertyKind {
  const value = type.replace(/^Edm\./, '');
  if (['String', 'Char', 'Enum'].includes(value)) return 'string';
  if (
    [
      'Byte',
      'SByte',
      'Int16',
      'Int32',
      'Int64',
      'Single',
      'Double',
      'Decimal',
    ].includes(value)
  ) {
    return 'number';
  }
  if (value === 'Boolean') return 'boolean';
  if (value === 'DateTimeOffset' || value === 'Date' || value === 'TimeOfDay') return 'date';
  if (value === 'Guid') return 'guid';
  if (value === 'Binary' || value === 'Stream') return 'binary';
  // D365 enums are serialised as strings by the OData endpoint.
  if (!type.startsWith('Edm.')) return 'string';
  return 'unknown';
}

export function isNumericProperty(property: EntityProperty): boolean {
  return propertyKind(property.type) === 'number';
}

export function isDateProperty(property: EntityProperty): boolean {
  return propertyKind(property.type) === 'date';
}

export function isQueryableProperty(property: EntityProperty): boolean {
  return propertyKind(property.type) !== 'binary';
}
