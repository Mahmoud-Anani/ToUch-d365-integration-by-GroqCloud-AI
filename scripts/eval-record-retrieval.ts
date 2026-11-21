/**
 * Live read-only record retrieval evaluation.
 * Exercises the same ChatService path used by the browser and records the exact
 * public assistant message (including attachments) that the UI renders.
 *
 * Usage:
 *   node --use-system-ca --import tsx scripts/eval-record-retrieval.ts [filter ...]
 *
 * With no filters it runs suppliers, customers and products.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createConfig } from '../src/config';
import { createRuntime } from '../src/runtime';
import type { PublicChatMessage } from '../src/chat/types';

interface EvalCase {
  id: string;
  question: string;
  locale: 'en' | 'ar';
}

const CASES: EvalCase[] = [
  { id: 'Suppliers', question: 'اريد قائمة بالموردين', locale: 'ar' },
  { id: 'Customers', question: 'Show me the customer list', locale: 'en' },
  { id: 'Products', question: 'Show me the product list', locale: 'en' },
];

const selected = process.argv.slice(2);
const cases = selected.length > 0 ? CASES.filter((item) => selected.includes(item.id)) : CASES;
const config = createConfig({ ...process.env, LOG_LEVEL: process.env.LOG_LEVEL ?? 'error' });
const services = createRuntime(config);
const outPath = path.resolve('data/eval-record-retrieval.json');

function summariseAttachments(message: PublicChatMessage | undefined): Record<string, unknown>[] {
  return (message?.attachments ?? []).map((attachment) => {
    const base: Record<string, unknown> = {
      type: attachment.type,
      title: attachment.title,
      subtitle: 'subtitle' in attachment ? attachment.subtitle : undefined,
    };
    if ('rows' in attachment) {
      base.rowCount = attachment.rows?.length ?? 0;
      base.rows = attachment.rows?.slice(0, 10) ?? [];
      base.columns = attachment.columns ?? [];
      base.truncated = attachment.truncated;
    }
    if ('items' in attachment) base.items = attachment.items;
    return base;
  });
}

async function main(): Promise<void> {
  if (!services.d365Configured) {
    throw new Error('D365 is not configured; live ERP retrieval cannot be verified.');
  }
  const results: Record<string, unknown>[] = [];
  for (const testCase of cases) {
    const started = Date.now();
    process.stderr.write(`\n=== ${testCase.id} | ${testCase.question}\n`);
    try {
      const prepared = await services.chat.startTurn({
        userId: 'eval-record-retrieval',
        message: testCase.question,
        locale: testCase.locale,
      });
      const result = await services.chat.generate(prepared, { locale: testCase.locale });
      const conversation = await services.chat.completeTurn(prepared, result);
      const assistant = [...conversation.messages].reverse().find((item) => item.role === 'assistant');
      const evidence = {
        id: testCase.id,
        question: testCase.question,
        locale: testCase.locale,
        durationMs: Date.now() - started,
        answer: assistant?.content ?? result.content,
        toolsUsed: result.toolsUsed,
        iterations: result.iterations,
        complete: result.complete,
        sources: result.sources,
        dataContext: result.dataContext,
        attachments: summariseAttachments(assistant),
        publicSources: assistant?.sources ?? [],
      };
      results.push(evidence);
      process.stderr.write(
        `tools=${result.toolsUsed.join(',') || 'none'} iterations=${result.iterations} ` +
          `attachments=${evidence.attachments.length} rows=${(evidence.attachments as Array<Record<string, unknown>>)
            .filter((item) => item.type === 'table')
            .reduce((sum, item) => sum + Number(item.rowCount ?? 0), 0)} ${Date.now() - started}ms\n`,
      );
      process.stdout.write(`\n${JSON.stringify(evidence, null, 2)}\n`);
    } catch (error) {
      const failure = {
        id: testCase.id,
        question: testCase.question,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
      results.push(failure);
      process.stderr.write(`FAIL ${failure.error}\n`);
      process.stdout.write(`\n${JSON.stringify(failure, null, 2)}\n`);
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  process.stderr.write(`\nWrote ${outPath}\n`);
}

void main();
