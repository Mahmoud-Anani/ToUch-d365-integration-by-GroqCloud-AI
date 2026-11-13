import { createConfig } from './config';
import { createRuntime } from './runtime';
import { createApp } from './app';
import { createServer as createHttpsServer } from 'node:https';
import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { discoverLanIpv4 } from './device-connections/network';
import { attachDeviceConnectionWebSocket } from './device-connections/websocket';

function main(): void {
  const config = createConfig();
  const services = createRuntime(config);
  const { logger } = services;

  for (const warning of config.warnings) logger.warn(warning);
  const host = process.env.HOST?.trim() || '0.0.0.0';
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    logger.warn(
      'The app is bound to a non-loopback interface for network device access. Keep firewall access restricted and use trusted HTTPS for mobile camera access.',
    );
  }

  const app = createApp(services);
  const server = config.https.keyFile && config.https.certFile
    ? createHttpsServer({ key: readFileSync(config.https.keyFile), cert: readFileSync(config.https.certFile) }, app)
    : createHttpServer(app);
  const closeSockets = attachDeviceConnectionWebSocket(server, services);
  server.listen(config.port, host, () => {
    const lanIp = config.deviceConnections.lanIp ?? discoverLanIpv4();
    logger.info('Touch El-Zanouki Business Intelligence started', {
      host,
      port: config.port,
      protocol: config.https.keyFile ? 'https' : 'http',
      phoneUrl: lanIp ? `${config.https.keyFile ? 'https' : 'http'}://${lanIp}:${config.port}` : undefined,
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
    closeSockets();
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
