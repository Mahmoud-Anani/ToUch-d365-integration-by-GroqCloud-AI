/**
 * Local Ollama smoke test. Run with: npm run smoke:ollama
 * Checks daemon connectivity, model registration and a short chat completion.
 */
const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const model = process.env.OLLAMA_MODEL ?? 'd365-local';
const timeoutMs = Number(process.env.OLLAMA_TIMEOUT ?? 120_000);

async function main(): Promise<void> {
  let tags: Response;
  try {
    tags = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    throw new Error(`Ollama is not reachable at ${baseUrl}: ${String(error)}`);
  }
  if (!tags.ok) throw new Error(`Ollama /api/tags returned ${tags.status}`);

  const { models = [] } = (await tags.json()) as {
    models?: Array<{ name?: string }>;
  };
  const available = models.some(
    (item) => item.name?.split(':')[0]?.toLowerCase() === model.toLowerCase(),
  );
  if (!available) {
    throw new Error(`Model "${model}" is not registered. Run: ollama create ${model} -f Modelfile`);
  }
  console.log(`OK  daemon reachable and model "${model}" is registered`);

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [
        { role: 'system', content: 'Answer with exactly one short sentence.' },
        { role: 'user', content: 'Reply with "local assistant ready".' },
      ],
      options: { temperature: 0, num_predict: 48 },
    }),
  });
  if (!response.ok) throw new Error(`Ollama /api/chat returned ${response.status}`);

  const payload = (await response.json()) as {
    message?: { content?: string };
    done_reason?: string;
  };
  const content = payload.message?.content?.trim() ?? '';
  if (!content) throw new Error('Ollama returned an empty answer');
  console.log(`OK  chat reply: ${content.slice(0, 160)}`);
}

main().catch((error: unknown) => {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
