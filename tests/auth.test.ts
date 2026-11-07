import { describe, expect, it, vi } from 'vitest';
import { TokenProvider, type TokenProviderOptions } from '../src/d365/auth';
import { ConfigurationError, D365Error } from '../src/errors';
import {
  abortError,
  jsonResponse,
  staticTokenSource,
  testLogger,
  textResponse,
} from './helpers';

const TOKEN_URL = 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token';
const SCOPE = 'https://test.operations.dynamics.com/.default';

function clientCredentialsOptions(overrides: Partial<TokenProviderOptions> = {}): TokenProviderOptions {
  return {
    tokenUrl: TOKEN_URL,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    scope: SCOPE,
    timeoutMs: 5_000,
    ...overrides,
  };
}

describe('TokenProvider', () => {
  it('requires either client credentials or a static token', () => {
    expect(
      () =>
        new TokenProvider({
          timeoutMs: 1_000,
        }),
    ).toThrow(ConfigurationError);
  });

  it('requires token URL and scope with client credentials', () => {
    expect(
      () =>
        new TokenProvider({
          clientId: 'id',
          clientSecret: 'secret',
          timeoutMs: 1_000,
        }),
    ).toThrow(/D365_TOKEN_URL and D365_SCOPE/);
  });

  it('returns a static token without calling the network', async () => {
    const fetchImpl = vi.fn();
    const provider = new TokenProvider({
      staticToken: 'static-token',
      timeoutMs: 1_000,
      fetchImpl,
    });

    expect(provider.mode).toBe('static');
    expect(await provider.getToken()).toBe('static-token');
    expect(await provider.getToken()).toBe('static-token');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(provider.getStatus()).toMatchObject({ mode: 'static', hasToken: true, refreshCount: 0 });
  });

  it('requests a client-credentials token and caches it', async () => {
    let now = 1_000_000;
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        jsonResponse({ access_token: 'token-1', expires_in: 3_600, token_type: 'Bearer' }),
    );
    const provider = new TokenProvider(
      clientCredentialsOptions({ fetchImpl, clock: () => now }),
    );

    expect(await provider.getToken()).toBe('token-1');
    expect(await provider.getToken()).toBe('token-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init).toBeDefined();
    if (!init) throw new Error('Expected the token request to include fetch options.');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('client_credentials');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('scope')).toBe(SCOPE);

    now += 3_500_000; // outside the 60s expiry skew: still cached
    expect(await provider.getToken()).toBe('token-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 60_000; // inside the 60s expiry skew: refresh

    fetchImpl.mockResolvedValueOnce(jsonResponse({ access_token: 'token-2', expires_in: 3_600 }));
    expect(await provider.getToken()).toBe('token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(provider.getStatus().refreshCount).toBe(2);
  });

  it('shares one in-flight token request between concurrent callers', async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(() => pending);
    const provider = new TokenProvider(clientCredentialsOptions({ fetchImpl }));

    const first = provider.getToken();
    const second = provider.getToken();
    release?.(jsonResponse({ access_token: 'shared-token', expires_in: 3_600 }));

    await expect(first).resolves.toBe('shared-token');
    await expect(second).resolves.toBe('shared-token');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('invalidates only the token that failed', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-a', expires_in: 3_600 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-b', expires_in: 3_600 }));
    const provider = new TokenProvider(clientCredentialsOptions({ fetchImpl }));

    expect(await provider.getToken()).toBe('token-a');
    provider.invalidate('a-different-token');
    expect(await provider.getToken()).toBe('token-a');
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    provider.invalidate('token-a');
    expect(await provider.getToken()).toBe('token-b');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps network failures to a safe D365 auth error', async () => {
    const { logger, mock } = testLogger();
    const provider = new TokenProvider(
      clientCredentialsOptions({
        logger,
        fetchImpl: vi.fn(async () => {
          throw new Error('connect ECONNREFUSED secret-host');
        }),
      }),
    );

    await expect(provider.getToken()).rejects.toMatchObject({
      name: 'D365Error',
      code: 'D365_AUTH_ERROR',
      publicMessage: expect.stringContaining('Unable to reach Microsoft Entra ID'),
    });
    try {
      await provider.getToken();
    } catch (error) {
      expect((error as D365Error).publicMessage).not.toContain('ECONNREFUSED');
      expect((error as D365Error).message).not.toContain('secret-host');
    }
    expect(mock.warn).toHaveBeenCalled();
  });

  it('rejects aborted token requests safely', async () => {
    const provider = new TokenProvider(
      clientCredentialsOptions({
        fetchImpl: vi.fn(async () => {
          throw abortError();
        }),
      }),
    );
    await expect(provider.getToken()).rejects.toMatchObject({
      code: 'D365_AUTH_ERROR',
      publicMessage: expect.stringContaining('Unable to reach Microsoft Entra ID'),
    });
  });

  it('never exposes the Entra error description', async () => {
    const provider = new TokenProvider(
      clientCredentialsOptions({
        fetchImpl: vi.fn(async () =>
          jsonResponse(
            {
              error: 'invalid_client',
              error_description: 'AADSTS7000215: invalid client secret provided: super-secret',
            },
            { status: 401 },
          ),
        ),
      }),
    );

    try {
      await provider.getToken();
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(D365Error);
      expect((error as D365Error).publicMessage).not.toContain('super-secret');
      expect((error as D365Error).publicMessage).not.toContain('AADSTS');
      expect((error as D365Error).details).toMatchObject({
        upstreamStatus: 401,
        errorCode: 'invalid_client',
      });
    }
  });

  it('rejects successful responses that omit access_token', async () => {
    const provider = new TokenProvider(
      clientCredentialsOptions({ fetchImpl: vi.fn(async () => jsonResponse({ expires_in: 10 })) }),
    );
    await expect(provider.getToken()).rejects.toThrow(/access_token/);
  });

  it('handles a non-JSON error response without leaking the body', async () => {
    const provider = new TokenProvider(
      clientCredentialsOptions({
        fetchImpl: vi.fn(async () => textResponse('internal stack trace', { status: 500 })),
      }),
    );
    await expect(provider.getToken()).rejects.toMatchObject({
      code: 'D365_AUTH_ERROR',
      publicMessage: expect.stringContaining('authentication failed'),
    });
  });

  it('allows a custom token source shape used by the runtime', async () => {
    const source = staticTokenSource('fixed');
    expect(await source.getToken()).toBe('fixed');
    source.invalidate();
    expect(source.invalidate).toHaveBeenCalled();
  });
});
