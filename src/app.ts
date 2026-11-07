import path from 'node:path';
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { randomUUID } from 'node:crypto';
import { toPublicError, isAbortError, ValidationError, NotFoundError } from './errors';
import type { AppServices } from './runtime';
import { authMiddleware } from './http/auth';
import { RateLimiter, chatRateLimitMiddleware, rateLimitMiddleware } from './http/rate-limit';
import { requestIdMiddleware, securityHeaders } from './http/security';
import type { AgentStatus } from './ai/status';
import type { PublicConversation } from './chat/types';

const VERSION = '2.0.0';
const MAX_METADATA_QUERY = 200;

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

function parsePositiveInt(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function requireUserId(req: Request): string {
  if (!req.auth) throw new ValidationError('Authentication context is missing.');
  return req.auth.userId;
}

function pathParam(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function metadataSchemaResponse(
  services: AppServices,
  entityName: string,
  options: { fieldContains?: string; maxFields: number },
): Record<string, unknown> {
  const schema = services.metadata.getCatalogSync()?.getSchema(entityName, options);
  if (!schema) throw new NotFoundError('Entity not found in the D365 metadata catalog.');
  const catalog = services.metadata.getCatalogSync();
  return {
    entitySet: schema.entity.entitySet,
    entityType: schema.entity.entityType,
    description: schema.entity.description ?? null,
    metadataAvailable: schema.entity.metadataAvailable,
    keys: schema.entity.keys,
    propertiesTotal: schema.propertiesTotal,
    propertiesReturned: schema.properties.length,
    propertiesTruncated: schema.truncated,
    properties: schema.properties.map((property) => ({
      name: property.name,
      type: property.type,
      key: property.isKey,
      nullable: property.nullable,
    })),
    navigationTotal: schema.navigationTotal,
    navigation: schema.navigation.map((item) => ({
      name: item.name,
      targetType: item.targetType,
      isCollection: item.isCollection,
      targetEntitySets: catalog?.getEntitySetsForType(item.targetType) ?? [],
    })),
  };
}

function sendEvent(res: Response, event: string, data: unknown): boolean {
  if (res.writableEnded) return false;
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function setupSse(res: Response): void {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function lastMessage(conversation: PublicConversation) {
  return conversation.messages[conversation.messages.length - 1];
}

export function createApp(services: AppServices): Express {
  const { config, logger } = services;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(requestIdMiddleware());
  app.use(securityHeaders(config));
  app.use(express.json({ limit: config.requestBodyLimit, strict: true }));

  app.get('/api/health', (req, res) => {
    const metadata = services.metadata.status();
    const aiStatus = services.aiStatus();
    const aiAvailable =
      aiStatus.providers.length === 0 || aiStatus.providers.some((provider) => provider.available);
    const ready = metadata.loaded && services.aiConfigured && aiAvailable && services.d365Configured;
    res.json({
      application: 'Touch El-Zanouki Business Intelligence',
      status: ready ? 'ok' : 'degraded',
      version: VERSION,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - services.startedAt) / 1_000),
      readOnly: true,
      ai: {
        configured: services.aiConfigured,
        model:
          aiStatus.providers.find((provider) => provider.name === aiStatus.activeProvider)?.model ??
          services.agent.model,
        ...aiStatus,
      },
      d365: {
        configured: services.d365Configured,
        authMode: services.d365AuthMode,
      },
      metadata: {
        ...metadata,
        ...(metadata.lastError ? { lastError: 'Last metadata refresh failed.' } : {}),
      },
      authRequired: false,
      warnings: config.warnings,
    });
  });

  const globalLimiter = new RateLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
  });
  const chatLimiter = new RateLimiter({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.chatMax,
  });

  app.use('/api', rateLimitMiddleware(globalLimiter));
  app.use('/api', authMiddleware(config));

  app.get(
    '/api/metadata/status',
    (req, res) => {
      res.json({
        ...services.metadata.status(),
        aiConfigured: services.aiConfigured,
        d365Configured: services.d365Configured,
      });
    },
  );

  app.get(
    '/api/metadata/search',
    asyncHandler(async (req, res) => {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) throw new ValidationError('Query parameter "q" is required.');
      if (q.length > MAX_METADATA_QUERY) {
        throw new ValidationError(`Query must be at most ${MAX_METADATA_QUERY} characters.`);
      }
      const limit = parsePositiveInt(req.query.limit, 10, 25);
      const results = await services.metadata.search(q, limit);
      res.json({ query: q, count: results.length, results });
    }),
  );

  app.get(
    '/api/metadata/entities/:name',
    asyncHandler(async (req, res) => {
      const name = pathParam(req, 'name');
      if (!name || name.length > 200) throw new ValidationError('Invalid entity name.');
      const fieldContains =
        typeof req.query.fieldContains === 'string' ? req.query.fieldContains.trim() : undefined;
      if (fieldContains && fieldContains.length > 100) {
        throw new ValidationError('"fieldContains" must be at most 100 characters.');
      }
      const maxFields = parsePositiveInt(req.query.maxFields, config.ai.maxSchemaFields, 500);
      await services.metadata.getCatalog();
      res.json(
        metadataSchemaResponse(services, name, {
          ...(fieldContains ? { fieldContains } : {}),
          maxFields,
        }),
      );
    }),
  );

  app.get(
    '/api/metadata/entities/:name/related',
    asyncHandler(async (req, res) => {
      const name = pathParam(req, 'name');
      const limit = parsePositiveInt(req.query.limit, 40, 100);
      const result = await services.metadata.getRelated(name, limit);
      if (!result) throw new NotFoundError('Entity not found in the D365 metadata catalog.');
      res.json({
        entitySet: result.entity.entitySet,
        entityType: result.entity.entityType,
        related: result.related,
      });
    }),
  );

  app.post(
    '/api/metadata/refresh',
    asyncHandler(async (req, res) => {
      const started = Date.now();
      logger.audit({
        action: 'metadata.refresh',
        outcome: 'success',
        userRef: requireUserId(req),
        metadata: { ip: req.ip },
      });
      const status = await services.metadata.refresh();
      res.json({ ...status, durationMs: Date.now() - started });
    }),
  );

  app.get(
    '/api/conversations',
    asyncHandler(async (req, res) => {
      const conversations = await services.chat.listSummaries(requireUserId(req));
      res.json({ conversations });
    }),
  );

  app.post(
    '/api/conversations',
    asyncHandler(async (req, res) => {
      const title = (req.body as { title?: unknown } | undefined)?.title;
      const conversation = await services.chat.create(requireUserId(req), typeof title === 'string' ? title : undefined);
      res.status(201).json({ conversation });
    }),
  );

  app.get(
    '/api/conversations/:id',
    asyncHandler(async (req, res) => {
      const conversation = await services.chat.get(requireUserId(req), pathParam(req, 'id'));
      res.json({ conversation });
    }),
  );

  app.patch(
    '/api/conversations/:id',
    asyncHandler(async (req, res) => {
      const title = (req.body as { title?: unknown } | undefined)?.title;
      const conversation = await services.chat.rename(requireUserId(req), pathParam(req, 'id'), title);
      res.json({ conversation });
    }),
  );

  app.delete(
    '/api/conversations/:id',
    asyncHandler(async (req, res) => {
      await services.chat.delete(requireUserId(req), pathParam(req, 'id'));
      res.status(204).end();
    }),
  );

  app.post(
    '/api/chat',
    chatRateLimitMiddleware(chatLimiter),
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as {
        message?: unknown;
        conversationId?: unknown;
        locale?: unknown;
      };
      const prepared = await services.chat.startTurn({
        userId: requireUserId(req),
        message: body.message as string,
        ...(typeof body.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
        ...(body.locale === 'ar' || body.locale === 'en' ? { locale: body.locale } : {}),
      });

      try {
        const result = await services.chat.generate(prepared, {});
        const conversation = await services.chat.completeTurn(prepared, result);
        res.json({ conversation, message: lastMessage(conversation) });
      } catch (error) {
        await services.chat.touchAfterFailure(prepared);
        throw error;
      }
    }),
  );

  app.post(
    '/api/chat/stream',
    chatRateLimitMiddleware(chatLimiter),
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as {
        message?: unknown;
        conversationId?: unknown;
        locale?: unknown;
      };
      const controller = new AbortController();
      let finished = false;
      let prepared: Awaited<ReturnType<typeof services.chat.startTurn>> | undefined;

      setupSse(res);
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          try {
            res.write(': ping\n\n');
          } catch {
            controller.abort();
          }
        }
      }, 15_000);
      heartbeat.unref?.();

      res.on('close', () => {
        if (!finished) controller.abort();
      });

      try {
        prepared = await services.chat.startTurn({
          userId: requireUserId(req),
          message: body.message as string,
          ...(typeof body.conversationId === 'string' ? { conversationId: body.conversationId } : {}),
          ...(body.locale === 'ar' || body.locale === 'en' ? { locale: body.locale } : {}),
        });

        sendEvent(res, 'ready', {
          conversationId: prepared.conversation.id,
          userMessage: prepared.userMessage,
          title: prepared.conversation.title,
          created: prepared.created,
        });

        const emitStatus = (update: AgentStatus): void => {
          sendEvent(res, 'status', update);
        };

        const result = await services.chat.generate(prepared, {
          signal: controller.signal,
          emitStatus,
          ...(body.locale === 'ar' || body.locale === 'en' ? { locale: body.locale } : {}),
        });
        const conversation = await services.chat.completeTurn(prepared, result);
        finished = true;
        sendEvent(res, 'final', { conversation, message: lastMessage(conversation) });
        res.end();
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          finished = true;
          if (!res.writableEnded) res.end();
          return;
        }
        if (prepared) await services.chat.touchAfterFailure(prepared);
        const publicError = toPublicError(error);
        logger.warn('Chat stream failed', {
          requestId: res.locals.requestId,
          code: publicError.body.error.code,
          status: publicError.status,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          conversationId: prepared?.conversation.id,
        });
        finished = true;
        sendEvent(res, 'error', {
          ...publicError.body,
          ...(prepared ? { conversationId: prepared.conversation.id } : {}),
          requestId: res.locals.requestId,
        });
        if (!res.writableEnded) res.end();
      } finally {
        clearInterval(heartbeat);
      }
    }),
  );

  // Legacy endpoint kept for compatibility; now uses refreshed OAuth tokens.
  app.get(
    '/api/users',
    asyncHandler(async (req, res) => {
      const response = await services.client.getEntity('UserODatasCollection', { $top: '100' });
      res.json(response.data);
    }),
  );

  app.use('/api', (req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API route not found.' },
    });
  });

  const publicDir = path.join(__dirname, '..', 'public');
  app.use(
    express.static(publicDir, {
      index: 'index.html',
      maxAge: config.env === 'production' ? '1h' : 0,
      etag: true,
    }),
  );

  app.use((req, res) => {
    if (req.method === 'GET' && req.accepts('html')) {
      res.sendFile(path.join(publicDir, 'index.html'));
      return;
    }
    res.status(404).type('text').send('Not found');
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }

    const bodyParserError = error as { type?: string; status?: number };
    if (bodyParserError?.type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request body is too large.' },
      });
      return;
    }
    if (bodyParserError?.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.' },
      });
      return;
    }

    const publicError = toPublicError(error);
    if (publicError.body.error.retryAfterSeconds) {
      res.setHeader('Retry-After', String(publicError.body.error.retryAfterSeconds));
    }
    const meta = {
      requestId: res.locals.requestId ?? randomUUID(),
      method: req.method,
      path: req.path,
      status: publicError.status,
      code: publicError.body.error.code,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
    if (publicError.status >= 500) logger.error('Request failed', meta);
    else logger.debug('Request rejected', meta);
    res.status(publicError.status).json(publicError.body);
  });

  return app;
}
