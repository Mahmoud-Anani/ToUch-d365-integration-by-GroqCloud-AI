/**
 * Live read-only evaluation harness for the required business chats.
 * Runs the real Agent (local Ollama + controlled tools + D365 OData) and
 * records the evidence needed for the implementation/test report.
 *
 * Usage: node --use-system-ca --import tsx scripts/eval-six-chats.ts [chatId ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createConfig } from '../src/config';
import { createRuntime } from '../src/runtime';

interface EvalCase {
  id: string;
  question: string;
  locale: 'en' | 'ar';
}

const CASES: EvalCase[] = [
  { id: 'HDMI Sales', question: 'ما هي نسبة مبيعات منتج اسمه HDMI؟', locale: 'ar' },
  { id: 'Most Returned Product', question: 'ما هو أكثر منتج يتم ارتجاعه؟', locale: 'ar' },
  { id: 'Touch Products', question: 'Show me the Touch appliance products currently listed in our ERP.', locale: 'en' },
  { id: 'Top 10 Products', question: 'ما هي أكثر 10 منتجات مبيعاً خلال آخر 6 أشهر؟', locale: 'ar' },
  { id: 'Return Trends', question: 'ما المنتجات التي زادت مرتجعاتها مقارنة بالفترة السابقة؟', locale: 'ar' },
  { id: 'Low Inventory', question: 'ما المنتجات التي لديها مخزون منخفض مقارنة بمعدل مبيعاتها؟', locale: 'ar' },
];

const config = createConfig(process.env);
const runtime = createRuntime(config);
const selected = process.argv.slice(2);
const cases = selected.length > 0 ? CASES.filter((item) => selected.includes(item.id)) : CASES;

async function main(): Promise<void> {
  const results: Record<string, unknown>[] = [];
  for (const testCase of cases) {
    const started = Date.now();
    process.stderr.write(`\n=== ${testCase.id} | ${testCase.question}\n`);
    try {
      const result = await runtime.agent.run({
        question: testCase.question,
        userId: 'eval-local',
        locale: testCase.locale,
      });
      const evidence = {
        id: testCase.id,
        question: testCase.question,
        locale: testCase.locale,
        answer: result.content,
        toolsUsed: result.toolsUsed,
        iterations: result.iterations,
        task: result.task,
        complete: result.complete,
        durationMs: result.durationMs,
        sources: result.sources,
        dataContext: result.dataContext,
        attachments: result.attachments.map((attachment) => ({
          type: attachment.type,
          title: attachment.title,
          ...('items' in attachment ? { items: attachment.items } : {}),
          ...('rows' in attachment ? { rows: attachment.rows?.slice(0, 10) } : {}),
        })),
      };
      results.push(evidence);
      process.stderr.write(
        `tools=${result.toolsUsed.join(',') || 'none'} iterations=${result.iterations} ${Date.now() - started}ms\n`,
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
      process.stdout.write(`\n${JSON.stringify(failure, null, 2)}\n`);
    }
  }
  const outPath = path.resolve('data/eval-six-chats.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  process.stderr.write(`\nWrote ${outPath}\n`);
}

void main();
