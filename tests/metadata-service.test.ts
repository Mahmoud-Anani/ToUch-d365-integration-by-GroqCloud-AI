import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { D365Client } from '../src/d365/client';
import { MetadataService } from '../src/metadata/service';
import { ADVERTISED_ENTITY_SETS, METADATA_XML } from './fixtures/metadata';
import { catalogData, testLogger, TEST_BASE_URL } from './helpers';

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'd365-metadata-'));
  directories.push(directory);
  return directory;
}

function fakeClient(overrides: Record<string, unknown> = {}): D365Client {
  return {
    getServiceDocument: vi.fn(async () => ADVERTISED_ENTITY_SETS),
    getMetadataXml: vi.fn(async () => METADATA_XML),
    ...overrides,
  } as unknown as D365Client;
}

function service(
  client: D365Client,
  directory: string,
  overrides: Partial<ConstructorParameters<typeof MetadataService>[1]> = {},
): MetadataService {
  return new MetadataService(client, {
    cacheTtlMs: 86_400_000,
    cacheDir: directory,
    maxBytes: 10 * 1024 * 1024,
    baseUrl: TEST_BASE_URL,
    ...overrides,
  });
}

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop() as string, { recursive: true, force: true });
  }
});

describe('MetadataService', () => {
  it('uses an injected initial catalog without touching the network', async () => {
    const client = fakeClient();
    const metadata = service(client, tempDir(), { initialCatalog: catalogData() });

    const catalog = await metadata.getCatalog();
    expect(catalog.entityCount).toBe(8);
    expect(metadata.status()).toMatchObject({
      loaded: true,
      entityCount: 8,
      source: 'initial',
      stale: false,
    });
    expect(client.getServiceDocument).not.toHaveBeenCalled();
  });

  it('loads metadata from D365 and persists a disk cache', async () => {
    const directory = tempDir();
    const { logger } = testLogger();
    const client = fakeClient();
    const metadata = service(client, directory, { logger });

    const catalog = await metadata.getCatalog();
    expect(catalog.queryableEntityCount).toBeGreaterThan(0);
    expect(client.getServiceDocument).toHaveBeenCalledTimes(1);
    expect(client.getMetadataXml).toHaveBeenCalledTimes(1);
    expect(metadata.status()).toMatchObject({
      loaded: true,
      source: 'network',
      advertisedEntitySetCount: ADVERTISED_ENTITY_SETS.length,
      stale: false,
    });

    const cache = JSON.parse(readFileSync(path.join(directory, 'metadata-cache.json'), 'utf8'));
    expect(cache.entities).toHaveLength(catalog.entityCount);
    expect(cache.schemaVersion).toBe(1);
  });

  it('reuses a fresh disk cache without calling D365', async () => {
    const directory = tempDir();
    const loaded = service(fakeClient(), directory);
    await loaded.getCatalog();

    const offline = fakeClient({
      getServiceDocument: vi.fn(async () => {
        throw new Error('network must not be used');
      }),
      getMetadataXml: vi.fn(async () => {
        throw new Error('network must not be used');
      }),
    });
    const cached = service(offline, directory);
    const catalog = await cached.getCatalog();

    expect(catalog.entityCount).toBe(8);
    expect(offline.getServiceDocument).not.toHaveBeenCalled();
    expect(cached.status()).toMatchObject({ source: 'disk', stale: false });
  });

  it('serves a stale catalog when a forced refresh fails', async () => {
    const { logger, mock } = testLogger();
    const directory = tempDir();
    const staleData = catalogData({ fetchedAt: Date.now() - 60_000 });
    const client = fakeClient({
      getServiceDocument: vi.fn(async () => {
        throw new Error('D365 unavailable');
      }),
    });
    const metadata = service(client, directory, {
      cacheTtlMs: 1_000,
      initialCatalog: staleData,
      logger,
    });

    const catalog = await metadata.getCatalog({ forceRefresh: true });
    expect(catalog.entityCount).toBe(8);
    expect(metadata.status()).toMatchObject({
      loaded: true,
      stale: true,
      source: 'initial',
      lastError: 'D365 unavailable',
    });
    expect(mock.warn).toHaveBeenCalledWith(
      expect.stringContaining('stale catalog'),
      expect.any(Object),
    );
  });

  it('fails when no cache exists and D365 is unavailable', async () => {
    const metadata = service(
      fakeClient({
        getServiceDocument: vi.fn(async () => {
          throw new Error('offline');
        }),
      }),
      tempDir(),
    );
    await expect(metadata.getCatalog()).rejects.toThrow('offline');
    expect(metadata.status()).toMatchObject({ loaded: false, stale: false });
  });

  it('refreshes on demand', async () => {
    const client = fakeClient();
    const metadata = service(client, tempDir(), { initialCatalog: catalogData() });
    const status = await metadata.refresh();
    expect(client.getServiceDocument).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ source: 'network', stale: false });
  });

  it('shares one load between concurrent callers', async () => {
    let release: ((xml: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    const client = fakeClient({ getMetadataXml: vi.fn(() => pending) });
    const metadata = service(client, tempDir());

    const first = metadata.getCatalog();
    const second = metadata.getCatalog();
    release?.(METADATA_XML);
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(client.getMetadataXml).toHaveBeenCalledTimes(1);
  });

  it('ignores a corrupt disk cache and reloads from D365', async () => {
    const directory = tempDir();
    writeFileSync(path.join(directory, 'metadata-cache.json'), '{not valid json');
    const metadata = service(fakeClient(), directory);
    const catalog = await metadata.getCatalog();
    expect(catalog.entityCount).toBe(8);
    expect(metadata.status().source).toBe('network');
  });

  it('ignores a cache produced for a different D365 base URL', async () => {
    const directory = tempDir();
    await service(fakeClient(), directory).getCatalog();

    const client = fakeClient();
    const other = service(client, directory, { baseUrl: 'https://other.operations.dynamics.com' });
    await other.getCatalog();
    expect(client.getServiceDocument).toHaveBeenCalledTimes(1);
  });

  it('does not fail the request when the cache cannot be written', async () => {
    const directory = tempDir();
    const blocker = path.join(directory, 'not-a-directory');
    writeFileSync(blocker, 'x');
    const { logger, mock } = testLogger();
    const metadata = service(fakeClient(), path.join(blocker, 'cache'), { logger });
    const catalog = await metadata.getCatalog();
    expect(catalog.entityCount).toBe(8);
    expect(mock.warn).toHaveBeenCalledWith(
      expect.stringContaining('persist'),
      expect.any(Object),
    );
  });

  it('exposes search, schema and relationship helpers', async () => {
    const metadata = service(fakeClient(), tempDir(), { initialCatalog: catalogData() });
    expect((await metadata.search('customer'))[0]?.entitySet).toBe('CustomersV3');
    expect((await metadata.getEntity('CustomersV3'))?.entityTypeShort).toBe('CustomerV3');
    expect((await metadata.getSchema('CustomersV3', { maxFields: 5 }))?.properties.length).toBe(5);
    expect((await metadata.getRelated('CustomersV3'))?.related.length).toBeGreaterThan(0);
  });
});
