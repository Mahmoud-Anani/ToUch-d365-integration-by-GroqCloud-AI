/**
 * Offline validation for the CSDL metadata parser and catalog search.
 *
 * Usage:
 *   npx tsx scripts/validate-metadata.ts [path-to-$metadata.xml]
 *
 * When no path is given, D365_METADATA_FILE is used. This script never calls
 * D365, so it is safe to run against a previously downloaded metadata file.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCsdlMetadata } from '../src/metadata/parser';
import { MetadataCatalog } from '../src/metadata/catalog';

function main(): void {
  const file = process.argv[2] ?? process.env.D365_METADATA_FILE;
  if (!file) {
    console.error('Usage: tsx scripts/validate-metadata.ts <path-to-$metadata.xml>');
    process.exitCode = 1;
    return;
  }

  const started = Date.now();
  const xml = readFileSync(path.resolve(file), 'utf8');
  const data = parseCsdlMetadata(xml, {
    baseUrl: process.env.D365_BASE_URL ?? 'https://offline.invalid',
  });
  const catalog = new MetadataCatalog(data);
  const properties = data.entities.reduce((total, entity) => total + entity.properties.length, 0);
  const navigation = data.entities.reduce(
    (total, entity) => total + entity.navigationProperties.length,
    0,
  );

  const searchTerms = ['customer', 'vendor', 'product', 'warehouse', 'inventory', 'مخزون', 'موردين'];
  const searches: Record<string, string[]> = {};
  for (const term of searchTerms) {
    searches[term] = catalog.search(term, 5).map((result) => result.entitySet);
  }

  const sample = data.entities.find((entity) => entity.metadataAvailable);
  const related = sample ? catalog.getRelated(sample.entitySet, 5) : undefined;

  console.log(
    JSON.stringify(
      {
        file: path.resolve(file),
        bytes: xml.length,
        durationMs: Date.now() - started,
        entitySets: data.entities.length,
        queryableEntitySets: catalog.queryableEntityCount,
        advertisedEntitySetCount: data.advertisedEntitySetCount,
        missingEntityTypes: data.missingEntityTypes.length,
        properties,
        navigationProperties: navigation,
        warnings: data.warnings,
        searches,
        sampleEntity: sample
          ? {
              entitySet: sample.entitySet,
              entityType: sample.entityType,
              keys: sample.keys,
              properties: sample.properties.length,
              navigationProperties: sample.navigationProperties.length,
              description: sample.description ?? null,
              related: related?.related.slice(0, 3) ?? [],
            }
          : null,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
