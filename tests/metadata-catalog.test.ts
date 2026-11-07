import { describe, expect, it } from 'vitest';
import { MetadataCatalog } from '../src/metadata/catalog';
import { propertyKind, isNumericProperty, isQueryableProperty } from '../src/metadata/types';
import { catalogData } from './helpers';

const catalog = new MetadataCatalog(catalogData());

describe('MetadataCatalog entity resolution', () => {
  it('resolves by EntitySet name, short EntityType and qualified EntityType', () => {
    expect(catalog.getEntity('customersv3')?.entitySet).toBe('CustomersV3');
    expect(catalog.getEntity('CustomerV3')?.entitySet).toBe('CustomersV3');
    expect(catalog.getEntity('Microsoft.Dynamics.DataEntities.CustomerV3')?.entitySet).toBe(
      'CustomersV3',
    );
    expect(catalog.getEntity('missing')).toBeUndefined();
    expect(catalog.getEntity('')).toBeUndefined();
  });

  it('resolves properties case-insensitively', () => {
    const entity = catalog.getEntity('CustomersV3');
    expect(entity).toBeDefined();
    expect(catalog.resolveProperty(entity!, 'organizationname')?.name).toBe('OrganizationName');
    expect(catalog.resolveProperty(entity!, 'missing')).toBeUndefined();
  });

  it('maps EntityTypes to every EntitySet that exposes them', () => {
    expect(catalog.getEntitySetsForType('CustomerV3')).toEqual(['CustomersV3']);
    expect(catalog.getEntitySetsForType('Microsoft.Dynamics.DataEntities.CustomerV3')).toEqual([
      'CustomersV3',
    ]);
    expect(catalog.getEntitySetsForType('Unknown')).toEqual([]);
  });

  it('reports counts including entities without metadata', () => {
    const data = new MetadataCatalog(
      catalogData({ advertisedEntitySetCount: 8, missingEntityTypes: ['AdvertisedOnlyEntity'] }),
    );
    expect(data.entityCount).toBe(8);
    expect(data.queryableEntityCount).toBe(7);
  });
});

describe('MetadataCatalog search', () => {
  it('ranks the entity that names the business term above field-only matches', () => {
    const results = catalog.search('inventory');
    expect(results[0]?.entitySet).toBe('InventoryOnHandForAI');
    expect(results.map((result) => result.entitySet)).toContain('InventoryOnHandForAI');
  });

  it('supports English business terms and synonyms', () => {
    expect(catalog.search('customers')[0]?.entitySet).toBe('CustomersV3');
    expect(catalog.search('client').map((result) => result.entitySet)).toContain('CustomersV3');
    expect(catalog.search('supplier').map((result) => result.entitySet)).toContain('VendorsV2');
    expect(catalog.search('sales order').map((result) => result.entitySet)).toContain(
      'SalesOrderHeadersV2',
    );
  });

  it('supports Arabic business terms', () => {
    expect(catalog.search('عملاء').map((result) => result.entitySet)).toContain('CustomersV3');
    expect(catalog.search('موردين').map((result) => result.entitySet)).toContain('VendorsV2');
    expect(catalog.search('مخزون')[0]?.entitySet).toBe('InventoryOnHandForAI');
    expect(catalog.search('مستودعات').map((result) => result.entitySet)).toContain('Warehouses');
  });

  it('returns matching field names for schema discovery', () => {
    const result = catalog.search('credit limit').find((item) => item.entitySet === 'CustomersV3');
    expect(result?.matchedProperties).toContain('CreditLimit');
    expect(result?.keys).toEqual(['dataAreaId', 'CustomerAccount']);
    expect(result?.propertyCount).toBe(10);
  });

  it('deduplicates stopword-only queries and limits results', () => {
    expect(catalog.search('show me all of the data')).toEqual([]);
    expect(catalog.search('   ')).toEqual([]);
    expect(catalog.search('customer', 1)).toHaveLength(1);
    expect(catalog.search('customer', 0)).toHaveLength(1);
    expect(catalog.search('customer', 100).length).toBeLessThanOrEqual(25);
  });

  it('penalises entities without metadata but still finds them by exact name', () => {
    const withOrphan = new MetadataCatalog(
      catalogData({
        entities: [
          ...catalogData().entities,
          {
            entitySet: 'AdvertisedOnlyEntity',
            entityType: '',
            entityTypeShort: '',
            keys: [],
            properties: [],
            navigationProperties: [],
            metadataAvailable: false,
          },
        ],
      }),
    );
    const results = withOrphan.search('AdvertisedOnlyEntity');
    expect(results[0]).toMatchObject({ entitySet: 'AdvertisedOnlyEntity', metadataAvailable: false });
  });
});

describe('MetadataCatalog schema and relationships', () => {
  it('returns keys first and filters non-queryable binary fields', () => {
    const schema = catalog.getSchema('CustomersV3', { maxFields: 150 });
    expect(schema).toBeDefined();
    expect(schema?.properties.slice(0, 2).map((property) => property.name)).toEqual([
      'dataAreaId',
      'CustomerAccount',
    ]);
    expect(schema?.properties.some((property) => property.name === 'Logo')).toBe(false);
    expect(schema?.propertiesTotal).toBe(10);
    expect(schema?.truncated).toBe(false);
  });

  it('filters by fieldContains and truncates predictably', () => {
    const schema = catalog.getSchema('CustomersV3', {
      fieldContains: 'organization',
      maxFields: 3,
    });
    expect(schema?.properties.map((property) => property.name)).toEqual([
      'dataAreaId',
      'CustomerAccount',
      'OrganizationName',
    ]);
    expect(schema?.truncated).toBe(false);

    const limited = catalog.getSchema('CustomersV3', { maxFields: 4 });
    expect(limited?.properties).toHaveLength(4);
    expect(limited?.truncated).toBe(true);
  });

  it('returns undefined for an unknown entity', () => {
    expect(catalog.getSchema('Nope', { maxFields: 10 })).toBeUndefined();
    expect(catalog.getRelated('Nope')).toBeUndefined();
  });

  it('returns outgoing and incoming navigation relationships', () => {
    const result = catalog.getRelated('CustomersV3');
    expect(result?.entity.entitySet).toBe('CustomersV3');
    const outgoing = result?.related.filter((item) => item.direction === 'outgoing');
    const incoming = result?.related.filter((item) => item.direction === 'incoming');
    expect(outgoing?.[0]).toMatchObject({
      navigationProperty: 'SalesOrderHeaders',
      entitySet: 'SalesOrderHeadersV2',
      isCollection: true,
    });
    expect(incoming?.[0]).toMatchObject({
      navigationProperty: 'Customer',
      entitySet: 'SalesOrderHeadersV2',
    });
  });

  it('returns an empty relationship list for entities without navigation', () => {
    expect(catalog.getRelated('InventoryOnHandForAI')?.related).toEqual([]);
  });

  it('caps relationship results', () => {
    expect(catalog.getRelated('CustomersV3', 1)?.related).toHaveLength(1);
  });
});

describe('property helpers', () => {
  it('classifies EDM and D365 enum types', () => {
    expect(propertyKind('Edm.String')).toBe('string');
    expect(propertyKind('Edm.Decimal')).toBe('number');
    expect(propertyKind('Edm.Int32')).toBe('number');
    expect(propertyKind('Edm.Boolean')).toBe('boolean');
    expect(propertyKind('Edm.DateTimeOffset')).toBe('date');
    expect(propertyKind('Edm.Guid')).toBe('guid');
    expect(propertyKind('Edm.Binary')).toBe('binary');
    expect(propertyKind('Edm.Stream')).toBe('binary');
    expect(propertyKind('Microsoft.Dynamics.DataEntities.CustType')).toBe('string');
    expect(propertyKind('Edm.UnknownType')).toBe('unknown');
  });

  it('identifies numeric and queryable properties', () => {
    expect(isNumericProperty({ name: 'Amount', type: 'Edm.Decimal', isKey: false, nullable: true, isCollection: false })).toBe(true);
    expect(isNumericProperty({ name: 'Name', type: 'Edm.String', isKey: false, nullable: true, isCollection: false })).toBe(false);
    expect(isQueryableProperty({ name: 'Logo', type: 'Edm.Binary', isKey: false, nullable: true, isCollection: false })).toBe(false);
    expect(isQueryableProperty({ name: 'Name', type: 'Edm.String', isKey: false, nullable: true, isCollection: false })).toBe(true);
  });
});
