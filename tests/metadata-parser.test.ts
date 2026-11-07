import { describe, expect, it } from 'vitest';
import { MetadataError } from '../src/errors';
import { parseCsdlMetadata } from '../src/metadata/parser';
import { ADVERTISED_ENTITY_SETS, METADATA_XML } from './fixtures/metadata';
import { TEST_BASE_URL } from './helpers';

const parse = (xml = METADATA_XML, advertisedEntitySets?: string[]) =>
  parseCsdlMetadata(xml, {
    baseUrl: TEST_BASE_URL,
    fetchedAt: 1_700_000_000_000,
    ...(advertisedEntitySets ? { advertisedEntitySets } : {}),
  });

describe('parseCsdlMetadata', () => {
  it('parses every entity set and maps it to its EntityType', () => {
    const data = parse();
    expect(data.schemaVersion).toBe(1);
    expect(data.fetchedAt).toBe(1_700_000_000_000);
    expect(data.baseUrl).toBe(TEST_BASE_URL);
    expect(data.entities).toHaveLength(7);

    const customers = data.entities.find((entity) => entity.entitySet === 'CustomersV3');
    expect(customers).toBeDefined();
    expect(customers?.entityType).toBe('Microsoft.Dynamics.DataEntities.CustomerV3');
    expect(customers?.entityTypeShort).toBe('CustomerV3');
    expect(customers?.metadataAvailable).toBe(true);
    expect(customers?.keys).toEqual(['dataAreaId', 'CustomerAccount']);
    expect(customers?.description).toBe('Customer master & accounts');
  });

  it('inherits base-type properties and marks key properties', () => {
    const customers = parse().entities.find((entity) => entity.entitySet === 'CustomersV3');
    expect(customers?.properties.map((property) => property.name)).toContain('CreatedDateTime');
    expect(customers?.properties.find((property) => property.name === 'CustomerAccount')?.isKey).toBe(
      true,
    );
    expect(customers?.properties.find((property) => property.name === 'OrganizationName')?.isKey).toBe(
      false,
    );
    expect(customers?.properties.find((property) => property.name === 'Logo')?.type).toBe(
      'Edm.Binary',
    );
    expect(customers?.properties.find((property) => property.name === 'CustomerType')?.type).toBe(
      'Microsoft.Dynamics.DataEntities.CustType',
    );
  });

  it('parses navigation properties with collection and target details', () => {
    const data = parse();
    const customers = data.entities.find((entity) => entity.entitySet === 'CustomersV3');
    const lines = data.entities.find((entity) => entity.entitySet === 'SalesOrderLines');

    expect(customers?.navigationProperties).toEqual([
      {
        name: 'SalesOrderHeaders',
        targetType: 'Microsoft.Dynamics.DataEntities.SalesOrderHeaderV2',
        targetTypeShort: 'SalesOrderHeaderV2',
        isCollection: true,
      },
    ]);
    expect(lines?.navigationProperties[0]).toMatchObject({
      name: 'Header',
      targetTypeShort: 'SalesOrderHeaderV2',
      isCollection: false,
    });
  });

  it('adds advertised entity sets that are missing from $metadata', () => {
    const data = parse(METADATA_XML, ADVERTISED_ENTITY_SETS);
    expect(data.advertisedEntitySetCount).toBe(ADVERTISED_ENTITY_SETS.length);
    const missing = data.entities.find((entity) => entity.entitySet === 'AdvertisedOnlyEntity');
    expect(missing).toMatchObject({ metadataAvailable: false, properties: [], keys: [] });
    expect(data.missingEntityTypes).toContain('AdvertisedOnlyEntity');
    expect(data.warnings.join(' ')).toMatch(/have no EntityType metadata/);
  });

  it('parses self-closing EntityType elements', () => {
    const empty = parse().entities.find((entity) => entity.entitySet === 'EmptyEntities');
    expect(empty).toMatchObject({ entityTypeShort: 'EmptyType', metadataAvailable: true });
    expect(empty?.properties).toEqual([]);
  });

  it('ignores invalid and duplicate EntitySet names', () => {
    const xml = METADATA_XML.replace(
      '</EntityContainer>',
      `<EntitySet Name="Bad Name" EntityType="Microsoft.Dynamics.DataEntities.CustomerV3" />
       <EntitySet Name="CustomersV3" EntityType="Microsoft.Dynamics.DataEntities.CustomerV3" />
      </EntityContainer>`,
    );
    const customers = parse(xml).entities.filter((entity) => entity.entitySet === 'CustomersV3');
    expect(customers).toHaveLength(1);
    expect(parse(xml).entities.some((entity) => entity.entitySet === 'Bad Name')).toBe(false);
  });

  it('ignores description annotations whose value is unresolved', () => {
    const xml = METADATA_XML.replace(
      'String="Customer master &amp; accounts"',
      'String="@SYS:Unresolved"',
    );
    const customers = parse(xml).entities.find((entity) => entity.entitySet === 'CustomersV3');
    expect(customers?.description).toBeUndefined();
  });

  it('rejects empty and structurally invalid documents', () => {
    expect(() => parse('   ')).toThrow(MetadataError);
    expect(() => parse('<edmx:Edmx></edmx:Edmx>')).toThrow(/EntityType/);
    expect(() => parse('<EntityType Name="Broken"><Property Name="A" Type="Edm.String" />')).toThrow(
      /unterminated EntityType/,
    );
    expect(() =>
      parse('<EntityType Name="OnlyAType"><Property Name="A" Type="Edm.String" /></EntityType>'),
    ).toThrow(/EntitySet/);
  });

  it('defaults advertisedEntitySetCount to zero when no service document is supplied', () => {
    expect(parse().advertisedEntitySetCount).toBe(0);
    expect(parse().warnings).toEqual([]);
  });
});
