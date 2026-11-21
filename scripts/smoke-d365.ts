/**
 * D365 F&O connectivity smoke test. Run with: npm run smoke:d365
 * Verifies OAuth, the OData service document, metadata refresh and entity
 * discovery using the existing read-only runtime. No secrets are printed.
 */
import { createConfig } from '../src/config';
import { createLogger } from '../src/logger';
import { createRuntime } from '../src/runtime';

async function main(): Promise<void> {
  const config = createConfig({ ...process.env, LOG_LEVEL: 'error' });
  if (!config.d365.baseUrl) {
    throw new Error('D365_BASE_URL is not configured.');
  }

  const services = createRuntime(config, { logger: createLogger('error') });

  const entitySets = await services.client.getServiceDocument();
  console.log(`OK  OAuth and OData service document returned ${entitySets.length} entity sets`);

  const status = await services.metadata.refresh();
  if (!status.loaded) throw new Error('D365 metadata refresh did not complete');
  console.log(
    `OK  metadata refreshed (${status.entityCount ?? 0} entities, ${status.queryableEntityCount ?? 0} queryable)`,
  );

  const catalog = await services.metadata.getCatalog();
  const first =
    catalog.data.entities.find((entity) => entity.metadataAvailable && entity.entitySet) ??
    catalog.data.entities.find((entity) => entity.entitySet);
  if (!first?.entitySet) throw new Error('No queryable D365 entity set was discovered');
  console.log(`OK  entity discovery returned ${first.entitySet}`);
}

main().catch((error: unknown) => {
  console.error(
    `FAIL ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
  );
  process.exitCode = 1;
});
