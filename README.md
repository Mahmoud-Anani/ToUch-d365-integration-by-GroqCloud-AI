<div  style="align-items: center;">
          <span class="brand-mark">
            <img src="./public/touch-logo.png" alt="touch-logo" width="200" height="200" />
          </span>
</div>

# Touch El-Zanouki Business Intelligence

Touch El-Zanouki Business Intelligence is the read-only, Arabic- and
English-capable business assistant for Touch, the electrical home-appliance
brand of El-Zenouki Group. It helps colleagues understand the Touch business
through data in Microsoft Dynamics 365 Finance & Operations (F&O): it discovers
the EntitySets and fields exposed by the configured D365 identity, validates
every query against that metadata, and uses a provider-independent AI service
with ordered model failover to answer from retrieved ERP data.

The identity follows Touch's official description: a home-appliance brand
focused on product quality, customer satisfaction, contemporary trends, and
making everyday life easier. That positioning does not establish live product,
sales, stock, supplier, or customer facts; those answers must come from ERP.
The El-Zenouki Group website dates the group's roots to 1964; this is a group
milestone, not a claim about when the Touch brand began.

Brand references: [Touch official site](https://touchelzenouki.com/),
[Touch story, mission and vision](https://touchelzenouki.com/about-us/), and
[El-Zenouki Group](https://elzenouki.com/about-us/).
The UI palette takes its primary coral (`#ff5659`), charcoal (`#333333`) and
sage-green accent (`#a8c26e`) from the public Touch site styling; darker
interactive shades are used where needed for readable text contrast. The [Touch wordmark](https://touchelzenouki.com/wp-content/uploads/2023/08/logo-w.png)
is bundled locally from the company's public site.

The application does not provide write operations. D365 data access is through
OData `GET` requests; conversation and metadata endpoints may write local
application state.

## Architecture

```text
Browser (public/)
  └─ Express API (src/app.ts)
       ├─ Local-only access by default, optional trusted proxy user ID, rate limits
       ├─ ChatService + local JSON/memory conversation store
       ├─ Agent ── provider-neutral AIProvider ── ordered OpenAI-compatible providers
       │    └─ registered local tools: metadata, validated queries, analytics
       └─ MetadataService / QueryBuilder / AnalyticsEngine
            └─ D365Client ── TokenProvider ── D365 OData
```

Key modules:

- `src/ai/`: normalized OpenAI-compatible provider adapter, prioritized AI
  service with health/cooldown telemetry, system prompt, local tools, bounded
  tool loop, and response attachments.
- `src/metadata/`: `/data` discovery, CSDL XML parsing, searchable catalog,
  cache, properties, keys, and navigation relationships.
- `src/query/`: entity, field, filter, sort, expand, and result-limit validation.
- `src/d365/`: OAuth client-credentials token caching/refresh and bounded,
  same-origin OData requests and paging.
- `src/analytics/`: deterministic counts, aggregates, groupings, and comparisons.
- `src/chat/`: conversation ownership, context, persistence, and turn handling.
- `public/`: responsive, bilingual RTL/LTR chat application.

No SQL database is required. By default, conversations and discovered metadata
are persisted as local JSON files under `data/`; set `CONVERSATION_STORE=memory`
to keep conversations in memory only.

## Requirements and installation

Use Node.js 20 LTS or later.

```sh
npm ci
```

Copy `.env.example` to `.env`, then configure the Groq and D365 settings below.
Keep `.env` private; it is excluded from source control.

Development:

```sh
npm run dev
```

Production:

```sh
npm run build
npm start
```

The service listens on `http://localhost:3000` by default and binds to
`127.0.0.1`, so no user-entered application key is required and the API is not
exposed to the network by default. Change `PORT` as needed. The compatibility launcher `node server.js` loads the same
compiled service and therefore requires `npm run build` first.
Open the application at `http://127.0.0.1:3000/`. Do not open `public/` through
a static-file preview server: it serves the page but cannot handle the chat and
metadata `POST` routes. When a loopback static preview is detected, the page
redirects to the default application URL automatically.

## Environment configuration

### AI providers

All configured providers use the same normalized Chat Completions adapter.
Provider credentials stay on the server. Providers without credentials are
skipped; a configured provider also needs a model ID. Models used for ERP
queries must support tool/function calling. Check current model support,
account limits, regional availability, and pricing in each provider's console:
free tiers and free model catalogs are not guaranteed and may change.

| Provider | Credential | Model | Tool-call confirmation | Default API base URL |
| --- | --- | --- | --- | --- |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` (`openai/gpt-oss-120b`) | `GROQ_SUPPORTS_TOOLS` (default `true`) | `GROQ_BASE_URL` (`https://api.groq.com/openai/v1`) |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | `GEMINI_SUPPORTS_TOOLS` (default `false`) | `GEMINI_BASE_URL` (`https://generativelanguage.googleapis.com/v1beta/openai`) |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_MODEL` | `CEREBRAS_SUPPORTS_TOOLS` (default `false`) | `CEREBRAS_BASE_URL` (`https://api.cerebras.ai/v1`) |
| SambaNova | `SAMBANOVA_API_KEY` | `SAMBANOVA_MODEL` | `SAMBANOVA_SUPPORTS_TOOLS` (default `false`) | `SAMBANOVA_BASE_URL` (`https://api.sambanova.ai/v1`) |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `OPENROUTER_SUPPORTS_TOOLS` (default `false`) | `OPENROUTER_BASE_URL` (`https://openrouter.ai/api/v1`) |
| Hugging Face Inference Providers | `HUGGINGFACE_API_KEY` | `HUGGINGFACE_MODEL` | `HUGGINGFACE_SUPPORTS_TOOLS` (default `false`) | `HUGGINGFACE_BASE_URL` (`https://router.huggingface.co/v1`) |
| Local Ollama/custom endpoint | optional | `AI_FALLBACK_PROVIDERS` JSON | `supportsTools` field (default `false`) | local HTTP or custom HTTPS URL |

The application does not guess model IDs for optional providers. Set both the
provider key and model from the provider's current model catalog. For models
verified to support tool calling, explicitly set the matching
`*_SUPPORTS_TOOLS=true` variable (or JSON `supportsTools: true`). Other models
are excluded from ERP tool requests instead of answering without ERP evidence.
Configure Ollama and other custom OpenAI-compatible endpoints using:

```env
AI_FALLBACK_PROVIDERS=[{"name":"ollama-qwen","baseUrl":"http://localhost:11434/v1","model":"qwen2.5:7b","supportsTools":true,"priority":10}]
```

`apiKey` is optional only for a local loopback HTTP endpoint such as Ollama.
Custom HTTPS endpoints require a server-side `apiKey`. Optional `priority`,
`supportsTools`, `tasks`, `contextWindow`, `freeTier`, and `maxTokenParameter`
fields let operators describe model capabilities without changing application
logic. `freeTier` defaults to `unknown`; it is operator metadata, not a live
provider quota check.

| Orchestration setting | Default | Description |
| --- | --- | --- |
| `AI_PRIMARY_PROVIDER` | `groq` | Provider name to prioritize when configured. |
| `AI_PROVIDER_ORDER` | `groq,gemini,cerebras,sambanova,openrouter,huggingface,ollama` | Stable fallback order; custom JSON entries can set `priority`. |
| `AI_FALLBACK_ENABLED` | `true` | Try another available provider after a provider failure. |
| `AI_REQUEST_TIMEOUT` | `30000` | Per-provider request timeout in milliseconds. `GROQ_TIMEOUT_MS` remains a legacy fallback. |
| `AI_PROVIDER_COOLDOWN_MS` | `5000` | Base cooldown for temporary provider failures; repeated failures use exponential backoff. |
| `AI_PROVIDER_MAX_COOLDOWN_MS` | `300000` | Maximum exponential circuit-breaker cooldown. Explicit upstream quota/rate-limit reset times are always honored. |
| `GROQ_TEMPERATURE` | `0.2` | Generation temperature applied to configured providers. |
| `GROQ_MAX_COMPLETION_TOKENS` | `1024` | Per-request output cap applied to configured providers. |
| `AI_MAX_TURN_COMPLETION_TOKENS` | `4096` | Turn-wide generated-token budget, reserving room for a final answer. |

Providers are attempted once per model per request; failures update a circuit
breaker rather than retrying the same provider in a loop. HTTP 429 responses
are distinguished from explicit quota exhaustion when upstream error codes,
messages, or request-quota headers make that distinction. 401/403 credentials
errors, provider/model errors, timeouts, connection errors, and 5xx responses
also trigger failover. Cooldowns use retry/reset headers where available and
otherwise use bounded exponential backoff. Provider usage and health counters
are in memory and reset on process restart; no database is required.

`GET /api/health` reports configured model names, provider availability,
request/token counters, rate-limit/quota counts, response-time averages, last
success, and a bounded fallback history. It never includes API keys. There is
no separate admin dashboard. Assistant messages retain normalized content and
include provider/model/task/fallback metadata in the existing message metadata.
Every configured provider receives the prompts and possibly ERP-derived
context; only configure endpoints approved for that data.

Official compatibility and quota references: [Groq OpenAI compatibility](https://console.groq.com/docs/openai),
[Groq rate limits](https://console.groq.com/docs/rate-limits),
[Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai),
[Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits),
[Cerebras OpenAI compatibility and rate limits](https://inference-docs.cerebras.ai/resources/openai),
[SambaNova quickstart and API URLs](https://docs.sambanova.ai/docs/en/get-started/quickstart),
[OpenRouter API reference](https://openrouter.ai/docs/api_reference/overview.md), and
[Hugging Face chat completions and pricing](https://huggingface.co/docs/inference-providers/en/tasks/chat-completion).
At the time these references were checked, Hugging Face's pricing page lists no
included Inference Provider credits for free accounts; Gemini limits are
project/model dependent; Cerebras documents a limited free-trial tier. Verify
current terms and your account's actual quotas before deployment.

### Dynamics 365 F&O

| Variable                  | Default    | Description                                                                                                                                       |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D365_BASE_URL`           | unset      | Environment root, e.g. `https://<environment>.operations.dynamics.com`; `/data` is appended internally. `D365_URL` is accepted as a legacy alias. |
| `D365_CLIENT_ID`          | unset      | Entra ID application/client ID.                                                                                                                   |
| `D365_CLIENT_SECRET`      | unset      | Entra ID client secret; backend only.                                                                                                             |
| `D365_TENANT_ID`          | unset      | Used to construct the token URL if `D365_TOKEN_URL` is omitted.                                                                                   |
| `D365_TOKEN_URL`          | unset      | OAuth v2 token endpoint.                                                                                                                          |
| `D365_SCOPE`              | derived    | OAuth scope; defaults to `<D365 origin>/.default`.                                                                                                |
| `D365_TOKEN`              | unset      | Legacy static bearer token; avoid where client credentials are available.                                                                         |
| `D365_REQUEST_TIMEOUT_MS` | `60000`    | OData and token request timeout.                                                                                                                  |
| `D365_PAGE_SIZE`          | `500`      | Page size for bounded scans.                                                                                                                      |
| `D365_ANALYTICS_MAX_ROWS` | `5000`     | Maximum rows scanned for deterministic analytics.                                                                                                 |
| `D365_MAX_RESPONSE_BYTES` | `10485760` | Maximum bytes accepted from an individual OData response.                                                                                         |
| `D365_INCLUDE_COUNT`      | `true`     | Request OData counts where supported.                                                                                                             |

Use the real environment URL for `D365_BASE_URL`. The literal template value
`your-environment.operations.dynamics.com` is not a real environment; if
`D365_SCOPE` contains a valid Dynamics 365 `/.default` resource, its origin is
used temporarily and a warning is shown. Set `D365_BASE_URL` explicitly to
confirm the environment. Leave
`D365_TOKEN_URL` empty to derive the Microsoft OAuth endpoint from
`D365_TENANT_ID`, and leave `D365_SCOPE` empty to derive the expected resource
scope from the configured environment. A mismatched explicit scope is reported
as a configuration warning.

The `npm start` and `npm run dev` commands enable Node's system CA store while
keeping TLS certificate verification enabled. This supports Dynamics
environments whose certificate chain is trusted by the operating system but
not Node's bundled CA list. If the certificate is not trusted by the operating
system, install the issuing CA in the trusted store or configure
`NODE_EXTRA_CA_CERTS`; never disable TLS verification.
| `D365_ENTITY_ALLOWLIST` / `D365_ENTITY_DENYLIST` | empty | Optional comma-separated entity/type policies; `*` is supported. |
| `D365_FIELD_ALLOWLIST` / `D365_FIELD_DENYLIST` | empty | Optional comma-separated property policies; `*` is supported. |

An empty allowlist permits all discovered entities/fields unless denied. Set
explicit allowlists for production deployments that should expose only a
specific ERP data surface.

OAuth uses the client-credentials grant. Tokens are cached with an expiry
margin, refreshed automatically, and retried once after an OData `401`. The
integration identity's D365 roles and permissions determine what the assistant
can read. The identity is shared by requests; application users do **not**
inherit individual D365 permissions.

The metadata service requests `GET /data` and `GET /data/$metadata`. Its
on-disk cache is scoped to the configured D365 base URL. An expired cache may
be served as stale if D365 is temporarily unavailable; status and chat sources
identify incomplete or stale information.

### Limits, persistence, and application access

| Variable                      | Default                   | Description                                                                                                                             |
| ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT` / `HOST`               | `3000` / `127.0.0.1`      | Listener port and host. The default is local-only; only set a network interface when access is protected by a trusted network boundary. |
| `NODE_ENV`                    | `development`             | Environment mode.                                                                                                                       |
| `APP_TRUST_USER_HEADER`       | `false`                   | Trust `X-User-Id` only behind a trusted identity-aware reverse proxy.                                                                   |
| `TRUST_PROXY`                 | `false`                   | Trust the first proxy hop for request IP/rate limiting; configure only behind a trusted proxy.                                          |
| `RATE_LIMIT_WINDOW_MS`        | `60000`                   | Rate-limit window.                                                                                                                      |
| `RATE_LIMIT_MAX`              | `90`                      | General API requests per IP/window.                                                                                                     |
| `RATE_LIMIT_CHAT_MAX`         | `20`                      | Chat requests per IP/window.                                                                                                            |
| `REQUEST_BODY_LIMIT`          | `128kb`                   | Express JSON body-size limit.                                                                                                           |
| `AI_MAX_TOOL_ITERATIONS`      | `5`                       | Maximum model/tool-loop iterations per turn.                                                                                            |
| `AI_MAX_RESULT_ROWS`          | `100`                     | Maximum rows returned by a listing tool.                                                                                                |
| `AI_MAX_TOOL_RESULT_ROWS`     | `20`                      | Maximum rows included in model tool output.                                                                                             |
| `AI_MAX_HISTORY_MESSAGES`     | `6`                       | Conversation messages included as context.                                                                                              |
| `AI_MAX_CONTEXT_CHARS`        | `24000`                   | Context size budget.                                                                                                                    |
| `AI_MAX_SCHEMA_FIELDS`        | `60`                      | Default schema fields returned to the model.                                                                                            |
| `AI_MAX_GROUPS`               | `50`                      | Maximum analytics groups.                                                                                                               |
| `AI_ENABLE_READ_ONLY`         | `true`                    | Write operations remain disabled even if set to `false`.                                                                                |
| `AI_METADATA_CACHE_TTL`       | `86400`                   | Metadata cache TTL in seconds.                                                                                                          |
| `METADATA_CACHE_DIR`          | `data`                    | Metadata cache directory.                                                                                                               |
| `METADATA_MAX_BYTES`          | `134217728`               | Maximum size of the CSDL metadata document.                                                                                             |
| `CONVERSATION_STORE`          | `file`                    | `file` for JSON persistence or `memory`.                                                                                                |
| `CONVERSATION_FILE`           | `data/conversations.json` | Conversation store path.                                                                                                                |
| `CONVERSATION_MAX_PER_USER`   | `100`                     | Maximum conversations retained per user.                                                                                                |
| `CONVERSATION_MAX_MESSAGES`   | `200`                     | Maximum messages retained per conversation.                                                                                             |
| `CONVERSATION_RETENTION_DAYS` | `30`                      | Conversation retention period.                                                                                                          |
| `AUDIT_LOG_FILE`              | unset                     | Optional JSON-lines audit log; record values are not written.                                                                           |
| `LOG_LEVEL`                   | `info`                    | `debug`, `info`, `warn`, or `error`.                                                                                                    |

The application does not ask users to enter keys. Groq and D365 credentials
remain server-side in `.env`; they are never sent to the browser. `APP_API_KEY`
is ignored for compatibility with older `.env` files. By default, all local
browser sessions share the local conversation identity. Do not bind the
unauthenticated API to a public or untrusted network. For company-wide access,
place it behind an authenticated HTTPS reverse proxy; set
`APP_TRUST_USER_HEADER=true` only when that proxy authenticates users and
overwrites client-supplied `X-User-Id` values.

## How a question is answered

1. The agent adds the bounded conversation history and explicitly untrusted
   earlier data snapshots to the provider-neutral AI request.
2. The model may request only locally registered tools:
   `searchEntities`, `getEntitySchema`, `queryEntity`, `analyzeData`, and
   `getRelatedEntities`.
3. Tool names/arguments are checked by the backend. Entity names and fields
   must exist in the metadata catalog and pass allow/deny policies.
4. The D365 client executes only `GET` requests. OData filters are parsed and
   re-serialized from a restricted expression grammar; pagination links must
   remain on the configured D365 origin and `/data` path.
5. Analytics are calculated deterministically on the server. Scans are bounded;
   results explicitly indicate whether the scan was complete.
6. The model writes a concise response using tool evidence. The UI displays
   source EntitySets, returned/scanned row counts, completion state, and
   tabular/chart attachments when provided by the backend.

ERP field values are treated as untrusted data and cannot override system
instructions. Tool calls are validated independently of model output. Never
interpret a limited sample as a complete aggregate.

## HTTP API

Endpoints:

| Method   | Path                                        | Purpose                                                                |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/api/health`                               | Public readiness/configuration status; does not expose credentials.    |
| `GET`    | `/api/metadata/status`                      | Metadata and integration status.                                       |
| `GET`    | `/api/metadata/search?q=inventory&limit=10` | Search discovered EntitySets and fields.                               |
| `GET`    | `/api/metadata/entities/:name`              | Inspect an EntitySet schema. Optional `fieldContains` and `maxFields`. |
| `GET`    | `/api/metadata/entities/:name/related`      | Inspect metadata-backed navigation relationships.                      |
| `POST`   | `/api/metadata/refresh`                     | Refresh the local metadata catalog from D365.                          |
| `GET`    | `/api/conversations`                        | List conversations for the local or trusted-proxy identity.            |
| `POST`   | `/api/conversations`                        | Create a conversation; optional JSON `{ "title": "..." }`.             |
| `GET`    | `/api/conversations/:id`                    | Read an owned conversation.                                            |
| `PATCH`  | `/api/conversations/:id`                    | Rename an owned conversation; JSON `{ "title": "..." }`.               |
| `DELETE` | `/api/conversations/:id`                    | Delete an owned conversation.                                          |
| `POST`   | `/api/chat`                                 | Submit a question and wait for its response.                           |
| `POST`   | `/api/chat/stream`                          | SSE progress events followed by the final response or an error.        |
| `GET`    | `/api/users`                                | Legacy compatibility route for the original D365 users endpoint.       |

Chat request:

```json
{
  "message": "How many customers do we have?",
  "conversationId": "optional-existing-conversation-id",
  "locale": "en"
}
```

`locale` may be `en` or `ar`; absent that hint, the assistant follows the
question's language. A successful response has a `conversation` and the latest
`message`, including assistant content, source references, and any structured
attachments. For example, the shape is:

```json
{
  "conversation": {
    "id": "conversation-id",
    "title": "How many customers do we have?",
    "messages": []
  },
  "message": {
    "role": "assistant",
    "content": "Answer based on the retrieved D365 data.",
    "sources": [],
    "attachments": []
  }
}
```

Streaming sends `ready`, `status`, and then `final` or `error` events. Status
events correspond to real agent/tool execution. The response is not token-by-
token model streaming; the final answer is sent once generation completes.

## Query and analytics behavior

The query builder supports validated `$select`, `$filter`, `$orderby`, `$top`,
`$skip`, `$expand`, and `$count`. It rejects unknown properties, disallowed
entities/fields, unsupported filter syntax, invalid navigation properties, and
oversized results. String filter literals use OData single quotes with doubled
embedded quotes.

`analyzeData` supports `count`, `sum`, `average`, `min`, `max`, `groupBy`, and
`comparison`. A server-side count is used when D365 returns it. Other
calculations scan bounded pages (`D365_ANALYTICS_MAX_ROWS`) and report partial
results if the configured scan limit prevents a complete calculation. D365
services may not support every query option or count consistently; errors are
returned as failures, not converted into zero results.

## Frontend

The static chat interface includes conversation history without user-entered
keys, English/Arabic localization, RTL/LTR direction, responsive layouts,
light/dark themes, markdown rendering, copy actions, structured tables/charts,
source metadata, loading/status feedback, and suggested ERP questions. SSE
carries execution status and the final answer; it does not stream partial model
tokens.

## Tests and checks

The automated suite uses mocked external services; it does not require live
D365 access or a Groq key:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Optional live smoke checks require a configured `.env` and make real external
requests:

```sh
npm run smoke:groq
npm run smoke:d365
```

Run these only in an authorized environment. The automated test suite covers
OAuth caching/refresh, CSDL metadata, query and filter validation, bounded
pagination, analytics, tool execution, agent limits, conversation persistence,
no-key local API access, and trusted-proxy conversation isolation.

## Troubleshooting

- **Health is `degraded`:** inspect `GET /api/health` and `GET
/api/metadata/status`; configure a primary or fallback AI provider, D365 values,
and refresh metadata.
- **D365 auth errors:** verify the tenant token URL, application credentials,
  `D365_SCOPE` (`<environment-origin>/.default`), and D365 app permissions.
- **D365 403 / missing entities:** confirm the integration identity's D365
  roles and that the entity is published/advertised by the environment.
- **Entity or field not found:** search current metadata rather than guessing;
  refresh after a D365 schema change.
- **Partial analytics:** increase `D365_ANALYTICS_MAX_ROWS` only when memory,
  response size, execution time, and D365 throttling budgets permit it, or
  narrow the filter.
- **AI provider/model errors:** inspect provider availability in
  `GET /api/health`; confirm configured model IDs are current and support tool
  calling, then check provider quota/credential settings.
- **API returns 401:** the service no longer accepts an application API key.
  If using per-user ownership, configure a trusted proxy to set `X-User-Id` and
  enable `APP_TRUST_USER_HEADER`.
- **Metadata appears stale:** use `POST /api/metadata/refresh`; if D365 is
  unavailable, the service may continue with a labelled stale cache.

## Extending the assistant

### Add a read-only tool

1. Add a `RegisteredTool` in `src/ai/tools.ts` with a JSON-schema argument
   definition and a backend implementation.
2. Validate every argument and resolve entities/properties through
   `MetadataService` and `QueryBuilder`; never accept arbitrary URLs or raw
   OData paths.
3. Return structured content and record/source metadata through the existing
   attachment collector. Keep ERP values out of logs.
4. Register the tool in `createTools()` and describe its intended use in the
   system prompt only when appropriate.
5. Add mocked tests for valid, invalid, unauthorized, and failure cases.

### Change AI provider or model

To change model priority, set `AI_PRIMARY_PROVIDER` and `AI_PROVIDER_ORDER`.
The existing adapter handles providers exposing OpenAI-compatible chat
completions; add another endpoint through `AI_FALLBACK_PROVIDERS` or its
dedicated environment variables. For a provider with a different wire format,
implement `AIProvider` in `src/ai/types.ts`, normalize completions/errors, and
register it in `createRuntime`. Add mocked tests for request mapping, errors,
tool calling, and failover. Do not expose provider keys to the frontend.

## Known limitations

- Live D365/Groq connectivity, current model availability, tenant permissions,
  and real environment-specific metadata must be verified by the operator; no
  live credentials or ERP data are included in unit tests.
- Client-credentials access runs as one integration identity. Per-user D365
  authorization/delegated OAuth is not implemented.
- The API has no built-in user login and binds to loopback by default. Production
  deployments that need shared access must use an authenticated HTTPS reverse
  proxy and a trusted user identity strategy.
- OData capabilities differ by D365 entity/service. Unsupported operations
  fail explicitly, and bounded scans may produce partial analytics.
- The legacy `/api/users` route is retained for compatibility; new integrations
  should use dynamic metadata discovery and chat/query tools instead.
  "# ToUch-d365-integration-by-GroqCloud-AI"
