import type { AppConfig } from './config';
import { ConfigurationError } from './errors';
import { createLogger, type Logger } from './logger';
import { TokenProvider, type FetchLike, type TokenSource } from './d365/auth';
import { D365Client } from './d365/client';
import { MetadataService } from './metadata/service';
import { QueryBuilder } from './query/builder';
import { AnalyticsEngine } from './analytics/analytics';
import { ToolRegistry } from './ai/tools';
import { OpenAICompatibleProvider } from './ai/groq';
import { AIService, type AIServiceStatus } from './ai/fallback';
import { Agent } from './ai/agent';
import type { AIProvider } from './ai/types';
import type { MetadataCatalogData } from './metadata/types';
import { createConversationStore, type ConversationStore } from './chat/store';
import { ChatService } from './chat/service';

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
  aiStatus: () => AIServiceStatus;
  chat: ChatService;
  conversationStore: ConversationStore;
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

  const configuredProviders = config.ai.providers.map(
    (provider) =>
      new OpenAICompatibleProvider({
        ...provider,
        temperature: config.ai.temperature,
        timeoutMs: config.ai.timeoutMs,
        maxCompletionTokens: config.ai.maxCompletionTokens,
        capabilities: {
          supportsTools: provider.supportsTools,
          tasks: provider.tasks,
          freeTier: provider.freeTier,
          ...(provider.contextWindow ? { contextWindow: provider.contextWindow } : {}),
        },
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        logger,
      }),
  );
  const aiService = new AIService(
      configuredProviders,
      {
        fallbackEnabled: config.ai.fallbackEnabled,
        maxRetries: config.ai.maxRetries,
        cooldownMs: config.ai.providerCooldownMs,
        maxCooldownMs: config.ai.providerMaxCooldownMs,
        primaryProvider: config.ai.primaryProvider,
      },
      logger,
    );
  const provider = options.aiProvider ?? aiService;

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

  return {
    config,
    logger,
    metadata,
    client,
    queryBuilder,
    analytics,
    tools,
    agent,
    aiStatus: () => aiService.status(),
    chat,
    conversationStore,
    aiConfigured: configuredProviders.length > 0 || options.aiProvider !== undefined,
    d365Configured,
    d365AuthMode: token.mode,
    startedAt: Date.now(),
  };
}
