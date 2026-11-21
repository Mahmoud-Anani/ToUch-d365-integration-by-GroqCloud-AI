import type { AppConfig } from './config';
import { ConfigurationError } from './errors';
import { createLogger, type Logger } from './logger';
import { TokenProvider, type FetchLike, type TokenSource } from './d365/auth';
import { D365Client } from './d365/client';
import { MetadataService } from './metadata/service';
import { QueryBuilder } from './query/builder';
import { AnalyticsEngine } from './analytics/analytics';
import { ToolRegistry } from './ai/tools';
import { OllamaProvider } from './ai/ollama';
import { Agent } from './ai/agent';
import type { AIProvider, AIStatus } from './ai/types';
import type { MetadataCatalogData } from './metadata/types';
import { createConversationStore, type ConversationStore } from './chat/store';
import { ChatService } from './chat/service';
import { UserStore } from './auth/users';
import { SessionService } from './auth/session';
import { DashboardService } from './dashboard/service';
import { DeviceConnectionService } from './device-connections/service';

export interface RuntimeOptions {
  fetchImpl?: FetchLike;
  aiProvider?: AIProvider;
  conversationStore?: ConversationStore;
  initialCatalog?: MetadataCatalogData;
  logger?: Logger;
}

export interface AppServices {
  config: AppConfig;
  logger: Logger;
  metadata: MetadataService;
  client: D365Client;
  queryBuilder: QueryBuilder;
  analytics: AnalyticsEngine;
  tools: ToolRegistry;
  agent: Agent;
  aiStatus: () => AIStatus | Promise<AIStatus>;
  chat: ChatService;
  conversationStore: ConversationStore;
  users: UserStore;
  sessions: SessionService;
  dashboard: DashboardService;
  deviceConnections: DeviceConnectionService;
  aiConfigured: boolean;
  d365Configured: boolean;
  d365AuthMode: 'clientCredentials' | 'static' | 'none';
  startedAt: number;
}

function createTokenSource(config: AppConfig, logger: Logger, fetchImpl?: FetchLike): {
  source: TokenSource;
  mode: 'clientCredentials' | 'static' | 'none';
} {
  if (!config.d365.baseUrl) {
    return {
      mode: 'none',
      source: {
        getToken: async () => {
          throw new ConfigurationError(
            'Dynamics 365 is not configured. Set D365_BASE_URL to the real environment URL.',
          );
        },
        invalidate: () => undefined,
      },
    };
  }

  const { clientId, clientSecret, staticToken } = config.d365;
  if (clientId && clientSecret) {
    return {
      source: new TokenProvider({
        tokenUrl: config.d365.tokenUrl,
        clientId,
        clientSecret,
        scope: config.d365.scope,
        staticToken,
        timeoutMs: config.d365.requestTimeoutMs,
        ...(fetchImpl ? { fetchImpl } : {}),
        logger,
      }),
      mode: 'clientCredentials',
    };
  }
  if (staticToken) {
    return {
      source: new TokenProvider({
        staticToken,
        timeoutMs: config.d365.requestTimeoutMs,
        ...(fetchImpl ? { fetchImpl } : {}),
        logger,
      }),
      mode: 'static',
    };
  }
  return {
    mode: 'none',
    source: {
      getToken: async () => {
        throw new ConfigurationError(
          'Dynamics 365 is not configured. Set D365_CLIENT_ID and D365_CLIENT_SECRET (recommended) or D365_TOKEN.',
        );
      },
      invalidate: () => undefined,
    },
  };
}

export function createRuntime(config: AppConfig, options: RuntimeOptions = {}): AppServices {
  const logger = options.logger ?? createLogger(config.logLevel, config.auditLogFile);
  const users = UserStore.load(config.auth.usersFile);
  const sessions = new SessionService({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
    cookieName: config.auth.cookieName,
    secure: config.auth.cookieSecure,
  });
  const token = createTokenSource(config, logger, options.fetchImpl);
  const d365Configured = Boolean(config.d365.baseUrl) && token.mode !== 'none';

  const client = new D365Client({
    baseUrl: config.d365.baseUrl || 'https://localhost',
    tokenProvider: token.source,
    timeoutMs: config.d365.requestTimeoutMs,
    maxResponseBytes: config.d365.maxResponseBytes,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    logger,
  });

  const metadata = new MetadataService(client, {
    cacheTtlMs: config.metadata.cacheTtlMs,
    cacheDir: config.metadata.cacheDir,
    maxBytes: config.metadata.maxBytes,
    baseUrl: config.d365.baseUrl,
    logger,
    ...(options.initialCatalog ? { initialCatalog: options.initialCatalog } : {}),
  });

  const queryBuilder = new QueryBuilder(metadata, config);
  const analytics = new AnalyticsEngine(client, metadata, queryBuilder, config);
  const tools = new ToolRegistry(metadata, queryBuilder, client, analytics, config, logger);
  const dashboard = new DashboardService({
    analytics,
    queryBuilder,
    client,
    metadata,
    logger,
    searchMaxRows: config.d365.analyticsMaxRows,
    searchPageSize: config.d365.pageSize,
  });

  const localProvider = new OllamaProvider({
    baseUrl: config.ai.baseUrl,
    model: config.ai.model,
    temperature: config.ai.temperature,
    timeoutMs: config.ai.timeoutMs,
    maxCompletionTokens: config.ai.maxCompletionTokens,
    numCtx: config.ai.numCtx,
    thinking: config.ai.thinking,
    maxPromptChars: config.ai.maxPromptChars,
    publicModelLabel: config.ai.modelLabel,
    capabilities: {
      supportsTools: true,
      tasks: config.ai.providers[0]!.tasks,
      freeTier: 'verified',
      contextWindow: config.ai.numCtx,
    },
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    logger,
  });
  const provider = options.aiProvider ?? localProvider;
  const genericStatus: AIStatus = {
    configured: true,
    available: true,
    model: config.ai.modelLabel,
    requests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    averageResponseMs: 0,
  };

  const agent = new Agent(provider, tools, config, logger);

  const conversationStore =
    options.conversationStore ??
    createConversationStore({
      persistent: config.conversations.store === 'file',
      ...(config.conversations.store === 'file' ? { filePath: config.conversations.filePath } : {}),
      maxPerUser: config.conversations.maxPerUser,
      retentionDays: config.conversations.retentionDays,
      logger,
    });

  const chat = new ChatService(conversationStore, agent, config, logger);
  const deviceConnections = new DeviceConnectionService({
    ttlMs: config.deviceConnections.sessionTtlMs,
    maxSessionsPerUser: config.deviceConnections.maxSessionsPerUser,
  });

  return {
    config,
    logger,
    metadata,
    client,
    queryBuilder,
    analytics,
    tools,
    agent,
    aiStatus: () => provider.status?.() ?? genericStatus,
    chat,
    conversationStore,
    users,
    sessions,
    dashboard,
    deviceConnections,
    aiConfigured: true,
    d365Configured,
    d365AuthMode: token.mode,
    startedAt: Date.now(),
  };
}
