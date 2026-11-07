import { describe, expect, it, vi } from 'vitest';
import { D365Client, type D365ClientOptions } from '../src/d365/client';
import { AppError, D365Error } from '../src/errors';
import {
  abortError,
  jsonResponse,
  staticTokenSource,
  testLogger,
  TEST_BASE_URL,
  textResponse,
} from './helpers';

const DATA_URL = `${TEST_BASE_URL}/data`;

function makeClient(
  fetchImpl: D365ClientOptions['fetchImpl'],
  overrides: Partial<D365ClientOptions> = {},
): { client: D365Client; tokens: ReturnType<typeof staticTokenSource> } {
  const tokens = staticTokenSource('client-token');
  const client = new D365Client({
    baseUrl: TEST_BASE_URL,
    tokenProvider: tokens,
    timeoutMs: 5_000,
    maxResponseBytes: 64 * 1024,
    fetchImpl,
    ...overrides,
  });
  return { client, tokens };
}

function odataError(message: string, code = 'BadRequest', innerProperties?: string): unknown {
  return {
    error: {
      code,
      message,
      ...(innerProperties
        ? {
            innererror: {
              message: innerProperties,
              type: 'Microsoft.OData.ODataException',
            },
          }
        : {}),
    },
  };
}

describe('D365Client construction and validation', () => {
  it('normalises the base URL and exposes the OData roots', () => {
    const { client } = makeClient(vi.fn());
    expect(client.origin).toBe('https://test.operations.dynamics.com');
    expect(client.dataRoot).toBe(DATA_URL);
  });

  it('strips a trailing /data and trailing slash from the configured base URL', () => {
    const client = new D365Client({
      baseUrl: `${TEST_BASE_URL}/data/`,
      tokenProvider: staticTokenSource(),
      timeoutMs: 1_000,
      maxResponseBytes: 1_024,
      fetchImpl: vi.fn(),
    });
    expect(client.dataRoot).toBe(DATA_URL);
  });

  it.each([
    ['CustomersV3', true],
    ['InventoryOnHandForAI', true],
    ['A1_b', true],
    ['', false],
    ['1Customers', false],
    ['Customers/../Vendors', false],
    ['Customers?$top=1', false],
    ['Customers V3', false],
    ['Customers%20V3', false],
  ])('validates entity set name %j', (name, valid) => {
    const { client } = makeClient(vi.fn());
    if (valid) {
      expect(client.validateEntitySet(name)).toBe(name);
    } else {
      expect(() => client.validateEntitySet(name)).toThrow(D365Error);
    }
  });

  it('rejects pagination links outside the configured data endpoint', () => {
    const { client } = makeClient(vi.fn());
    const rejected = [
      'https://evil.example.com/data/CustomersV3',
      'http://test.operations.dynamics.com/data/CustomersV3',
      'https://test.operations.dynamics.com/other/CustomersV3',
      'https://test.operations.dynamics.com/',
      'https://user:pass@test.operations.dynamics.com/data/CustomersV3',
    ];
    for (const url of rejected) {
      expect(() => client.validateUrl(url)).toThrow(D365Error);
    }
  });

  it('accepts a relative in-scope pagination link', () => {
    const { client } = makeClient(vi.fn());
    const url = client.validateUrl('/data/CustomersV3?$skip=10');
    expect(url.toString()).toBe(`${DATA_URL}/CustomersV3?$skip=10`);
  });

  it('accepts an absolute in-scope pagination link', () => {
    const { client } = makeClient(vi.fn());
    const url = client.validateUrl(`${DATA_URL}/CustomersV3?$skiptoken=abc`);
    expect(url.origin).toBe(TEST_BASE_URL);
  });
});

describe('D365Client service document and metadata', () => {
  it('returns only valid advertised entity set names', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        value: [
          { name: 'CustomersV3', kind: 'EntitySet', url: 'CustomersV3' },
          { name: 'SalesOrderHeadersV2' },
          { name: 'bad name' },
          { notName: true },
          null,
        ],
      }),
    );
    const { client, tokens } = makeClient(fetchImpl);

    await expect(client.getServiceDocument()).resolves.toEqual([
      'CustomersV3',
      'SalesOrderHeadersV2',
    ]);
    expect(tokens.getToken).toHaveBeenCalled();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DATA_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer client-token');
  });

  it('rejects a service document that is not JSON', async () => {
    const { client } = makeClient(vi.fn(async () => textResponse('<html>login</html>')));
    await expect(client.getServiceDocument()).rejects.toMatchObject({
      name: 'D365Error',
      publicMessage: expect.stringContaining('unreadable service document'),
    });
  });

  it('rejects a service document without a value array', async () => {
    const { client } = makeClient(vi.fn(async () => jsonResponse({ d: {} })));
    await expect(client.getServiceDocument()).rejects.toMatchObject({
      publicMessage: expect.stringContaining('unexpected service document'),
    });
  });

  it('loads the raw CSDL metadata with the XML accept header', async () => {
    const fetchImpl = vi.fn(async () => textResponse('<edmx:Edmx />'));
    const { client } = makeClient(fetchImpl);

    await expect(client.getMetadataXml(1_024)).resolves.toBe('<edmx:Edmx />');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${DATA_URL}/$metadata`);
    expect((init.headers as Record<string, string>).Accept).toContain('application/xml');
  });

  it('enforces the metadata size limit', async () => {
    const { client } = makeClient(
      vi.fn(async () => textResponse('x'.repeat(2_048))),
      { maxResponseBytes: 1_024 },
    );
    await expect(client.getMetadataXml(1_024)).rejects.toMatchObject({
      code: 'D365_UPSTREAM_ERROR',
      details: { reason: 'RESPONSE_TOO_LARGE' },
    });
  });
});

describe('D365Client.getEntity / getAbsolute', () => {
  it('builds the query string and parses count and nextLink', async () => {
    const next = `${DATA_URL}/CustomersV3?$skip=2`;
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        '@odata.count': 7,
        '@odata.nextLink': next,
        value: [{ CustomerAccount: 'C1' }],
      }),
    );
    const { client } = makeClient(fetchImpl);

    const response = await client.getEntity('CustomersV3', {
      $select: 'CustomerAccount',
      $top: '2',
    });

    expect(response.count).toBe(7);
    expect(response.nextLink).toBe(next);
    expect(response.status).toBe(200);
    expect(response.url).toBe(`${DATA_URL}/CustomersV3?%24select=CustomerAccount&%24top=2`);
  });

  it('treats an empty body as an empty object', async () => {
    const { client } = makeClient(vi.fn(async () => new Response(null, { status: 204 })));
    const response = await client.getAbsolute(`${DATA_URL}/CustomersV3`);
    expect(response.data).toEqual({});
  });

  it('rejects a nextLink that points to another origin', async () => {
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse({ value: [], '@odata.nextLink': 'https://evil.example/data/CustomersV3' }),
      ),
    );
    await expect(client.getAbsolute(`${DATA_URL}/CustomersV3`)).rejects.toMatchObject({
      details: { reason: 'ARBITRARY_URL_BLOCKED' },
    });
  });

  it('rejects a non-JSON successful response', async () => {
    const { client } = makeClient(vi.fn(async () => textResponse('not json')));
    await expect(client.getAbsolute(`${DATA_URL}/CustomersV3`)).rejects.toMatchObject({
      publicMessage: expect.stringContaining('unreadable response'),
    });
  });

  it('counts rows without downloading them', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ '@odata.count': 42, value: [] }),
    );
    const { client } = makeClient(fetchImpl);

    await expect(client.count('CustomersV3', "IsActive eq true")).resolves.toBe(42);
    const [requested] = fetchImpl.mock.calls[0] as unknown as [string];
    const params = new URL(requested).searchParams;
    expect(params.get('$count')).toBe('true');
    expect(params.get('$top')).toBe('1');
    expect(params.get('$filter')).toBe('IsActive eq true');
  });

  it('returns undefined when the server omits a count', async () => {
    const { client } = makeClient(vi.fn(async () => jsonResponse({ value: [] })));
    await expect(client.count('CustomersV3')).resolves.toBeUndefined();
  });
});

describe('D365Client.fetchAllPages', () => {
  it('pages by $skip until a short page proves completeness', async () => {
    const pages: Record<string, unknown>[][] = [
      [{ n: 1 }, { n: 2 }],
      [{ n: 3 }],
    ];
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      const value = pages[call] ?? [];
      call += 1;
      return jsonResponse({ value });
    });
    const { client } = makeClient(fetchImpl);

    const scan = await client.fetchAllPages(
      'CustomersV3',
      { $select: 'CustomerAccount' },
      { maxRows: 100, pageSize: 2 },
    );

    expect(scan).toMatchObject({ complete: true, pages: 2, scanned: 3 });
    expect(scan.rows).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    const first = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    const firstParams = new URL(first).searchParams;
    expect(firstParams.get('$count')).toBe('true');
    expect(firstParams.get('$top')).toBe('2');
  });

  it('marks the scan complete when the exact server count is reached', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ '@odata.count': 2, value: [{ n: 1 }, { n: 2 }] }),
      );
    const { client } = makeClient(fetchImpl);

    const scan = await client.fetchAllPages('CustomersV3', {}, { maxRows: 100, pageSize: 2 });

    expect(scan).toMatchObject({ complete: true, totalMatches: 2, scanned: 2, pages: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops at maxRows and reports an incomplete scan', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const skip = Number(new URL(String(input)).searchParams.get('$skip') ?? '0');
      return jsonResponse({
        '@odata.count': 10,
        value: [{ n: skip + 1 }, { n: skip + 2 }],
      });
    });
    const { client } = makeClient(fetchImpl);

    const scan = await client.fetchAllPages('CustomersV3', {}, { maxRows: 3, pageSize: 2 });

    expect(scan).toMatchObject({ complete: false, totalMatches: 10, scanned: 3 });
    expect(scan.rows).toHaveLength(3);
    expect(scan.pages).toBe(2);
  });

  it('follows and validates nextLink pagination', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          '@odata.count': 3,
          '@odata.nextLink': `${DATA_URL}/CustomersV3?$skiptoken=page2`,
          value: [{ n: 1 }, { n: 2 }],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ value: [{ n: 3 }] }));
    const { client } = makeClient(fetchImpl);

    const scan = await client.fetchAllPages('CustomersV3', {}, { maxRows: 10, pageSize: 2 });

    expect(scan).toMatchObject({ complete: true, pages: 2, scanned: 3 });
    const second = (fetchImpl.mock.calls[1] as unknown as [string])[0];
    expect(second).toContain('$skiptoken=page2');
  });

  it('rejects a cross-origin nextLink instead of following it', async () => {
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse({
          '@odata.count': 5,
          '@odata.nextLink': 'https://evil.example/data/CustomersV3',
          value: [{ n: 1 }],
        }),
      ),
    );

    await expect(
      client.fetchAllPages('CustomersV3', {}, { maxRows: 10, pageSize: 1 }),
    ).rejects.toMatchObject({ details: { reason: 'ARBITRARY_URL_BLOCKED' } });
  });

  it('does not loop forever when the server repeats a nextLink', async () => {
    const next = `${DATA_URL}/CustomersV3?$skiptoken=again`;
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ '@odata.count': 5, '@odata.nextLink': next, value: [{ n: 1 }] }),
    );
    const { client } = makeClient(fetchImpl);

    const scan = await client.fetchAllPages('CustomersV3', {}, { maxRows: 10, pageSize: 1 });
    expect(scan.complete).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('treats zero matching rows as complete', async () => {
    const { client } = makeClient(
      vi.fn(async () => jsonResponse({ '@odata.count': 0, value: [] })),
    );
    const scan = await client.fetchAllPages('CustomersV3', {}, { maxRows: 10, pageSize: 5 });
    expect(scan).toMatchObject({ complete: true, totalMatches: 0, scanned: 0 });
  });
});

describe('D365Client error handling', () => {
  it('refreshes the token and retries exactly once on 401', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: {} }, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ value: [] }));
    const { client, tokens } = makeClient(fetchImpl);

    await expect(client.getEntity('CustomersV3', {})).resolves.toMatchObject({ status: 200 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tokens.invalidate).toHaveBeenCalledWith('client-token');
  });

  it('fails safely when the retry is also unauthorized', async () => {
    const { client, tokens } = makeClient(
      vi.fn(async () => jsonResponse({ error: { code: 'Unauthorized' } }, { status: 401 })),
    );

    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      name: 'D365Error',
      code: 'D365_AUTH_ERROR',
    });
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
  });

  it('sanitises a 400 message that contains a .NET stack trace', async () => {
    const stack =
      "Bad request for entity.   at Microsoft.Dynamics.AX.Framework.Query.EntityMetadata.GetEntity(String name)\n   at System.RuntimeMethodHandle.InvokeMethod(Object target)";
    const { logger, mock } = testLogger();
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse(odataError(`${stack}\nInner details: Cannot find property SecretField`), { status: 400 }),
      ),
      { logger },
    );

    try {
      await client.getEntity('CustomersV3', {});
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(D365Error);
      const publicMessage = (error as D365Error).publicMessage;
      expect(publicMessage).toContain('D365 rejected the query');
      expect(publicMessage).not.toContain('Microsoft.Dynamics.AX');
      expect(publicMessage).not.toContain('System.RuntimeMethodHandle');
      expect(publicMessage).not.toContain('at Microsoft');
    }
    // The raw stack should never be written to logs either.
    for (const call of mock.error.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('System.RuntimeMethodHandle');
    }
  });

  it('uses the first meaningful line of an OData error', async () => {
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse(
          odataError('\n\n  The property \'Foo\' does not exist.  \n   at Some.Stack.Trace()'),
          { status: 400 },
        ),
      ),
    );

    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      publicMessage: "D365 rejected the query: The property 'Foo' does not exist.",
    });
  });

  it('falls back to innererror.message when the outer message is a stack trace', async () => {
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'BadRequest',
              message: '   at Microsoft.Dynamics.Foo.Bar()',
              innererror: { message: 'Invalid filter clause near $filter.' },
            },
          },
          { status: 400 },
        ),
      ),
    );

    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      publicMessage: 'D365 rejected the query: Invalid filter clause near $filter.',
    });
  });

  it.each([
    [403, 'not permitted'],
    [404, 'not found'],
  ])('maps %i to a safe public message', async (status, text) => {
    const { client } = makeClient(vi.fn(async () => textResponse('', { status })));
    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      publicMessage: expect.stringContaining(text),
      details: { upstreamStatus: status },
    });
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    const { client } = makeClient(
      vi.fn(async () =>
        jsonResponse({}, { status: 429, headers: { 'retry-after': '25' } }),
      ),
    );

    try {
      await client.getEntity('CustomersV3', {});
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(429);
      expect((error as AppError).retryAfterSeconds).toBe(25);
    }
  });

  it('maps an unhandled upstream status to a generic error', async () => {
    const { client } = makeClient(vi.fn(async () => textResponse('bad gateway', { status: 502 })));
    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      publicMessage: expect.stringContaining('returned an error'),
      details: { upstreamStatus: 502 },
    });
  });

  it('maps network failures without leaking host details', async () => {
    const { client } = makeClient(
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND secret-internal-host');
      }),
    );

    try {
      await client.getEntity('CustomersV3', {});
      throw new Error('expected failure');
    } catch (error) {
      expect((error as D365Error).publicMessage).not.toContain('secret-internal-host');
      expect((error as D365Error).details).toMatchObject({ reason: 'NETWORK' });
    }
  });

  it('maps aborts to a timeout error', async () => {
    const { client } = makeClient(vi.fn(async () => {
      throw abortError();
    }));
    await expect(client.getEntity('CustomersV3', {})).rejects.toMatchObject({
      details: { reason: 'TIMEOUT' },
    });
  });

  it('rejects a declared content-length above the limit before reading', async () => {
    const { client } = makeClient(
      vi.fn(
        async () =>
          new Response('{}', {
            status: 200,
            headers: { 'content-length': '999999', 'content-type': 'application/json' },
          }),
      ),
    );

    await expect(client.getAbsolute(`${DATA_URL}/CustomersV3`)).rejects.toMatchObject({
      details: { reason: 'RESPONSE_TOO_LARGE' },
    });
  });

  it('rejects a streamed body above the limit', async () => {
    const { client } = makeClient(
      vi.fn(
        async () =>
          new Response('x'.repeat(4_096), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
      { maxResponseBytes: 1_024 },
    );

    await expect(client.getAbsolute(`${DATA_URL}/CustomersV3`)).rejects.toMatchObject({
      details: { reason: 'RESPONSE_TOO_LARGE' },
    });
  });

  it('propagates an explicit caller abort signal', async () => {
    const controller = new AbortController();
    const { client } = makeClient(
      vi.fn(async () => {
        controller.abort();
        throw abortError();
      }),
    );

    await expect(
      client.getAbsolute(`${DATA_URL}/CustomersV3`, { signal: controller.signal }),
    ).rejects.toMatchObject({ details: { reason: 'TIMEOUT' } });
  });
});
