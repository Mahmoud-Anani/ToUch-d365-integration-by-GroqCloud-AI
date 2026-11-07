import { ConfigurationError, D365Error } from '../errors';
import type { Logger } from '../logger';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type Clock = () => number;

/** Minimal token contract used by the D365 client (also allows a disabled provider). */
export interface TokenSource {
  getToken(options?: { forceRefresh?: boolean }): Promise<string>;
  invalidate(failedToken?: string): void;
}

export interface TokenProviderOptions {
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  staticToken?: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
  clock?: Clock;
  logger?: Logger;
}

interface CachedToken {
  value: string;
  expiresAt: number;
  mode: 'clientCredentials' | 'static';
}

const EXPIRY_SKEW_MS = 60_000;

export class TokenProvider implements TokenSource {
  private readonly options: Required<Omit<TokenProviderOptions, 'logger' | 'staticToken'>> & {
    staticToken?: string;
    logger?: Logger;
  };
  private cached?: CachedToken;
  private inflight?: Promise<CachedToken>;
  private refreshCount = 0;
  private failureCount = 0;

  constructor(options: TokenProviderOptions) {
    this.options = {
      tokenUrl: options.tokenUrl ?? '',
      clientId: options.clientId ?? '',
      clientSecret: options.clientSecret ?? '',
      scope: options.scope ?? '',
      staticToken: options.staticToken,
      timeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl ?? fetch,
      clock: options.clock ?? (() => Date.now()),
      logger: options.logger,
    };

    if (!this.hasClientCredentials() && !this.options.staticToken) {
      throw new ConfigurationError(
        'D365 authentication is not configured. Set D365_CLIENT_ID and D365_CLIENT_SECRET.',
      );
    }
    if (this.hasClientCredentials() && (!this.options.tokenUrl || !this.options.scope)) {
      throw new ConfigurationError(
        'D365 OAuth is incomplete. D365_TOKEN_URL and D365_SCOPE are required with client credentials.',
      );
    }
  }

  private hasClientCredentials(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  get mode(): 'clientCredentials' | 'static' {
    return this.hasClientCredentials() ? 'clientCredentials' : 'static';
  }

  /**
   * Returns a cached token until it is within the expiry skew, then refreshes it.
   * Concurrent callers share a single token request.
   */
  async getToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    const now = this.options.clock();
    if (!options.forceRefresh && this.cached && this.cached.expiresAt - EXPIRY_SKEW_MS > now) {
      return this.cached.value;
    }

    if (this.mode === 'static') {
      if (!this.cached) {
        this.cached = {
          value: this.options.staticToken as string,
          expiresAt: Number.POSITIVE_INFINITY,
          mode: 'static',
        };
      }
      return this.cached.value;
    }

    if (this.inflight) {
      return (await this.inflight).value;
    }

    this.inflight = this.requestToken();
    try {
      const token = await this.inflight;
      return token.value;
    } finally {
      this.inflight = undefined;
    }
  }

  /** Clears the cached token only if it matches the token that failed. */
  invalidate(failedToken?: string): void {
    if (!this.cached) return;
    if (!failedToken || this.cached.value === failedToken) {
      this.cached = undefined;
    }
  }

  getStatus(): {
    mode: 'clientCredentials' | 'static';
    hasToken: boolean;
    expiresAt?: string;
    refreshCount: number;
    failureCount: number;
  } {
    return {
      mode: this.mode,
      hasToken: Boolean(this.cached),
      ...(this.cached && Number.isFinite(this.cached.expiresAt)
        ? { expiresAt: new Date(this.cached.expiresAt).toISOString() }
        : {}),
      refreshCount: this.refreshCount,
      failureCount: this.failureCount,
    };
  }

  private async requestToken(): Promise<CachedToken> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: 'client_credentials',
      scope: this.options.scope,
    });

    let response: Response;
    try {
      response = await this.options.fetchImpl(this.options.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      this.failureCount += 1;
      this.options.logger?.warn('D365 token request failed (network)', {
        error: (error as Error).name,
      });
      throw new D365Error({
        code: 'D365_AUTH_ERROR',
        publicMessage: 'Unable to reach Microsoft Entra ID for D365 authentication.',
        message: 'D365 token endpoint network error',
        cause: error,
      });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      // Leave payload empty; handled below.
    }

    if (!response.ok) {
      this.failureCount += 1;
      const errorCode = typeof payload.error === 'string' ? payload.error : `http_${response.status}`;
      this.options.logger?.warn('D365 token request rejected', {
        status: response.status,
        errorCode,
      });
      throw new D365Error({
        code: 'D365_AUTH_ERROR',
        publicMessage: 'D365 authentication failed. Verify the integration application credentials.',
        message: `D365 token endpoint returned ${response.status}`,
        details: { upstreamStatus: response.status, errorCode },
      });
    }

    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
    if (!accessToken) {
      this.failureCount += 1;
      throw new D365Error({
        code: 'D365_AUTH_ERROR',
        publicMessage: 'D365 authentication returned an invalid response.',
        message: 'Token response did not contain access_token',
      });
    }

    const expiresInRaw = Number(payload.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3_600;
    const token: CachedToken = {
      value: accessToken,
      expiresAt: this.options.clock() + expiresIn * 1_000,
      mode: 'clientCredentials',
    };
    this.cached = token;
    this.refreshCount += 1;
    this.options.logger?.debug('D365 access token acquired', {
      expiresInSeconds: expiresIn,
    });
    return token;
  }
}
