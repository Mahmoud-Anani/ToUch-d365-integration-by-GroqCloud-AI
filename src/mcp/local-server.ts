import { randomUUID } from 'node:crypto';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createConfig } from '../config';
import { createRuntime } from '../runtime';
import { AttachmentCollector } from '../ai/attachments';
import { createLogger } from '../logger';

const config = createConfig();
const logger = createLogger('error');
// MCP stdio reserves stdout for the protocol stream. The normal app logger
// writes audit events to stdout, so suppress them for this local process.
logger.audit = () => undefined;
const runtime = createRuntime(config, { logger });

serveStdio(() => {
  const server = new McpServer({ name: 'touch-d365-local', version: '2.0.0' });
  for (const definition of runtime.tools.definitions) {
    const name = definition.function.name;
    server.registerTool(
      name,
      {
        description: definition.function.description,
        inputSchema: z.record(z.string(), z.unknown()),
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      async (args) => {
        const result = await runtime.tools.execute(name, args, {
          userId: 'local-mcp-client',
          toolCallId: randomUUID(),
          collector: new AttachmentCollector(),
          emitStatus: () => undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result.content) }],
          ...(result.isError ? { isError: true } : {}),
        };
      },
    );
  }
  return server;
});
