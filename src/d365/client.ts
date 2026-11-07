import { AppError, D365Error, isAbortError } from '../errors';
import type { Logger } from '../logger';
import type { FetchLike, TokenSource } from './auth';

export interface D365ClientOptions {
  baseUrl: string;
  tokenProvider: TokenSource;
  timeoutMs: number;
  maxResponseBytes: number;
  fetchImpl?: FetchLike;
  logger?: Logger;
}

export interface D365Response<T = unknown> {
  data: T;
  status: number;
  url: string;
  nextLink?: string;
  count?: number;
}

export interface PageScanOptions {
  maxRows: number;
  pageSize: number;
  signal?: AbortSignal;
}

export interface PageScan {
  rows: Record<string, unknown>[];
  complete: boolean;
  totalMatches?: number;
  pages: number;
  scanned: number;
}

const ENTITY_SET_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,199}$/;

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 0) return new AbortController().signal;
  if (active.length === 1) return active[0] as AbortSignal;
  return AbortSignal.any(active);
}

function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // ignore
    }
    throw new D365Error({
      publicMessage: 'D365 returned more data than the configured safety limit.',
      message: `Response content-length ${declared} exceeds ${maxBytes}`,
      details: { reason: 'RESPONSE_TOO_LARGE' },
    });
  }

  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let received = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new D365Error({
          publicMessage: 'D365 returned more data than the configured safety limit.',
          message: `Response exceeded ${maxBytes} bytes`,
          details: { reason: 'RESPONSE_TOO_LARGE' },
        });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Returns only the first meaningful line of an upstream OData message.
 * D365 error payloads frequently embed .NET stack traces in `message` or
 * `innererror.message`; those must never reach the browser or logs.
 */
function safeODataMessage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const firstLine = value
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return undefined;
  if (/^at\s+[A-Za-z0-9_.$<>]+\s*\(/.test(firstLine)) return undefined;
  // D365 sometimes embeds a .NET stack frame on the same line as the message
  // (e.g. "Bad request.   at Microsoft.Dynamics..."). Drop everything from the
  // first frame onward so internal namespaces/types never reach clients.
  const withoutStack = firstLine
    .replace(/\s+at\s+[A-Za-z0-9_.$<>+`]+\s*\(.*$/, '')
    .replace(/\s+---+\s*End of (?:inner )?exception stack trace.*$/i, '')
    .trim();
  if (!withoutStack || /^at\s+/.test(withoutStack)) return undefined;
  return truncate(withoutStack, 350);
}

function extractODataError(payload: unknown): { code?: string; message?: string; type?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (!error || typeof error !== 'object') return {};
  const obj = error as Record<string, unknown>;
  const inner = obj.innererror && typeof obj.innererror === 'object'
    ? (obj.innererror as Record<string, unknown>)
    : {};
  return {
    code: typeof obj.code === 'string' ? obj.code : undefined,
    message: safeODataMessage(obj.message) ?? safeODataMessage(inner.message),
    type: typeof inner.type === 'string' ? inner.type : undefined,
  };
}

export class D365Client {
  private readonly options: Required<Omit<D365ClientOptions, 'logger' | 'fetchImpl'>> & {
    fetchImpl: FetchLike;
    logger?: Logger;
  };
  private readonly base: URL;
  private readonly dataBase: string;

  constructor(options: D365ClientOptions) {
    const trimmed = options.baseUrl.replace(/\/+$/, '');
    // Accept both the environment root and the OData root, mirroring config
    // normalisation, so a trailing "/data" never produces "/data/data".
    const withoutData = /\/data$/i.test(trimmed) ? trimmed.slice(0, -5) : trimmed;
    this.options = {
      baseUrl: withoutData,
      tokenProvider: options.tokenProvider,
      timeoutMs: options.timeoutMs,
      maxResponseBytes: options.maxResponseBytes,
      fetchImpl: options.fetchImpl ?? fetch,
      logger: options.logger,
    };
    this.base = new URL(this.options.baseUrl);
    const pathname = this.base.pathname.replace(/\/+$/, '');
    this.dataBase = `${this.base.origin}${pathname}/data`;
  }

  get dataRoot(): string {
    return this.dataBase;
  }

  get origin(): string {
    return this.base.origin;
  }

  validateEntitySet(entitySet: string): string {
    if (!ENTITY_SET_PATTERN.test(entitySet)) {
      throw new D365Error({
        publicMessage: 'Invalid D365 entity set name.',
        message: 'Entity set failed identifier validation',
        details: { reason: 'INVALID_ENTITY_SET' },
      });
    }
    return entitySet;
  }

  /** GET /data — the advertised service document (entity set names). */
  async getServiceDocument(): Promise<string[]> {
    const url = `${this.dataBase}`;
    const { text } = await this.requestText(url, {
      accept: 'application/json',
      maxBytes: Math.min(this.options.maxResponseBytes, 8 * 1024 * 1024),
    });
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new D365Error({
        publicMessage: 'D365 returned an unreadable service document.',
        message: 'GET /data did not return JSON',
      });
    }
    const value = (payload as { value?: unknown }).value;
    if (!Array.isArray(value)) {
      throw new D365Error({
        publicMessage: 'D365 returned an unexpected service document.',
        message: 'GET /data did not contain a value array',
      });
    }
    return value
      .map((item) => (item && typeof item === 'object' ? (item as { name?: unknown }).name : undefined))
      .filter((name): name is string => typeof name === 'string' && ENTITY_SET_PATTERN.test(name));
  }

  /** GET /data/$metadata — the raw CSDL document. */
  async getMetadataXml(maxBytes: number, timeoutMs = 180_000): Promise<string> {
    const url = `${this.dataBase}/$metadata`;
    const { text } = await this.requestText(url, {
      accept: 'application/xml, application/atomsvc+xml;q=0.8, */*;q=0.1',
      maxBytes,
      timeoutMs,
    });
    return text;
  }

  async getEntity<T = Record<string, unknown>>(
    entitySet: string,
    params: Record<string, string> | URLSearchParams,
    options: { signal?: AbortSignal; maxBytes?: number; timeoutMs?: number } = {},
  ): Promise<D365Response<T>> {
    this.validateEntitySet(entitySet);
    const url = new URL(`${this.dataBase}/${entitySet}`);
    const search = params instanceof URLSearchParams ? params : new URLSearchParams(params);
    url.search = search.toString();
    return this.getAbsolute<T>(url.toString(), options);
  }

  async getAbsolute<T = Record<string, unknown>>(
    rawUrl: string,
    options: { signal?: AbortSignal; maxBytes?: number; timeoutMs?: number } = {},
  ): Promise<D365Response<T>> {
    const url = this.validateUrl(rawUrl);
    const { text, status } = await this.requestText(url.toString(), {
      accept: 'application/json',
      signal: options.signal,
      maxBytes: options.maxBytes ?? this.options.maxResponseBytes,
      timeoutMs: options.timeoutMs ?? this.options.timeoutMs,
    });

    let payload: unknown;
    try {
      payload = text.trim() === '' ? {} : JSON.parse(text);
    } catch {
      throw new D365Error({
        publicMessage: 'D365 returned an unreadable response.',
        message: 'OData response was not valid JSON',
        details: { upstreamStatus: status },
      });
    }

    const obj = (payload ?? {}) as Record<string, unknown>;
    const count = typeof obj['@odata.count'] === 'number' ? (obj['@odata.count'] as number) : undefined;
    const nextLink = typeof obj['@odata.nextLink'] === 'string' ? obj['@odata.nextLink'] : undefined;
    if (nextLink) this.validateUrl(nextLink);

    return { data: payload as T, status, url: url.toString(), nextLink, count };
  }

  /**
   * Retrieves bounded pages with $top/$skip. When D365 returns a nextLink it is
   * validated and followed; otherwise deterministic offset paging is used.
   * `complete` is only true when the entire filtered result set was scanned.
   */
  async fetchAllPages(
    entitySet: string,
    params: Record<string, string>,
    options: PageScanOptions,
  ): Promise<PageScan> {
    const rows: Record<string, unknown>[] = [];
    let skip = 0;
    let pages = 0;
    let complete = false;
    let totalMatches: number | undefined;
    let nextLink: string | undefined;
    const visited = new Set<string>();
    const maxPages = Math.ceil(options.maxRows / Math.max(1, options.pageSize)) + 2;

    const baseParams = new URLSearchParams(params);
    baseParams.set('$count', 'true');

    while (pages < maxPages && rows.length < options.maxRows) {
      const remaining = options.maxRows - rows.length;
      const pageSize = Math.max(1, Math.min(options.pageSize, remaining));
      let response: D365Response<{ value?: unknown }>;

      if (nextLink) {
        if (visited.has(nextLink)) break;
        visited.add(nextLink);
        response = await this.getAbsolute<{ value?: unknown }>(nextLink, {
          signal: options.signal,
          maxBytes: this.options.maxResponseBytes,
        });
      } else {
        const pageParams = new URLSearchParams(baseParams);
        pageParams.set('$top', String(pageSize));
        if (skip > 0) pageParams.set('$skip', String(skip));
        response = await this.getEntity<{ value?: unknown }>(entitySet, pageParams, {
          signal: options.signal,
          maxBytes: this.options.maxResponseBytes,
        });
      }

      if (totalMatches === undefined && typeof response.count === 'number') {
        totalMatches = response.count;
      }

      const value = response.data?.value;
      const pageRows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
      pages += 1;

      if (pageRows.length === 0) {
        complete = true;
        break;
      }

      rows.push(...pageRows.slice(0, options.maxRows - rows.length));
      nextLink = response.nextLink;

      if (!nextLink) {
        if (pageRows.length < pageSize) {
          complete = true;
          break;
        }
        skip += pageRows.length;
      }

      if (totalMatches !== undefined && rows.length >= totalMatches) {
        complete = true;
        break;
      }
      if (rows.length >= options.maxRows) {
        // If the server count proves exactly maxRows rows exist, the scan is complete.
        if (totalMatches !== undefined && rows.length >= totalMatches) complete = true;
        break;
      }
    }

    if (rows.length === 0 && totalMatches === 0) complete = true;

    return { rows, complete, totalMatches, pages, scanned: rows.length };
  }

  /** Uses $count=true for fast, exact count without downloading records. */
  async count(entitySet: string, filter?: string, signal?: AbortSignal): Promise<number | undefined> {
    const params: Record<string, string> = { $count: 'true', $top: '1' };
    if (filter) params.$filter = filter;
    const response = await this.getEntity<{ value?: unknown }>(entitySet, params, { signal });
    return typeof response.count === 'number' ? response.count : undefined;
  }

  validateUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl, `${this.dataBase}/`);
    } catch {
      throw new D365Error({
        publicMessage: 'D365 returned an invalid pagination link.',
        message: 'Invalid URL',
      });
    }
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      throw new D365Error({
        publicMessage: 'D365 returned an invalid pagination link.',
        message: 'Non-https pagination URL rejected',
      });
    }
    if (url.origin !== this.base.origin) {
      throw new D365Error({
        publicMessage: 'D365 returned a pagination link for a different host; the request was blocked.',
        message: 'Cross-origin pagination link rejected',
        details: { reason: 'ARBITRARY_URL_BLOCKED' },
      });
    }
    if (url.username || url.password) {
      throw new D365Error({
        publicMessage: 'D365 returned an invalid pagination link.',
        message: 'URL credentials rejected',
      });
    }
    if (!url.pathname.startsWith(`${this.base.pathname.replace(/\/+$/, '')}/data/`)) {
      throw new D365Error({
        publicMessage: 'D365 returned a pagination link outside the configured OData endpoint.',
        message: 'Pagination path rejected',
        details: { reason: 'ARBITRARY_URL_BLOCKED' },
      });
    }
    return url;
  }

  private async requestText(
    url: string,
    options: {
      accept: string;
      signal?: AbortSignal;
      maxBytes: number;
      timeoutMs?: number;
      retriedAuth?: boolean;
    },
  ): Promise<{ text: string; status: number }> {
    const token = await this.options.tokenProvider.getToken();
    const signal = combineSignals([
      options.signal,
      AbortSignal.timeout(options.timeoutMs ?? this.options.timeoutMs),
    ]);

    let response: Response;
    try {
      response = await this.options.fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: options.accept,
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
        signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new D365Error({
          publicMessage: 'The D365 request timed out or was cancelled.',
          message: 'D365 request aborted',
          cause: error,
          details: { reason: 'TIMEOUT' },
        });
      }
      this.options.logger?.warn('D365 network error', { error: (error as Error).name });
      throw new D365Error({
        publicMessage: 'Unable to reach Dynamics 365. Check network connectivity and the environment URL.',
        message: 'D365 network error',
        cause: error,
        details: { reason: 'NETWORK' },
      });
    }

    if (response.status === 401 && !options.retriedAuth) {
      this.options.tokenProvider.invalidate(token);
      this.options.logger?.warn('D365 request returned 401; refreshing token and retrying once');
      return this.requestText(url, { ...options, retriedAuth: true });
    }

    const text = await readTextWithLimit(response, options.maxBytes);

    if (!response.ok) {
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const odata = extractODataError(payload);
      this.options.logger?.warn('D365 OData request failed', {
        status: response.status,
        odataCode: odata.code,
        odataType: odata.type,
      });
      if (odata.message) {
        this.options.logger?.debug('D365 OData message', { message: truncate(odata.message, 1_000) });
      }

      if (response.status === 401) {
        throw new D365Error({
          code: 'D365_AUTH_ERROR',
          publicMessage:
            'Dynamics 365 rejected the access token. Verify the integration application and its D365 permissions.',
          message: 'D365 returned 401 after token refresh',
          details: { upstreamStatus: 401 },
        });
      }
      if (response.status === 403) {
        throw new D365Error({
          publicMessage:
            'The D365 integration identity is not permitted to access this data. Contact your D365 administrator.',
          message: 'D365 returned 403',
          details: { upstreamStatus: 403 },
        });
      }
      if (response.status === 404) {
        throw new D365Error({
          publicMessage: 'The requested D365 entity set or record was not found.',
          message: 'D365 returned 404',
          details: { upstreamStatus: 404 },
        });
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        throw new AppError({
          status: 429,
          code: 'D365_UPSTREAM_ERROR',
          publicMessage: 'Dynamics 365 is throttling requests. Please retry shortly.',
          retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10,
          details: { upstreamStatus: 429 },
        });
      }
      if (response.status === 400) {
        const safeMessage = odata.message ? truncate(odata.message, 350) : 'The OData query was rejected.';
        throw new D365Error({
          publicMessage: `D365 rejected the query: ${safeMessage}`,
          message: 'D365 returned 400',
          details: { upstreamStatus: 400, odataCode: odata.code },
        });
      }
      throw new D365Error({
        publicMessage: 'Dynamics 365 returned an error. Please try again later.',
        message: `D365 returned ${response.status}`,
        details: { upstreamStatus: response.status },
      });
    }

    return { text, status: response.status };
  }
}
