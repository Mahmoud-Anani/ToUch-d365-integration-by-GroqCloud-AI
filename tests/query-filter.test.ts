import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors';
import { buildFilter } from '../src/query/filter';
import { MetadataCatalog } from '../src/metadata/catalog';
import type { EntityProperty } from '../src/metadata/types';
import { catalogData } from './helpers';

const catalog = new MetadataCatalog(catalogData());
const customers = catalog.getEntity('CustomersV3')!;
const orders = catalog.getEntity('SalesOrderHeadersV2')!;
const lines = catalog.getEntity('SalesOrderLines')!;

function resolverFor(entity: typeof customers) {
  return (name: string): EntityProperty => {
    const property = catalog.resolveProperty(entity, name);
    if (!property) throw new ValidationError(`Field "${name}" does not exist.`);
    return property;
  };
}

const customerFilter = (input: string) => buildFilter(input, resolverFor(customers));

const customProperties: EntityProperty[] = [
  { name: 'Id', type: 'Edm.Guid', isKey: true, nullable: false, isCollection: false },
  { name: 'Count', type: 'Edm.Int32', isKey: false, nullable: false, isCollection: false },
  { name: 'Score', type: 'Edm.Double', isKey: false, nullable: true, isCollection: false },
  { name: 'Flag', type: 'Edm.Boolean', isKey: false, nullable: false, isCollection: false },
  { name: 'When', type: 'Edm.DateTimeOffset', isKey: false, nullable: true, isCollection: false },
  { name: 'Blob', type: 'Edm.Binary', isKey: false, nullable: true, isCollection: false },
  { name: 'Mystery', type: 'Edm.Weird', isKey: false, nullable: true, isCollection: false },
  { name: 'Label', type: 'Edm.String', isKey: false, nullable: true, isCollection: false },
];
const customFilter = (input: string) =>
  buildFilter(input, (name) => {
    const property = customProperties.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!property) throw new ValidationError(`Field "${name}" does not exist.`);
    return property;
  });

describe('buildFilter canonicalisation', () => {
  it('validates fields and rebuilds canonical casing', () => {
    expect(customerFilter("organizationname eq 'Contoso'")).toBe("OrganizationName eq 'Contoso'");
    expect(customerFilter("CUSTOMERACCOUNT eq 'US-001'")).toBe("CustomerAccount eq 'US-001'");
  });

  it('escapes single quotes instead of allowing OData injection', () => {
    expect(customerFilter("OrganizationName eq 'O''Brien'")).toBe(
      "OrganizationName eq 'O''Brien'",
    );
    expect(customerFilter("Notes eq 'a'' or ''1'' eq ''1'")).toBe(
      "Notes eq 'a'' or ''1'' eq ''1'",
    );
  });

  it('normalises boolean operators and parentheses', () => {
    expect(
      customerFilter("creditlimit gt 10 AND isactive eq true OR customergroupid eq 'X'"),
    ).toBe("((CreditLimit gt 10 and IsActive eq true) or CustomerGroupId eq 'X')");
    expect(customerFilter("IsActive eq true or CreditLimit gt 1 and Notes eq 'x'")).toBe(
      "(IsActive eq true or (CreditLimit gt 1 and Notes eq 'x'))",
    );
    expect(customerFilter("(OrganizationName eq 'A')")).toBe("(OrganizationName eq 'A')");
  });

  it('supports logical not', () => {
    expect(customerFilter('not IsActive eq true')).toBe('not (IsActive eq true)');
    expect(customerFilter("not (IsActive eq true or Notes eq 'x')")).toBe(
      "not ((IsActive eq true or Notes eq 'x'))",
    );
  });

  it('supports startswith, endswith and contains on string fields', () => {
    expect(customerFilter("startswith(OrganizationName, 'Cont')")).toBe(
      "startswith(OrganizationName,'Cont')",
    );
    expect(customerFilter("endswith(CustomerAccount, '01')")).toBe(
      "endswith(CustomerAccount,'01')",
    );
    expect(customerFilter("contains(Notes, 'vip')")).toBe("contains(Notes,'vip')");
  });

  it('supports dates, numbers, GUIDs and null comparisons', () => {
    expect(buildFilter("OrderDate ge '2025-01-01'", resolverFor(orders))).toBe(
      "OrderDate ge '2025-01-01'",
    );
    expect(buildFilter("CreatedDateTime lt '2025-12-31T23:59:59Z'", resolverFor(customers))).toBe(
      "CreatedDateTime lt '2025-12-31T23:59:59Z'",
    );
    expect(customerFilter('CreditLimit ge -10.5')).toBe('CreditLimit ge -10.5');
    expect(customerFilter('Notes eq null')).toBe('Notes eq null');
    expect(customFilter("Id eq '123e4567-e89b-12d3-a456-426614174000'")).toBe(
      "Id eq '123e4567-e89b-12d3-a456-426614174000'",
    );
  });

  it('enforces the correct value type for every property kind', () => {
    expect(() => customerFilter('CreditLimit gt 10.5')).not.toThrow();
    expect(() => customFilter('Count eq 1.5')).toThrow(/integer/);
    expect(() => customFilter("Count eq '1'")).toThrow(/numeric/);
    expect(() => customFilter('Flag eq 1')).toThrow(/true or false/);
    expect(() => customFilter('Flag gt true')).toThrow(/only support eq and ne/);
    expect(() => customFilter("When eq '01/02/2025'")).toThrow(/ISO date/);
    expect(() => customFilter("Id eq 'not-a-guid'")).toThrow(/GUID/);
    expect(() => customerFilter("OrganizationName eq 123")).toThrow(/quoted string/);
    expect(() => customerFilter("Logo eq 'abc'")).toThrow(/cannot be used in a filter/);
    expect(() => customFilter("Mystery eq 'abc'")).toThrow(/cannot be used in a filter/);
    expect(() => customFilter('Score gt null')).toThrow(/null can only be used/);
  });

  it('rejects unknown fields and unsupported functions', () => {
    expect(() => customerFilter("UnknownField eq 'x'")).toThrow(/does not exist/);
    expect(() => customerFilter("substringof(OrganizationName, 'x')")).toThrow(
      /unsupported function/,
    );
    expect(() => customerFilter("contains(CreditLimit, '1')")).toThrow(/requires a string field/);
    expect(() => customerFilter("startswith(1, 'x')")).toThrow(/requires a field name/);
    expect(() => customerFilter('startswith(OrganizationName, 1)')).toThrow(
      /requires a quoted string/,
    );
  });

  it('rejects query-option and SQL-style injection attempts', () => {
    const attempts = [
      "OrganizationName eq 'x' or 1 eq 1",
      "OrganizationName eq 'x'&$top=1",
      "OrganizationName eq 'x'; DROP TABLE Users",
      "OrganizationName eq 'x' -- comment",
      "OrganizationName eq 'x' or '1' eq '1'",
      "OrganizationName eq 'x') or (CustomerAccount eq 'y'",
      "OrganizationName eq 'x' and",
      "OrganizationName eq",
      "and OrganizationName eq 'x'",
      "OrganizationName eq\n'x' or 1 eq 1",
    ];
    for (const attempt of attempts) {
      expect(() => customerFilter(attempt), attempt).toThrow(ValidationError);
    }
  });

  it('rejects malformed, oversized and unsafe literals', () => {
    expect(() => customerFilter('   ')).toThrow(/cannot be empty/);
    expect(() => customerFilter("OrganizationName eq 'unterminated")).toThrow(/unterminated/);
    expect(() => customerFilter(`Notes eq '${'a'.repeat(501)}'`)).toThrow(/too long/);
    expect(() => customerFilter(`Notes eq 'a\u0001b'`)).toThrow(/control characters/);
    expect(() => customerFilter(`Notes eq 'a' ${'or Notes eq \'b\' '.repeat(80)}`)).toThrow(
      /too complex/,
    );
    expect(() => customerFilter(`Notes eq '${'a'.repeat(2_001)}'`)).toThrow(/Filter is too long/);
    expect(() => customerFilter('Notes eq @')).toThrow(/unexpected character/);
    expect(customFilter('Score ge 1e3')).toBe('Score ge 1000');
  });

  it('handles decimal and date fields on sales entities', () => {
    expect(
      buildFilter("SalesOrderStatus eq 'Open' and TotalAmount gt 1000", resolverFor(orders)),
    ).toBe("(SalesOrderStatus eq 'Open' and TotalAmount gt 1000)");
    expect(
      buildFilter('LineNumber eq 2.5 and OrderedSalesQuantity le 10', resolverFor(lines)),
    ).toBe('(LineNumber eq 2.5 and OrderedSalesQuantity le 10)');
  });
});
