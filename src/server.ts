import { createConfig } from './config';
import { createRuntime } from './runtime';
import { createApp } from './app';

function main(): void {
  const config = createConfig();
  const services = createRuntime(config);
  const { logger } = services;

  for (const warning of config.warnings) logger.warn(warning);
  const host = process.env.HOST?.trim() || '127.0.0.1';
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && !config.app.trustUserHeader) {
    logger.warn(
      'The API has no user login and is bound to a non-loopback interface. Restrict network access or place it behind an authenticated reverse proxy.',
    );
  }

  const app = createApp(services);
  const server = app.listen(config.port, host, () => {
    logger.info('Touch El-Zanouki Business Intelligence started', {
      host,
      port: config.port,
      model: services.agent.model,
      readOnly: true,
      d365Configured: services.d365Configured,
      aiConfigured: services.aiConfigured,
    });
  });

  if (services.d365Configured) {
    // Warm the metadata catalog in the background; the first chat also awaits it.
    void services.metadata.getCatalog().catch((error: unknown) => {
      logger.warn('Initial metadata load failed', {
        error: error instanceof Error ? error.name : 'UnknownError',
      });
    });
  }

  const shutdown = (signal: string): void => {
    logger.info('Shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(
    `${JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'Startup failed', error: message })}\n`,
  );
  process.exitCode = 1;
}
