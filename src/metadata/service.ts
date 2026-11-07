import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MetadataError } from '../errors';
import type { Logger } from '../logger';
import type { D365Client } from '../d365/client';
import { MetadataCatalog } from './catalog';
import { parseCsdlMetadata } from './parser';
import type { EntityMetadata, EntitySearchResult, MetadataCatalogData, RelatedEntity } from './types';

export interface MetadataServiceOptions {
  cacheTtlMs: number;
  cacheDir: string;
  maxBytes: number;
  baseUrl: string;
  logger?: Logger;
  initialCatalog?: MetadataCatalogData;
}

export interface MetadataStatus {
  loaded: boolean;
  entityCount: number;
  queryableEntityCount: number;
  advertisedEntitySetCount?: number;
  fetchedAt?: string;
  ageSeconds?: number;
  stale: boolean;
  source?: 'memory' | 'disk' | 'network' | 'initial';
  lastError?: string;
  warnings: string[];
}

export class MetadataService {
  private readonly options: MetadataServiceOptions;
  private readonly cacheFile: string;
  private catalog?: MetadataCatalog;
  private loadedAt = 0;
  private source?: 'memory' | 'disk' | 'network' | 'initial';
  private stale = false;
  private lastError?: string;
  private loadPromise?: Promise<MetadataCatalog>;

  constructor(private readonly client: D365Client, options: MetadataServiceOptions) {
    this.options = options;
    this.cacheFile = path.join(options.cacheDir, 'metadata-cache.json');
    if (options.initialCatalog) {
      this.setCatalogData(options.initialCatalog, 'initial');
    }
  }

  getCatalogSync(): MetadataCatalog | undefined {
    return this.catalog;
  }

  setCatalogData(data: MetadataCatalogData, source: 'initial' | 'disk' | 'network' = 'initial'): void {
    this.catalog = new MetadataCatalog(data);
    this.loadedAt = data.fetchedAt;
    this.source = source;
    this.stale = false;
    this.lastError = undefined;
  }

  /**
   * Returns the catalog, refreshing it when the TTL expires. If a refresh
   * fails but a previously cached catalog exists, the stale catalog is used
   * and flagged; otherwise a MetadataError is thrown.
   */
  async getCatalog(options: { forceRefresh?: boolean } = {}): Promise<MetadataCatalog> {
    const now = Date.now();
    const fresh =
      this.catalog !== undefined &&
      (this.options.cacheTtlMs <= 0 ? false : now - this.loadedAt < this.options.cacheTtlMs);

    if (!options.forceRefresh && fresh && this.catalog) {
      return this.catalog;
    }

    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.load(options.forceRefresh === true).finally(() => {
      this.loadPromise = undefined;
    });
    return this.loadPromise;
  }

  async refresh(): Promise<MetadataStatus> {
    await this.getCatalog({ forceRefresh: true });
    return this.status();
  }

  async search(term: string, limit = 10): Promise<EntitySearchResult[]> {
    const catalog = await this.getCatalog();
    return catalog.search(term, limit);
  }

  async getEntity(name: string): Promise<EntityMetadata | undefined> {
    const catalog = await this.getCatalog();
    return catalog.getEntity(name);
  }

  async getSchema(
    entityName: string,
    options: { fieldContains?: string; maxFields: number },
  ): Promise<ReturnType<MetadataCatalog['getSchema']>> {
    const catalog = await this.getCatalog();
    return catalog.getSchema(entityName, options);
  }

  async getRelated(
    entityName: string,
    limit = 40,
  ): Promise<{ entity: EntityMetadata; related: RelatedEntity[] } | undefined> {
    const catalog = await this.getCatalog();
    return catalog.getRelated(entityName, limit);
  }

  status(): MetadataStatus {
    const catalog = this.catalog;
    const data = catalog?.data;
    return {
      loaded: Boolean(catalog),
      entityCount: catalog?.entityCount ?? 0,
      queryableEntityCount: catalog?.queryableEntityCount ?? 0,
      ...(data ? { advertisedEntitySetCount: data.advertisedEntitySetCount } : {}),
      ...(data ? { fetchedAt: new Date(data.fetchedAt).toISOString() } : {}),
      ...(data ? { ageSeconds: Math.max(0, Math.round((Date.now() - data.fetchedAt) / 1_000)) } : {}),
      stale: this.stale,
      ...(this.source ? { source: this.source } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
      warnings: data?.warnings ?? [],
    };
  }

  private async load(forceRefresh: boolean): Promise<MetadataCatalog> {
    const existing = this.catalog;
    const disk = existing ? undefined : this.tryLoadDiskCache();
    const cachedCatalog = existing ?? disk?.catalog;
    const cachedLoadedAt = existing ? this.loadedAt : (disk?.loadedAt ?? 0);
    const cachedSource = existing ? (this.source ?? 'memory') : (disk?.source ?? 'disk');
    const cacheUsable =
      cachedCatalog !== undefined &&
      (this.options.cacheTtlMs <= 0 ? false : Date.now() - cachedLoadedAt < this.options.cacheTtlMs);

    if (!forceRefresh && cacheUsable && cachedCatalog) {
      this.catalog = cachedCatalog;
      this.loadedAt = cachedLoadedAt;
      this.source = cachedSource;
      this.stale = false;
      return cachedCatalog;
    }

    try {
      const fresh = await this.fetchFromD365();
      this.catalog = fresh;
      this.loadedAt = fresh.data.fetchedAt;
      this.source = 'network';
      this.stale = false;
      this.lastError = undefined;
      this.persist(fresh.data);
      return fresh;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown metadata error';
      this.lastError = message;
      if (cachedCatalog) {
        this.catalog = cachedCatalog;
        this.loadedAt = cachedLoadedAt;
        this.source = cachedSource;
        this.stale = true;
        this.options.logger?.warn('Metadata refresh failed; serving stale catalog', {
          error: error instanceof Error ? error.name : 'UnknownError',
          ageSeconds: Math.round((Date.now() - cachedLoadedAt) / 1_000),
        });
        return cachedCatalog;
      }
      this.options.logger?.error('Metadata load failed and no cache is available', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      throw error;
    }
  }

  private async fetchFromD365(): Promise<MetadataCatalog> {
    const started = Date.now();
    this.options.logger?.info('Loading D365 metadata catalog');
    const advertised = await this.client.getServiceDocument();
    const xml = await this.client.getMetadataXml(this.options.maxBytes);
    const data = parseCsdlMetadata(xml, {
      baseUrl: this.options.baseUrl,
      fetchedAt: Date.now(),
      advertisedEntitySets: advertised,
    });
    const catalog = new MetadataCatalog(data);
    this.options.logger?.info('D365 metadata catalog loaded', {
      entitySets: catalog.entityCount,
      queryable: catalog.queryableEntityCount,
      advertised: advertised.length,
      bytes: xml.length,
      durationMs: Date.now() - started,
      warnings: data.warnings.length,
    });
    return catalog;
  }

  private tryLoadDiskCache(): { catalog: MetadataCatalog; source: 'disk'; loadedAt: number } | undefined {
    if (!existsSync(this.cacheFile)) return undefined;
    try {
      const stats = statSync(this.cacheFile);
      if (stats.size > 250 * 1024 * 1024) {
        this.options.logger?.warn('Metadata cache file is too large; ignoring it');
        return undefined;
      }
      const raw = readFileSync(this.cacheFile, 'utf8');
      const data = JSON.parse(raw) as MetadataCatalogData;
      if (
        !data ||
        data.schemaVersion !== 1 ||
        data.baseUrl !== this.options.baseUrl ||
        !Array.isArray(data.entities) ||
        data.entities.length === 0
      ) {
        return undefined;
      }
      const catalog = new MetadataCatalog(data);
      this.options.logger?.info('Loaded D365 metadata from disk cache', {
        entitySets: catalog.entityCount,
        ageSeconds: Math.round((Date.now() - data.fetchedAt) / 1_000),
      });
      return { catalog, source: 'disk', loadedAt: data.fetchedAt };
    } catch (error) {
      this.options.logger?.warn('Unable to read metadata cache file', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
      return undefined;
    }
  }

  private persist(data: MetadataCatalogData): void {
    try {
      mkdirSync(this.options.cacheDir, { recursive: true });
      const temp = `${this.cacheFile}.tmp-${process.pid}`;
      writeFileSync(temp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
      try {
        renameSync(temp, this.cacheFile);
      } catch {
        try {
          unlinkSync(this.cacheFile);
        } catch {
          // ignore
        }
        renameSync(temp, this.cacheFile);
      }
    } catch (error) {
      this.options.logger?.warn('Unable to persist metadata cache', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }
}

export function createMetadataFromXml(
  xml: string,
  options: { baseUrl: string; advertisedEntitySets?: string[] },
): MetadataCatalogData {
  try {
    return parseCsdlMetadata(xml, options);
  } catch (error) {
    if (error instanceof MetadataError) throw error;
    throw new MetadataError('Unable to parse D365 metadata.', {
      code: 'METADATA_PARSE_ERROR',
      cause: error,
    });
  }
}
