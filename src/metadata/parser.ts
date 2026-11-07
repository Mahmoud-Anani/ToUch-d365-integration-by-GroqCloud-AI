import { MetadataError } from '../errors';
import type {
  EntityMetadata,
  EntityNavigationProperty,
  EntityProperty,
  MetadataCatalogData,
} from './types';

interface RawType {
  name: string;
  shortName: string;
  baseType?: string;
  block: string;
  keys: string[];
  properties: EntityProperty[];
  navigationProperties: EntityNavigationProperty[];
  description?: string;
}

const ENTITY_SET_NAME = /^[A-Za-z][A-Za-z0-9_]{0,199}$/;

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const regex = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    attributes[match[1] as string] = decodeXml(match[2] as string);
  }
  return attributes;
}

function shortName(fullName: string): string {
  const index = fullName.lastIndexOf('.');
  return index >= 0 ? fullName.slice(index + 1) : fullName;
}

function isCollectionType(type: string): boolean {
  return /^Collection\(.+\)$/.test(type);
}

function unwrapCollectionType(type: string): string {
  const match = /^Collection\((.+)\)$/.exec(type);
  return match ? (match[1] as string) : type;
}

function parseDescription(block: string): string | undefined {
  const regex =
    /<Annotation\b[^>]*Term="[^"]*(?:Description|LongDescription|Summary)[^"]*"[^>]*String="([^"]*)"/i;
  const match = regex.exec(block);
  if (!match) return undefined;
  const value = decodeXml(match[1] as string).trim();
  return value && !value.startsWith('@') ? value : undefined;
}

function parseRawType(name: string, baseType: string | undefined, block: string): RawType {
  const keys: string[] = [];
  const keyBlock = /<Key>([\s\S]*?)<\/Key>/i.exec(block);
  if (keyBlock) {
    const refRegex = /<PropertyRef\b([^>]*?)\/?>/gi;
    let ref: RegExpExecArray | null;
    while ((ref = refRegex.exec(keyBlock[1] as string)) !== null) {
      const attrs = parseAttributes(ref[1] as string);
      if (attrs.Name) keys.push(attrs.Name);
    }
  }

  const properties: EntityProperty[] = [];
  const propertyRegex = /<Property\b([^>]*?)\/?>/gi;
  let propertyMatch: RegExpExecArray | null;
  while ((propertyMatch = propertyRegex.exec(block)) !== null) {
    const attrs = parseAttributes(propertyMatch[1] as string);
    if (!attrs.Name) continue;
    const type = attrs.Type ?? 'Edm.String';
    properties.push({
      name: attrs.Name,
      type,
      isKey: keys.includes(attrs.Name),
      nullable: attrs.Nullable === undefined ? true : attrs.Nullable !== 'false',
      isCollection: isCollectionType(type),
      ...(attrs.Description ? { description: attrs.Description } : {}),
    });
  }

  const navigationProperties: EntityNavigationProperty[] = [];
  const navigationRegex = /<NavigationProperty\b([^>]*?)\/?>/gi;
  let navigationMatch: RegExpExecArray | null;
  while ((navigationMatch = navigationRegex.exec(block)) !== null) {
    const attrs = parseAttributes(navigationMatch[1] as string);
    if (!attrs.Name || !attrs.Type) continue;
    const targetType = unwrapCollectionType(attrs.Type);
    navigationProperties.push({
      name: attrs.Name,
      targetType,
      targetTypeShort: shortName(targetType),
      isCollection: isCollectionType(attrs.Type),
    });
  }

  return {
    name,
    shortName: shortName(name),
    baseType,
    block,
    keys: [...new Set(keys)],
    properties,
    navigationProperties,
    description: parseDescription(block),
  };
}

function resolveTypes(rawTypes: Map<string, RawType>): Map<string, RawType> {
  const resolved = new Map<string, RawType>();

  const resolve = (raw: RawType, stack: Set<string>): RawType => {
    const existing = resolved.get(raw.name);
    if (existing) return existing;
    if (stack.has(raw.name)) {
      return raw;
    }
    stack.add(raw.name);

    let inherited: RawType | undefined;
    if (raw.baseType) {
      const base =
        rawTypes.get(raw.baseType) ??
        rawTypes.get(shortName(raw.baseType)) ??
        [...rawTypes.values()].find((item) => item.shortName === shortName(raw.baseType as string));
      if (base) inherited = resolve(base, stack);
    }

    const merged: RawType = {
      ...raw,
      keys: raw.keys.length > 0 ? raw.keys : (inherited?.keys ?? []),
      properties: [
        ...(inherited?.properties ?? []),
        ...raw.properties.filter(
          (property) => !(inherited?.properties ?? []).some((base) => base.name === property.name),
        ),
      ],
      navigationProperties: [
        ...(inherited?.navigationProperties ?? []),
        ...raw.navigationProperties.filter(
          (navigation) =>
            !(inherited?.navigationProperties ?? []).some((base) => base.name === navigation.name),
        ),
      ],
      description: raw.description ?? inherited?.description,
    };
    merged.properties = merged.properties.map((property) => ({
      ...property,
      isKey: merged.keys.includes(property.name),
    }));
    resolved.set(raw.name, merged);
    stack.delete(raw.name);
    return merged;
  };

  for (const raw of rawTypes.values()) resolve(raw, new Set());
  return resolved;
}

export interface ParseMetadataOptions {
  baseUrl: string;
  fetchedAt?: number;
  advertisedEntitySets?: string[];
}

/**
 * Parses the CSDL/EDM XML returned by D365's /data/$metadata endpoint.
 * The parser is deliberately schema-agnostic: no entity or field names are
 * hardcoded and only the real metadata is used to build the catalog.
 */
export function parseCsdlMetadata(xml: string, options: ParseMetadataOptions): MetadataCatalogData {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new MetadataError('D365 returned an empty metadata document.', {
      code: 'METADATA_PARSE_ERROR',
    });
  }

  const warnings: string[] = [];
  const rawTypes = new Map<string, RawType>();

  const typeRegex = /<EntityType\b([^>]*?)(\/?)>/gi;
  let typeMatch: RegExpExecArray | null;
  while ((typeMatch = typeRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(typeMatch[1] as string);
    if (!attrs.Name) continue;
    if (typeMatch[2] === '/') {
      rawTypes.set(attrs.Name, {
        name: attrs.Name,
        shortName: shortName(attrs.Name),
        baseType: attrs.BaseType,
        block: '',
        keys: [],
        properties: [],
        navigationProperties: [],
      });
      continue;
    }
    const closeIndex = xml.indexOf('</EntityType>', typeRegex.lastIndex);
    if (closeIndex < 0) {
      throw new MetadataError('D365 metadata contains an unterminated EntityType element.', {
        code: 'METADATA_PARSE_ERROR',
      });
    }
    const block = xml.slice(typeRegex.lastIndex, closeIndex);
    typeRegex.lastIndex = closeIndex + '</EntityType>'.length;
    const parsed = parseRawType(attrs.Name, attrs.BaseType, block);
    rawTypes.set(attrs.Name, parsed);
  }

  if (rawTypes.size === 0) {
    throw new MetadataError('D365 metadata did not contain any EntityType definitions.', {
      code: 'METADATA_PARSE_ERROR',
    });
  }

  const resolved = resolveTypes(rawTypes);

  const entities: EntityMetadata[] = [];
  const seenSets = new Set<string>();
  const entitySetRegex = /<EntitySet\b([^>]*?)\/?>/gi;
  let setMatch: RegExpExecArray | null;
  while ((setMatch = entitySetRegex.exec(xml)) !== null) {
    const attrs = parseAttributes(setMatch[1] as string);
    if (!attrs.Name || !attrs.EntityType) continue;
    if (!ENTITY_SET_NAME.test(attrs.Name) || seenSets.has(attrs.Name)) continue;
    seenSets.add(attrs.Name);

    const targetTypeFull = attrs.EntityType;
    const type =
      resolved.get(targetTypeFull) ??
      resolved.get(shortName(targetTypeFull)) ??
      [...resolved.values()].find((item) => item.shortName === shortName(targetTypeFull));

    if (!type) {
      entities.push({
        entitySet: attrs.Name,
        entityType: targetTypeFull,
        entityTypeShort: shortName(targetTypeFull),
        keys: [],
        properties: [],
        navigationProperties: [],
        metadataAvailable: false,
      });
      continue;
    }

    entities.push({
      entitySet: attrs.Name,
      entityType: targetTypeFull,
      entityTypeShort: type.shortName,
      keys: type.keys,
      properties: type.properties,
      navigationProperties: type.navigationProperties,
      ...(type.description ? { description: type.description } : {}),
      metadataAvailable: true,
    });
  }

  if (entities.length === 0) {
    throw new MetadataError('D365 metadata did not contain any EntitySet definitions.', {
      code: 'METADATA_PARSE_ERROR',
    });
  }

  const advertised = new Set((options.advertisedEntitySets ?? []).filter((name) => ENTITY_SET_NAME.test(name)));
  for (const name of advertised) {
    if (!seenSets.has(name)) {
      entities.push({
        entitySet: name,
        entityType: '',
        entityTypeShort: '',
        keys: [],
        properties: [],
        navigationProperties: [],
        metadataAvailable: false,
      });
    }
  }

  const missing = entities.filter((entity) => !entity.metadataAvailable).map((entity) => entity.entitySet);
  if (missing.length > 0) {
    warnings.push(
      `${missing.length} advertised entity set(s) have no EntityType metadata and are not queryable.`,
    );
  }

  return {
    schemaVersion: 1,
    fetchedAt: options.fetchedAt ?? Date.now(),
    baseUrl: options.baseUrl,
    entities,
    advertisedEntitySetCount: advertised.size,
    missingEntityTypes: missing.slice(0, 100),
    warnings,
  };
}
