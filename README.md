<p align="center">
  <img src="./public/touch-logo.png" alt="Touch El-Zanouki logo" width="160" />
</p>

<h1 align="center">Touch El-Zanouki Business Intelligence</h1>

<p align="center">
  A bilingual, read-only Dynamics 365 Finance &amp; Operations workspace for Touch, the home-appliance brand of El-Zenouki Group.
</p>

<p align="center">
  <code>Node.js 20+</code> · <code>TypeScript</code> · <code>Express 5</code> · <code>Dynamics 365 F&amp;O</code> · <code>Read-only</code> · <code>English / العربية</code>
</p>

---

## Contents

- [What it is](#what-it-is)
- [At a glance](#at-a-glance)
- [Feature highlights](#feature-highlights)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Production checklist](#production-checklist)
- [Authentication and users](#authentication-and-users)
- [Configuration](#configuration)
- [Dashboard and analytics](#dashboard-and-analytics)
- [Chat and AI workflow](#chat-and-ai-workflow)
- [QR scanning and phone pairing](#qr-scanning-and-phone-pairing)
- [Local MCP server](#local-mcp-server)
- [HTTP and WebSocket API](#http-and-websocket-api)
- [Data governance and security](#data-governance-and-security)
- [Tests and quality checks](#tests-and-quality-checks)
- [Troubleshooting](#troubleshooting)
- [Development guide](#development-guide)
- [Known limitations](#known-limitations)
- [License and brand](#license-and-brand)

## What it is

Touch El-Zanouki Business Intelligence is the internal application for exploring the Touch business through Microsoft Dynamics 365 Finance & Operations (F&O). It combines four workflows in one workspace:

1. **A live dashboard** with module counts, decision-support views, 35 deterministic breakdowns, and drill-down charts.
2. **A searchable module browser** for customers, vendors, products, orders, journals, invoices, accounts, dimensions, exchange rates, and D365 users.
3. **A conversational AI assistant** that answers business questions only by calling validated, read-only D365 tools and presenting business-readable evidence. Internal entity names, field names and tool telemetry stay server-side.
4. **A QR scanning workflow** that can use the laptop camera directly or pair a phone over the local network and send scanned codes to the laptop.

The application is **read-only against Dynamics 365**. Every ERP request is an OData `GET`; there are no create, update, or delete paths. Local application state — sign-in users, sessions, conversations, metadata cache, pairing sessions, and an optional audit log — may be written to disk or memory. ERP state is never changed.

The assistant is evidence-bound: it may use tool results from the current turn or a labelled prior data snapshot, and it must say when data is missing, stale, zero, truncated, or partial. A bounded sample is never presented as a complete aggregate.

## At a glance

| Area            | Details                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| Runtime         | Node.js 20 LTS or newer, TypeScript 5.9, Express 5                                      |
| Frontend        | Vanilla JavaScript/CSS, bundled locally, no frontend build step                         |
| ERP integration | Dynamics 365 F&O OData v4, client-credentials OAuth, `GET` only                         |
| AI              | Local Ollama model on `127.0.0.1`, native tool calling, no cloud or fallback             |
| Authentication  | Local file-backed users, scrypt hashes, HMAC-signed HttpOnly cookie                     |
| Storage         | JSON file or in-memory store; no external database required                             |
| Dashboard       | 15 modules, 35 breakdowns, 6 featured KPI modules                                       |
| AI tools        | Five legacy inspection tools plus eight deterministic domain tools (sales, inventory, returns, period comparison, metrics) |
| Phone scanning  | QR pairing, authenticated WebSockets, local HTTPS                                       |
| MCP             | Local stdio server exposing the same five read-only tools                               |
| Tests           | Vitest, 21 test files, 335 tests, external services mocked                              |
| License         | ISC, as declared in `package.json`                                                      |

## Feature highlights

- **Read-only by construction.** The D365 client hard-codes `GET`, validates entity-set names, pins pagination to the configured origin and `/data` path, and caps upstream response size.
- **Mandatory sign-in.** Every application page and API route (except the explicitly public routes listed below) requires a valid session. There is no anonymous dashboard.
- **Metadata-first queries.** The assistant and dashboard resolve entities and fields against the live D365 metadata catalog before issuing a query. Unknown properties, disallowed entities, and invalid navigation paths are rejected.
- **35 live breakdowns.** Four decision-support cards focus on sales versus returns; 31 additional cards cover products, customers, vendors, financial transactions, accounts, dimensions, exchange rates, users, and group distribution.
- **Interactive dashboard.** KPI strip, sortable charts, click-to-drill decision cards, module search, pagination, and per-card failure isolation.
- **Bilingual and responsive.** English and Arabic, automatic RTL/LTR direction, light and dark themes, responsive layouts, markdown rendering, chart tooltips, and copy actions.
- **Local-only AI.** A single Ollama model (`d365-local`) runs on the loopback interface. There are no cloud API keys, remote endpoints, or fallback providers. The backend executes only registered read-only tools; the model cannot run arbitrary JS, SQL, shell, or unvalidated OData calls.
- **Progress, not fake streaming.** `POST /api/chat/stream` sends real execution status over SSE, then the final answer once generation completes. It does not stream partial model tokens.
- **Phone pairing without a cloud relay.** A one-time QR token pairs Phone B to the laptop over the local hotspot; scans travel over authenticated WebSockets with replay and acknowledgement.
- **Local MCP integration.** The same read-only tools are available to an MCP client over stdio.
- **Operational visibility.** `GET /api/health` reports D365, metadata, and generic AI availability/counters. No provider names, model IDs, endpoints, or credentials are exposed to the browser.
- **No external database.** Conversations and metadata caches are local JSON files by default; set `CONVERSATION_STORE=memory` for an ephemeral store.

## Architecture

```text
Browser (English / Arabic)
  ├─ /login ──────────────► signed HttpOnly session cookie
  ├─ Dashboard ───────────► /api/dashboard/*
  ├─ Assistant ───────────► /api/chat and /api/chat/stream (SSE)
  └─ Phone B ─────────────► /device-scan/:id + authenticated WebSocket

Express 5 application (src/app.ts)
  ├─ Security headers, request IDs, same-origin guard, rate limits
  ├─ Auth middleware + auth routes + session verification
  ├─ DashboardService ── modules, overview, breakdowns, drill-down, records
  ├─ ChatService ── Agent ── ToolRegistry (read-only domain + inspection tools)
  │                    └─ OllamaProvider ── POST 127.0.0.1:11434/api/chat (tools + JSON fallback)
  ├─ MetadataService ── QueryBuilder ── AnalyticsEngine
  │                    └─ D365Client ── OAuth token cache ── D365 F&O OData
  ├─ DeviceConnectionService ── laptop/mobile WebSockets
  └─ Local MCP stdio server ── same ToolRegistry and runtime

Local state
  ├─ data/conversations.json     (optional file store)
  ├─ data/metadata-*.json        (metadata cache)
  ├─ data/audit.log              (optional JSON-lines audit log)
  └─ in-memory sessions, rate limits, pairing sessions
```

The request path is deliberately narrow:

1. Express applies request IDs, security headers, JSON body limits, the same-origin guard, and session authentication.
2. Dashboard and chat services ask `MetadataService` and `QueryBuilder` to validate every entity, field, filter, sort, expansion, and row limit.
3. `D365Client` adds a cached OAuth token and issues a single `GET` to the configured environment. It retries once after an upstream `401` and validates every pagination link.
4. Deterministic analytics run on the server. The AI model receives bounded tool output and writes the explanation; it never constructs or executes a raw URL.
5. The browser receives source EntitySets, row counts, completion state, tables, and charts alongside the answer.

## Repository layout

| Path                      | Purpose                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`           | Process entry point; creates HTTP or HTTPS server, attaches WebSockets, handles shutdown.                     |
| `src/app.ts`              | Express application, middleware order, all HTTP routes, static files, SSE, and error handling.                |
| `src/config.ts`           | Environment parsing, defaults, validation, D365 scope/token derivation, and warnings.                         |
| `src/runtime.ts`          | Wires configuration, D365, metadata, query, analytics, tools, AI, chat, auth, dashboard, and device services. |
| `src/auth/`               | File-backed users, scrypt password verification, HMAC session tokens, cookie handling.                        |
| `src/http/`               | Auth routes, session middleware, rate limiting, security headers, same-origin guard, request IDs.             |
| `src/d365/`               | OAuth client-credentials token cache and read-only OData client with bounded paging.                          |
| `src/metadata/`           | Service-document and CSDL discovery, XML parsing, searchable catalog, schema, relationships, cache.           |
| `src/query/`              | Query validation, filter parsing/rebuilding, allow/deny policies, parameter limits.                           |
| `src/analytics/`          | Deterministic counts, sums, averages, min/max, group-by, comparison, bounded scans.                           |
| `src/ai/`                 | Local Ollama provider, system prompt, tool registry, agent loop, attachments, status.                          |
| `src/chat/`               | Conversation ownership, file/memory persistence, turn handling, retention.                                    |
| `src/dashboard/`          | Module catalogue, overview cache, 35 breakdown definitions, drill-down, module records/search.                |
| `src/device-connections/` | Pairing sessions, token hashing, scan limits, LAN IP discovery, laptop/mobile WebSockets.                     |
| `src/mcp/`                | Local stdio MCP server backed by the existing read-only tool registry.                                        |
| `public/`                 | Dashboard, assistant, login, mobile scanner, styles, logo, bundled ZXing scanner.                             |
| `scripts/`                | Password hashing, D365/Ollama smoke checks, metadata validation, Windows hotspot/mkcert setup.                |
| `tests/`                  | Vitest suites and fixtures; no live D365 service or AI credentials required.                                  |
| `config/users.json`       | Sample local user directory; replace before deployment.                                                       |
| `data/`                   | Runtime conversation, metadata cache, and optional audit files (git-ignored).                                 |
| `certs/`                  | Local HTTPS certificates created by the hotspot setup script (git-ignored).                                   |
| `integrationMap/`         | Postman collections for D365 authentication, OData, services, and integrations.                               |

Root-level files such as `QUICK_REFERENCE.md`, `ENHANCEMENT_SUMMARY.md`, `IMPLEMENTATION_COMPLETE.md`, and `DATA_ANALYSIS_ENHANCEMENTS.md` are historical implementation notes. This README and the source code are the canonical operational reference.

## Quick start

### Prerequisites

- **Node.js 20 LTS or newer** and npm.
- A **Dynamics 365 F&amp;O environment** and an Entra ID app registration with client credentials.
- **Ollama** running on `127.0.0.1:11434` with the `d365-local` model registered from the included `Modelfile`. No API key or network access is needed.
- Optional: **mkcert** for trusted local HTTPS when using a phone camera.

### 1. Install dependencies

```sh
npm ci
```

### Register the local model (Ollama)

Install and start Ollama, then register the model from the included `Modelfile`. It points at the existing GGUF file on this machine; Ollama stores blobs by content hash, so registering the name does not duplicate the model.

```sh
ollama create d365-local -f Modelfile
npm run smoke:ollama
```

The assistant talks only to `http://127.0.0.1:11434`. Keep Ollama bound to loopback; no inbound network access or API key is required.

### 2. Create the environment file

```sh
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Keep `.env` private. It is excluded from source control.

A minimal development configuration looks like this:

```dotenv
HOST=127.0.0.1
PORT=3000
NODE_ENV=development

D365_BASE_URL=https://your-environment.operations.dynamics.com
D365_TENANT_ID=your-tenant-id
D365_CLIENT_ID=your-client-id
D365_CLIENT_SECRET=your-client-secret

AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=d365-local
OLLAMA_TIMEOUT=120000

SESSION_SECRET=replace-with-at-least-32-random-characters
USERS_FILE=config/users.json
```

Generate a production-grade secret with:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`SESSION_SECRET` is optional in development, where an ephemeral secret is generated and a warning is shown. It is **required in production** and must contain at least 32 characters.

### 3. Create local users

Generate a scrypt hash:

```sh
npm run hash-password -- "a-long-unique-password"
```

Copy the output into `config/users.json` as the user's `passwordHash`:

```json
{
  "users": [
    {
      "username": "admin",
      "displayName": "Administrator",
      "role": "admin",
      "passwordHash": "scrypt$..."
    }
  ]
}
```

The checked-in file contains sample accounts (`admin` and `uitest`). Replace the sample hashes with your own before deployment, or remove the sample users. The server loads this file at startup, so restart after editing it.

### 4. Start the application

Development with TypeScript watch mode:

```sh
npm run dev
```

Open `http://127.0.0.1:3000/` and sign in. If `HOST=0.0.0.0`, use `http://localhost:3000/` or the laptop's LAN address instead.

Production build:

```sh
npm run build
npm start
```

The compatibility launcher `node server.js` loads `dist/server.js`, so it also requires `npm run build` first.

### 5. Verify the installation

1. Sign in and confirm the dashboard KPI strip and module cards load.
2. Open `GET /api/health` and confirm `status` is `ok` or inspect the reported warnings.
3. Refresh metadata if the catalog is empty: `POST /api/metadata/refresh`.
4. Ask the assistant a simple question, such as “How many customers do we have?”
5. Open a module, search for a known record, and confirm pagination and column rendering.

## Production checklist

- [ ] Replace every sample account in `config/users.json` with a unique password hash.
- [ ] Set `NODE_ENV=production`.
- [ ] Set a random `SESSION_SECRET` of at least 32 characters; rotate it to invalidate all sessions.
- [ ] Keep `HOST=127.0.0.1` unless LAN or phone access is required.
- [ ] If exposing the app over a network, terminate TLS at a trusted reverse proxy or configure `HTTPS_KEY_FILE` and `HTTPS_CERT_FILE`.
- [ ] Set `TRUST_PROXY=true` only behind a trusted proxy that overwrites `X-Forwarded-*` headers.
- [ ] Configure D365 entity and field allowlists for the data surface you intend to expose.
- [ ] Review whether every configured AI provider is approved to receive ERP-derived context.
- [ ] Set `AUDIT_LOG_FILE` if audit events must be retained.
- [ ] Back up `data/conversations.json` if conversations are retained, and protect the `data/` directory.
- [ ] Restrict the application port with host firewall rules; never expose it to an untrusted network.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before release.
- [ ] Verify `GET /api/health` reports the expected D365, metadata, and AI state.

## Authentication and users

Authentication is local to the application and is **mandatory**. The application does not use Entra ID SSO for its own users; the D365 integration identity is separate.

### User file schema

`USERS_FILE` defaults to `config/users.json`.

```json
{
  "users": [
    {
      "username": "analyst",
      "displayName": "Business Analyst",
      "role": "analyst",
      "passwordHash": "scrypt$16384$8$1$64$...",
      "disabled": false
    }
  ]
}
```

Rules enforced at startup:

- `users` must be a non-empty array.
- `username` must match `^[A-Za-z0-9._-]{1,64}$` and is normalized to lowercase.
- Usernames must be unique.
- `passwordHash` must start with `scrypt$`.
- `role` must be `admin`, `analyst`, or `viewer`; it defaults to `viewer` if omitted.
- `displayName` defaults to the username.
- `disabled: true` prevents sign-in and removes the user from active lookup.
- The file must be valid JSON and readable by the process.

Passwords are never stored in plaintext and are never exposed through the public user shape. Unknown usernames still run one scrypt verification so response timing does not reveal whether an account exists.

### Roles

Roles are validated, stored, returned by `/api/auth/me`, and displayed in the UI. They are **not currently enforced as authorization boundaries**: any signed-in user can access the same dashboard, modules, chat, and API routes. Treat the role field as descriptive until an authorization layer is added.

### Sessions

- Sessions are stateless HMAC-SHA256 tokens in an `HttpOnly` cookie.
- The default cookie name is `tez_session`; `SameSite=Lax`; `Secure` depends on configuration.
- The default TTL is 8 hours (`SESSION_TTL_MS`), with a minimum of 5 minutes and a maximum of 30 days.
- The session payload contains the username, issued-at time, and expiry; it is verified on every request.
- `SESSION_COOKIE_SECURE` defaults to `true` when `NODE_ENV=production` or when `HTTPS_KEY_FILE` is set.
- Logging out clears the cookie. Because sessions are stateless, a copied token remains valid until its expiry; rotate `SESSION_SECRET` to invalidate every session immediately.
- Changing `config/users.json` requires a restart because the user store is loaded once at startup.

### Login protection

- `LOGIN_RATE_LIMIT_WINDOW_MS` defaults to 15 minutes.
- `LOGIN_RATE_LIMIT_MAX` defaults to 10 attempts per IP per window.
- Login failures and successes are audit events when audit logging is configured.
- The login page supports English/Arabic, light/dark themes, and a safe `next` redirect that only accepts local paths.

### Public versus protected routes

The following are public:

- `GET /api/health`
- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/device-connections/sessions/:id/pair`
- `GET /login`, `GET /login.html`, and the public login assets
- `GET /device-scan/:id`

Every other `/api` route requires a valid session. All other application pages redirect unauthenticated HTML requests to `/login?next=...`; non-HTML requests receive `401 Authentication required`.

Legacy settings `APP_API_KEY` and `APP_TRUST_USER_HEADER` are no longer used for application access. `APP_API_KEY` is ignored, and the app does not trust a client-supplied user header.

## Configuration

Configuration is read from `.env` through `dotenv` and validated by `src/config.ts`. Unknown or unsafe values produce startup warnings or errors. Warnings are visible in `GET /api/health`.

### Server and network

| Variable                   | Default                                          | Description                                                                                                               |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3000`                                           | Listener port, clamped to 1–65535.                                                                                        |
| `HOST`                     | `0.0.0.0` in code; `127.0.0.1` in `.env.example` | Bind address. Use loopback for a single machine; use `0.0.0.0` only for intentional LAN/phone access with firewall rules. |
| `NODE_ENV`                 | `development`                                    | Enables production cookie defaults, static caching, and HSTS.                                                             |
| `LOG_LEVEL`                | `info`                                           | `debug`, `info`, `warn`, or `error`.                                                                                      |
| `TRUST_PROXY`              | `false`                                          | Trust the first proxy hop for client IP and rate limiting. Enable only behind a trusted proxy.                            |
| `REQUEST_BODY_LIMIT`       | `128kb`                                          | Express JSON body limit.                                                                                                  |
| `HTTPS_KEY_FILE`           | unset                                            | PEM private key for direct local HTTPS/WSS. Must be paired with the certificate.                                          |
| `HTTPS_CERT_FILE`          | unset                                            | PEM certificate for direct local HTTPS/WSS. Must be paired with the key.                                                  |
| `DEVICE_CONNECTION_LAN_IP` | auto-detected                                    | Private IPv4 address used in pairing QR codes. Set it when the laptop has multiple adapters.                              |

### Authentication, sessions, and rate limits

| Variable                     | Default                                          | Description                                               |
| ---------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `USERS_FILE`                 | `config/users.json`                              | Local user directory.                                     |
| `SESSION_SECRET`             | ephemeral in development; required in production | HMAC key for session tokens; at least 32 characters.      |
| `SESSION_TTL_MS`             | `28800000` (8 hours)                             | Session lifetime, clamped to 5 minutes–30 days.           |
| `SESSION_COOKIE_NAME`        | `tez_session`                                    | Cookie name; letters, digits, dots, underscores, hyphens. |
| `SESSION_COOKIE_SECURE`      | `true` in production or with HTTPS               | Send the cookie only over HTTPS.                          |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `900000` (15 minutes)                            | Login attempt window.                                     |
| `LOGIN_RATE_LIMIT_MAX`       | `10`                                             | Login attempts per IP per window.                         |
| `RATE_LIMIT_WINDOW_MS`       | `60000`                                          | General API rate-limit window.                            |
| `RATE_LIMIT_MAX`             | `90`                                             | General API requests per user/IP per window.              |
| `RATE_LIMIT_CHAT_MAX`        | `20`                                             | Chat requests per user/IP per window.                     |

Rate limiters are in-process and single-instance. Responses include `X-RateLimit-*` headers and `Retry-After` when limited.

### Dynamics 365 F&amp;O

| Variable                  | Default             | Description                                                                                                                                              |
| ------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `D365_BASE_URL`           | unset               | Environment root, for example `https://<environment>.operations.dynamics.com`. `/data` is appended internally. `D365_URL` is accepted as a legacy alias. |
| `D365_TENANT_ID`          | unset               | Entra ID tenant; used to derive the token endpoint.                                                                                                      |
| `D365_TOKEN_URL`          | derived             | OAuth v2 token endpoint. Leave empty to derive from the tenant.                                                                                          |
| `D365_CLIENT_ID`          | unset               | Entra ID application/client ID.                                                                                                                          |
| `D365_CLIENT_SECRET`      | unset               | Entra ID client secret; backend only.                                                                                                                    |
| `D365_SCOPE`              | derived             | OAuth scope. Defaults to `<D365 origin>/.default`. A mismatched explicit scope produces a warning.                                                       |
| `D365_TOKEN`              | unset               | Legacy static bearer token. Prefer client credentials so tokens refresh automatically.                                                                   |
| `D365_REQUEST_TIMEOUT_MS` | `60000`             | OData and token request timeout, clamped to 1–300 seconds.                                                                                               |
| `D365_PAGE_SIZE`          | `500`               | Page size for bounded scans, clamped to 1–5,000.                                                                                                         |
| `D365_ANALYTICS_MAX_ROWS` | `5000`              | Maximum rows scanned by analytics and searched record queries, clamped to 1–100,000.                                                                     |
| `D365_MAX_RESPONSE_BYTES` | `10485760` (10 MiB) | Maximum size of an individual OData response.                                                                                                            |
| `D365_INCLUDE_COUNT`      | `true`              | Request OData counts where supported.                                                                                                                    |

D365 setup notes:

- Register an application in Entra ID, create a client secret, and grant it access to the D365 F&amp;O environment. In D365, map the application to an application user with the read permissions you intend to grant. The exact role assignment depends on your environment's security model.
- Leave `D365_TOKEN_URL` and `D365_SCOPE` empty unless your tenant requires explicit values.
- The literal placeholder `your-environment.operations.dynamics.com` is detected. If `D365_SCOPE` contains a valid Dynamics origin, the app may infer it and warn; otherwise ERP access is disabled until the real URL is set.
- Tokens are cached with an expiry margin, refreshed automatically, and retried once after a D365 `401`.
- The integration uses **one shared identity**. Application users do not inherit their own D365 permissions; they all see the same ERP surface, subject to entity/field allow/deny policies. Set `D365_DATA_AREA` to scope AI analytics reads to one legal entity; this is not a substitute for per-user ERP security.
- `npm run dev` and `npm start` enable Node's system CA store while keeping TLS verification enabled. If your environment uses a private CA, install it in the OS trust store or set `NODE_EXTRA_CA_CERTS`. Do not disable TLS verification.
- Metadata is loaded from `GET /data` and `GET /data/$metadata`. The cached catalog is scoped to the configured base URL. If D365 is temporarily unavailable, an expired cache may be used as stale and labelled accordingly.

### Metadata and data governance

| Variable                | Default               | Description                                                                                                       |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AI_METADATA_CACHE_TTL` | `86400` seconds       | Metadata cache lifetime.                                                                                          |
| `METADATA_CACHE_DIR`    | `data`                | Directory for the metadata cache.                                                                                 |
| `METADATA_MAX_BYTES`    | `134217728` (128 MiB) | Maximum CSDL metadata document size.                                                                              |
| `D365_ENTITY_ALLOWLIST` | empty                 | Comma-separated entity/type allowlist; `*` wildcard supported. Empty means all discovered entities unless denied. |
| `D365_ENTITY_DENYLIST`  | empty                 | Comma-separated entity/type denylist.                                                                             |
| `D365_FIELD_ALLOWLIST`  | empty                 | Comma-separated field allowlist.                                                                                  |
| `D365_FIELD_DENYLIST`   | empty                 | Comma-separated field denylist.                                                                                   |
| `D365_DATA_AREA`        | empty                 | Optional legal entity (`dataAreaId`) used to scope AI analytics reads. Invalid identifiers are ignored.           |

For production, use explicit allowlists where possible. Denylists are useful for excluding sensitive entities or fields, but an allowlist gives a clearer, smaller data surface.

### Local AI provider (Ollama)

AI inference is local-only. There is exactly one provider, `OllamaProvider`, and it posts to the Ollama daemon on the loopback interface:

```text
POST http://127.0.0.1:11434/api/chat   { model, messages, stream:false, think:false, tools? }
```

No API key, cloud endpoint, or fallback provider exists. Legacy cloud variables (`GROQ_API_KEY`, `GEMINI_API_KEY`, `AI_FALLBACK_PROVIDERS`, `AI_PROVIDER_ORDER`, etc.) are ignored with a startup warning. `AI_PROVIDER` is accepted for compatibility but must be `ollama`.

| Variable                        | Default                 | Description                                                                     |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `AI_PROVIDER`                   | `ollama`                | Informational only; any other value is ignored.                                 |
| `OLLAMA_BASE_URL`               | `http://127.0.0.1:11434` | Loopback-only Ollama endpoint. Non-loopback URLs are rejected at startup.        |
| `OLLAMA_MODEL`                  | `d365-local`            | Registered local model name.                                                     |
| `OLLAMA_MODEL_LABEL`            | `AI assistant`          | Generic label shown in the browser; never a model ID or path.                   |
| `AI_MODEL_REGISTRY`             | `d365-local`            | Local-only model registry; exactly one active model is allowed.                 |
| `AI_ACTIVE_MODEL`               | `d365-local`            | Active registry entry; cloud or unknown entries are rejected at startup.        |
| `OLLAMA_TIMEOUT`                | `120000` ms             | Per-request timeout; times out with an `AI_UNAVAILABLE` error.                   |
| `OLLAMA_TEMPERATURE`            | `0.2`                   | Generation temperature.                                                          |
| `OLLAMA_MAX_COMPLETION_TOKENS`  | `1024`                  | Per-request output cap.                                                          |
| `OLLAMA_NUM_CTX`                | `32768`                 | Context window / KV-cache bound; clamped to 2k–262k.                             |
| `OLLAMA_THINKING`               | `false`                 | Qwen3.5 reasoning is disabled for short, auditable answers.                     |
| `OLLAMA_MAX_PROMPT_CHARS`       | `150000`                | Oversized-prompt protection before any network call.                            |
| `AI_MAX_TURN_COMPLETION_TOKENS` | `4096`                  | Turn-wide generated-token budget, reserving room for a final answer.            |

Tool calling uses Ollama's native `tools` field. If the model returns tool arguments as JSON in the message body, the provider parses them as a fallback. In both paths only registered tool names are accepted; unknown tools are discarded and never executed by the backend. All tool execution remains read-only. ERP questions cannot be answered without at least one successful data lookup; the agent forces another tool turn if the model tries to answer from assumption.

The model is a Qwen3.5 reasoning GGUF. With `OLLAMA_THINKING=false`, think traces are suppressed and clean answers are returned in `message.content`. A cached `/api/tags` probe (10 seconds) powers the generic availability flag in `GET /api/health`; transient network and HTTP 5xx failures are retried once with no cloud fallback.

**Data-sharing note:** prompts and ERP-derived evidence stay on this machine. No configured provider can send them to an external service.

### AI agent limits

| Variable                  | Default | Description                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------------ |
| `AI_MAX_TOOL_ITERATIONS`  | `5`     | Maximum model/tool-loop iterations per turn.                             |
| `AI_MAX_RESULT_ROWS`      | `100`   | Maximum rows returned by a listing tool.                                 |
| `AI_MAX_TOOL_RESULT_ROWS` | `20`    | Maximum rows included in model tool output.                              |
| `AI_MAX_HISTORY_MESSAGES` | `6`     | Conversation messages included as context.                               |
| `AI_MAX_CONTEXT_CHARS`    | `24000` | Context-size budget.                                                     |
| `AI_MAX_SCHEMA_FIELDS`    | `60`    | Default number of schema fields returned to the model.                   |
| `AI_MAX_GROUPS`           | `50`    | Maximum analytics groups.                                                |
| `AI_ENABLE_READ_ONLY`     | `true`  | Setting this to `false` is ignored; the application is always read-only. |

### Conversations and audit

| Variable                      | Default                   | Description                                                                                       |
| ----------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `CONVERSATION_STORE`          | `file`                    | `file` for JSON persistence or `memory` for ephemeral storage.                                    |
| `CONVERSATION_FILE`           | `data/conversations.json` | Conversation store path.                                                                          |
| `CONVERSATION_MAX_PER_USER`   | `100`                     | Maximum conversations retained per user.                                                          |
| `CONVERSATION_MAX_MESSAGES`   | `200`                     | Maximum messages retained per conversation.                                                       |
| `CONVERSATION_RETENTION_DAYS` | `30`                      | Conversation retention period.                                                                    |
| `AUDIT_LOG_FILE`              | unset                     | Optional JSON-lines audit log. Audit metadata is redacted and does not contain ERP record values. |

Conversations are owned by the signed-in user. They are not shared across accounts. The file store is suitable for a single application process; it is not a multi-instance database.

### Device connections

| Variable                                  | Default              | Description                                                                                                       |
| ----------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `DEVICE_CONNECTION_SESSION_TTL_MS`        | `300000` (5 minutes) | Pairing-session lifetime, clamped to 1 minute–1 hour.                                                             |
| `DEVICE_CONNECTION_LAN_IP`                | auto-detected        | Private IPv4 address used in the pairing URL and QR code. Must be private (`10/8`, `172.16/12`, or `192.168/16`). |
| `DEVICE_CONNECTION_MAX_SESSIONS_PER_USER` | `3`                  | Active pairing sessions per user, clamped to 1–10.                                                                |

Additional fixed safety limits:

- Global active pairing sessions: 100.
- Laptop subscribers per session: 3.
- WebSocket message payload: 2.5 KiB; scan payload accepted by the service: 2 KiB.
- Scans per session: 60 per minute.
- Duplicate scan window: 2 seconds.
- Pairing session and event history are in memory and are lost on server restart.

## Dashboard and analytics

### Overview

The dashboard is the default view after sign-in. It shows:

- A KPI strip for the six featured modules: customers, vendors, released products, ledger journals, free text invoices, and system users.
- A **decision support** section with sales-versus-returns and four focused breakdown cards.
- An **analysis** section with 31 additional breakdown cards.
- A module grid with record counts and availability status.
- Refresh, scan, connect-phone, and open-assistant actions.
- Live ERP, AI, and metadata status indicators.

Module counts are cached for **15 seconds**. Use `GET /api/dashboard/overview?refresh=true` to force a refresh. Analysis is recomputed on every request; breakdowns run with bounded concurrency (five at a time), and each card fails independently.

### Module catalogue

There are **15 modules**. Module IDs are used by the UI, the records API, and phone pairing.

| Module ID                   | Title                     | D365 entity set                 | Category     | Scan fields                           |
| --------------------------- | ------------------------- | ------------------------------- | ------------ | ------------------------------------- |
| `customers`                 | Customers                 | `CustomersV3`                   | Sales        | `CustomerAccount`                     |
| `customer-groups`           | Customer groups           | `CustomerGroups`                | Sales        | `CustomerGroupId`                     |
| `vendors`                   | Vendors                   | `VendorsV2`                     | Procurement  | `VendorAccountNumber`                 |
| `vendor-groups`             | Vendor groups             | `VendorGroups`                  | Procurement  | `VendorGroupId`                       |
| `products`                  | Released products         | `ReleasedProductsV2`            | Sales        | `ItemNumber`, `ProductNumber`         |
| `customer-payment-journals` | Customer payment journals | `CustomerPaymentJournalHeaders` | Finance      | `JournalBatchNumber`                  |
| `ledger-journals`           | Ledger journals           | `LedgerJournalHeaders`          | Finance      | `JournalBatchNumber`                  |
| `expense-journals`          | Expense journals          | `ExpenseJournalHeaders`         | Finance      | `JournalBatchNumber`                  |
| `free-text-invoices`        | Free text invoices        | `FreeTextInvoiceHeaders`        | Finance      | `InvoiceIdentifier`, `FreeTextNumber` |
| `sales-orders`              | Sales orders              | `SalesOrderHeadersV4`           | Sales        | `SalesOrderNumber`                    |
| `return-orders`             | Return orders             | `ReturnOrderHeadersV2`          | Sales        | `ReturnOrderNumber`                   |
| `exchange-rates`            | Exchange rates            | `ExchangeRates`                 | Finance      | `FromCurrency`, `ToCurrency`          |
| `main-accounts`             | Main accounts             | `MainAccounts`                  | Finance      | `MainAccountId`                       |
| `financial-dimensions`      | Financial dimensions      | `FinancialDimensionValues`      | Organization | `DimensionValue`                      |
| `system-users`              | System users              | `SystemUsers`                   | Organization | `UserID`                              |

The module catalogue is defined in `src/dashboard/modules.ts`. Field names are checked against live metadata before every query; fields missing from the current catalog are omitted rather than failing the whole request.

### Breakdowns

There are **35 breakdowns**: 4 decision-support cards and 31 analysis cards. Their chart mix is 14 bar charts, 9 donut charts, and 12 column charts.

| Theme                   | Cards | Examples                                                                                                                                                     |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decision support        | 4     | Returns by reason (order value), top customers by returns, return orders by status, sales orders by status.                                                  |
| Products                | 2     | Products by type, products by company.                                                                                                                       |
| Customers               | 4     | Customers by group, currency, hold status, and company.                                                                                                      |
| Vendors                 | 3     | Vendors by group, currency, and company.                                                                                                                     |
| Financial transactions  | 9     | Invoice posting status and top customers; ledger posting, name, and currency; customer payment status and journal name; expense journal status and approver. |
| Accounts and dimensions | 6     | Main account type, currency, suspension; dimension entity, type, suspension.                                                                                 |
| Exchange rates          | 3     | Rate type, from-currency, to-currency.                                                                                                                       |
| System users            | 2     | Users by language and company.                                                                                                                               |
| Group distribution      | 2     | Customer groups and vendor groups by company.                                                                                                                |

<details>
<summary>All 35 breakdown IDs</summary>

- **Decision support:** `returns-by-reason`, `returns-by-customer`, `returns-by-status`, `sales-orders-by-status`
- **Products:** `products-by-type`, `products-by-data-area`
- **Customers:** `customers-by-group`, `customers-by-currency`, `customers-on-hold`, `customers-by-company`
- **Vendors:** `vendors-by-group`, `vendors-by-currency`, `vendors-by-company`
- **Financial transactions:** `invoices-by-status`, `invoices-by-customer`, `ledger-by-posted`, `ledger-by-name`, `ledger-by-currency`, `customer-payments-by-status`, `customer-payments-by-name`, `expense-journals-by-status`, `expense-journals-by-approver`
- **Accounts and dimensions:** `accounts-by-type`, `accounts-by-currency`, `accounts-by-suspension`, `dimensions-by-entity`, `dimensions-by-type`, `dimensions-by-suspension`
- **Exchange rates:** `rates-by-type`, `rates-from-currency`, `rates-to-currency`
- **System users:** `users-by-language`, `users-by-company`
- **Group distribution:** `customer-groups-distribution`, `vendor-groups-distribution`

</details>

Each breakdown returns up to **12 groups**, sorted by count or by an optional aggregate value. `groupCount` reports the number of groups before truncation. `complete` reports whether the bounded scan covered the full filtered result. The sales-versus-returns card counts both sides independently and reports a return rate only when both counts are available and sales are greater than zero.

Drill-down is available on the four decision-support cards. Selecting a group re-queries the entity filtered to that group and grouped by the card's drill field. Drill-down keys are length-limited and converted into a validated filter by the query builder.

### Module records and search

`GET /api/dashboard/modules/:id/records` returns columns, rows, a count, and pagination state.

- `top` defaults to 25 and is capped at 100.
- `skip` is capped at 100,000.
- `search` accepts a single value or multiple values separated by commas, semicolons, pipes, tabs, or new lines.
- `scan=true` (or `1`) searches only the module's scan fields with exact, case-insensitive matching. It requires a search value.
- Typed search is case-insensitive substring matching across the module's scan fields plus its configured search field.
- Scanned URLs also contribute their query values and final path segment, so a QR link can find its record.
- Search is performed by scanning a bounded set of pages and filtering in memory, because the live D365 integration-map entities reject `contains()`/`startswith()` in this deployment. The scan is bounded by `D365_ANALYTICS_MAX_ROWS` (5,000 by default). Matches beyond that window are not returned, and the response's `total` reflects the bounded scan.
- Non-search browsing uses normal OData paging and `$count` where available; `total` may be `null` if D365 does not return a count.

### Failure behavior

- A module whose count fails is marked `unavailable`; the rest of the dashboard still loads.
- A breakdown whose entity or field is unavailable is marked `unavailable`; it does not break the other cards.
- Partial analytics explicitly report `complete: false`.
- Unsupported OData operations fail with an error rather than being converted into a zero result.

## Chat and AI workflow

### How a question is answered

1. The user submits a message, optionally with a conversation ID and a locale (`en` or `ar`).
2. `ChatService` loads the owned conversation, bounded history, and labelled prior data snapshots.
3. The agent sends the prompt to the local model. The model may request only registered read-only tools.
4. Tool names and arguments are validated by the backend. Entity names and fields must exist in the metadata catalog and pass allow/deny policies.
5. `D365Client` executes only `GET` requests. Filters are parsed and re-serialized from a restricted expression grammar; pagination must stay on the configured D365 origin and `/data` path.
6. Analytics are computed deterministically on the server with bounded scans.
7. The model writes the answer from the tool evidence. The browser receives business-readable evidence, tables, metrics, source labels, date ranges, and a partial-data flag when applicable; internal entity, field and tool identifiers stay server-side.

ERP field values and user text are treated as untrusted data. They cannot override system instructions, and the model cannot bypass backend validation.

### Read-only tools

| Tool                 | Purpose                                                                                                 | Key limits                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `searchEntities`     | Search the live metadata catalog by English or Arabic business terms and return actual EntitySet names. | `searchTerm` up to 300 characters; `limit` 1–25, default 5.                                                           |
| `getEntitySchema`    | Inspect fields, keys, and navigation relationships for an entity.                                       | `entityName` up to 200 characters; optional `fieldContains` up to 100 characters; `maxFields` 1–500, default 60.      |
| `queryEntity`        | Run a validated OData query and return rows and columns.                                                | `select` up to 25 fields; filter up to 2,000 characters; `orderBy` up to 10 clauses; row limits enforced server-side. |
| `analyzeData`        | Compute count, sum, average, min, max, group-by, or comparison.                                         | Bounded scans; at most `AI_MAX_GROUPS` groups; partial results are labelled.                                          |
| `getRelatedEntities` | Inspect metadata-backed navigation relationships.                                                       | Relationship limit defaults to 40 and is capped at 100.                                                               |

Tool execution is bounded by a 120-second timeout. Tool output sent to the model is limited to `AI_MAX_TOOL_RESULT_ROWS` (20 by default), while the UI can receive a larger structured attachment.

### Chat API shapes

Request:

```json
{
  "message": "How many customers do we have?",
  "conversationId": "optional-existing-conversation-id",
  "locale": "en"
}
```

Response:

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

`locale` is optional. If supplied, it must be `en` or `ar`; otherwise the assistant follows the question's language.

### Streaming

`POST /api/chat/stream` uses Server-Sent Events:

- `ready` — conversation ID, user message, title, and whether the conversation was created.
- `status` — real agent phases such as understanding, entity search, metadata read, D365 query, analysis, and response preparation.
- `final` — the completed conversation and assistant message.
- `error` — a public error object with a request ID.
- `: ping` — a comment heartbeat every 15 seconds.

The final answer is sent once generation completes. This is **not** token-by-token model streaming. Closing the stream aborts the in-flight generation through an `AbortSignal`.

### Conversations

- Conversations are scoped to the signed-in user.
- The default store is `data/conversations.json`; `memory` keeps them only for the process lifetime.
- Titles are generated from the first message unless supplied.
- The store enforces per-user and per-conversation limits and applies the configured retention period.
- Conversation content may include ERP-derived data. Protect the `data/` directory and any backups accordingly.

## QR scanning and phone pairing

There are two camera workflows:

1. **On-device scanning.** Open a module and choose **Scan a code**. Select a D365 model, start the camera, and scan a barcode or QR code. The code becomes the module search and opens that module's results. On a phone browser, this requires a trusted HTTPS origin; browsers do not grant camera access to an ordinary HTTP LAN address.
2. **Paired phone scanning.** The laptop creates a pairing QR. Phone B scans it, opens the mobile scanner page, and sends subsequent business-code scans to the laptop over an authenticated WebSocket. Each scan opens or updates the selected module's search results.

Camera access is requested only after the user presses the start button. Manual code entry is available when the camera is unavailable or permission is denied.

### Pairing flow

1. Sign in on the laptop over HTTPS.
2. Open **Connect phone** from the dashboard or a module, and select a model that has scan fields.
3. The server creates an in-memory pairing session and returns a QR code and pairing URL.
4. Phone B scans the QR code and opens `/device-scan/:sessionId`.
5. The page exchanges the one-time pairing token for a per-device token, then authenticates the mobile WebSocket.
6. The laptop WebSocket requires the signed-in session cookie and ownership of the session.
7. Scans are acknowledged and replayed across reconnects; duplicates within the 2-second window are rejected.

The pairing URL contains the one-time secret in the URL fragment, which is not sent in the HTTP request line. After pairing, the mobile page removes the fragment from the address bar.

### Local HTTPS setup

Phone camera access and secure WebSockets require a trusted HTTPS certificate. A typical fully local setup uses Phone A as a hotspot for the laptop and Phone B, and [mkcert](https://github.com/FiloSottile/mkcert) on the laptop.

1. Install mkcert on the laptop while internet access is available.
2. Connect the laptop to Phone A's hotspot and find the laptop's private IPv4 address for that adapter.
3. Run the setup script from an elevated PowerShell window:

```powershell
.\scripts\setup-mobile-hotspot.ps1 -LanIp 192.168.137.23
```

Replace the example address with the laptop's actual hotspot IPv4. The script:

- installs mkcert's local CA,
- creates a certificate containing that IP, `localhost`, and `127.0.0.1`,
- writes the certificate and key under `certs/`,
- updates only `HOST`, `HTTPS_KEY_FILE`, `HTTPS_CERT_FILE`, `SESSION_COOKIE_SECURE`, and `DEVICE_CONNECTION_LAN_IP` in `.env`.

Restart the app after running the script. Open `https://<laptop-hotspot-ip>:<PORT>` on the laptop. The pairing QR uses that private IP and the configured port.

Allow the app through the laptop firewall only on the private hotspot network:

```powershell
New-NetFirewallRule -DisplayName "Touch phone scanner hotspot" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 `
  -LocalAddress 192.168.137.23 -RemoteAddress LocalSubnet -Profile Any
```

Remove the rule after use:

```powershell
Remove-NetFirewallRule -DisplayName "Touch phone scanner hotspot"
```

### Certificate trust on Phone B

The script prints mkcert's CA directory. Copy only `rootCA.pem` to Phone B and install/trust it using the phone's certificate settings. Never copy or share `rootCA-key.pem`.

- iOS requires installing the profile and enabling full trust.
- Android and browser trust behavior varies by device policy and browser version.
- If Phone B does not trust the certificate, camera access and secure WebSockets will fail.

### Manual device checklist

1. Enable Phone A's hotspot, connect the laptop and Phone B, and open the app on the laptop using trusted HTTPS.
2. Create a pairing QR on the laptop and scan it with Phone B.
3. Allow camera access and scan two different codes; verify both appear in the selected module.
4. Briefly disconnect and reconnect Phone B, retry a pending scan, and confirm both WebSockets recover without losing the scan.
5. Test denied camera permission and manual code entry.
6. Cancel and expire a session, then confirm its pairing QR and mobile token cannot submit further scans.

### Pairing security and limits

- Pairing requires an HTTPS request; the server rejects session creation over plain HTTP.
- Pairing tokens are random, one-time, and stored as hashes.
- The mobile token is per-device and authenticates only its session.
- Laptop WebSocket authentication uses the session cookie and session ownership.
- WebSocket origins are checked against the request host.
- Sessions expire after five minutes by default and are invalidated by a server restart.
- Scans are bounded by payload size, per-minute rate, duplicate detection, and event-history limits.

## Local MCP server

The project includes a local **Model Context Protocol** server over stdio. It exposes five validated legacy inspection tools from the same read-only registry: `searchEntities`, `getEntitySchema`, `queryEntity`, `analyzeData`, and `getRelatedEntities`.

Configure D365 in `.env`, then add the server to your MCP client configuration. Replace the path with the project location:

```json
{
  "mcpServers": {
    "touch-d365-local": {
      "command": "npm",
      "args": [
        "--silent",
        "--prefix",
        "C:\\path\\to\\this\\project",
        "run",
        "mcp"
      ]
    }
  }
}
```

`npm run mcp` builds the project first, then runs `dist/mcp/local-server.js`. The server:

- uses the same configuration and runtime as the web app,
- registers each tool with read-only annotations (`readOnlyHint: true`, `destructiveHint: false`),
- suppresses normal audit output because stdout is reserved for the protocol stream,
- requires a valid `config/users.json` because the shared runtime loads the user store at startup,
- does not start an HTTP server or require the web application to be running.

## HTTP and WebSocket API

All API responses are JSON unless noted. Send `Content-Type: application/json` for `POST` and `PATCH` bodies. Authenticated API requests rely on the session cookie.

### Public routes

| Method | Path                                        | Purpose                                                        |
| ------ | ------------------------------------------- | -------------------------------------------------------------- |
| `GET`  | `/api/health`                               | Application, D365, metadata, and AI readiness; no credentials. |
| `GET`  | `/api/auth/me`                              | Current session status and public user details.                |
| `POST` | `/api/auth/login`                           | Sign in with `{ "username", "password" }`.                     |
| `POST` | `/api/auth/logout`                          | Clear the session cookie.                                      |
| `POST` | `/api/device-connections/sessions/:id/pair` | Exchange a one-time pairing token for a mobile token.          |

### Authenticated dashboard routes

| Method | Path                                            | Purpose                                                                       |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/api/dashboard/overview`                       | Module counts and availability. `?refresh=true` bypasses the 15-second cache. |
| `GET`  | `/api/dashboard/analysis`                       | All 35 breakdowns plus sales-versus-returns.                                  |
| `GET`  | `/api/dashboard/analysis/:id/drilldown?key=...` | Re-query one drillable decision card group.                                   |
| `GET`  | `/api/dashboard/modules`                        | Module catalogue.                                                             |
| `GET`  | `/api/dashboard/modules/:id/records`            | Records with `search`, `scan`, `top`, and `skip`.                             |

### Authenticated metadata routes

| Method | Path                                             | Purpose                                                                                                          |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/metadata/status`                           | Metadata cache and integration status.                                                                           |
| `GET`  | `/api/metadata/search?q=...&limit=...`           | Search EntitySets and fields. `q` is required, up to 200 characters; `limit` defaults to 10 and is capped at 25. |
| `GET`  | `/api/metadata/entities/:name`                   | Entity schema. Optional `fieldContains` and `maxFields` (default `AI_MAX_SCHEMA_FIELDS`, capped at 500).         |
| `GET`  | `/api/metadata/entities/:name/related?limit=...` | Navigation relationships; limit defaults to 40 and is capped at 100.                                             |
| `POST` | `/api/metadata/refresh`                          | Refresh the local metadata catalog from D365.                                                                    |

### Authenticated conversation and chat routes

| Method   | Path                     | Purpose                                               |
| -------- | ------------------------ | ----------------------------------------------------- |
| `GET`    | `/api/conversations`     | List the signed-in user's conversations.              |
| `POST`   | `/api/conversations`     | Create a conversation; optional `{ "title": "..." }`. |
| `GET`    | `/api/conversations/:id` | Read an owned conversation.                           |
| `PATCH`  | `/api/conversations/:id` | Rename an owned conversation.                         |
| `DELETE` | `/api/conversations/:id` | Delete an owned conversation.                         |
| `POST`   | `/api/chat`              | Submit a question and wait for the final response.    |
| `POST`   | `/api/chat/stream`       | SSE `ready`, `status`, `final`, or `error` events.    |

### Authenticated device routes and WebSockets

| Method   | Path                                                 | Purpose                                                                       |
| -------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `POST`   | `/api/device-connections/sessions`                   | Create a pairing session and QR. Requires HTTPS and a model with scan fields. |
| `GET`    | `/api/device-connections/sessions/:id`               | Read an owned session.                                                        |
| `DELETE` | `/api/device-connections/sessions/:id`               | Cancel an owned session.                                                      |
| `WS`     | `/api/device-connections/sessions/:id/socket`        | Laptop events: status, paired, scan, disconnected, expired, cancelled.        |
| `WS`     | `/api/device-connections/sessions/:id/mobile-socket` | Mobile authentication and scan upload.                                        |

### Legacy route

| Method | Path         | Purpose                                                                                                                                          |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/users` | Legacy read-only D365 `UserODatasCollection` query. Requires a session. New integrations should use metadata discovery and the chat/query tools. |

### Error format

Errors use a consistent shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A human-readable explanation.",
    "details": {},
    "retryAfterSeconds": 30
  }
}
```

`details` and `retryAfterSeconds` are present only when relevant. Every response includes an `X-Request-Id` header; SSE errors also include the request ID in the event payload. Common codes include `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `CONFIGURATION_ERROR`, `METADATA_UNAVAILABLE`, `D365_UPSTREAM_ERROR`, `AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_QUOTA_EXHAUSTED`, and `INTERNAL_ERROR`.

Request bodies are limited by `REQUEST_BODY_LIMIT` (128 KiB by default). Oversized bodies return `413`; malformed JSON returns `400`.

### Static and page routes

- `/login` and `/login.html` serve the login page; authenticated users are redirected to `/`.
- `/device-scan/:id` serves the mobile scanner page for a valid session UUID; no login cookie is required.
- Login assets, shared styles, the logo, and the bundled scanner libraries are publicly available.
- Other HTML requests are redirected to `/login?next=...` when unauthenticated.
- Authenticated deep links such as `/modules/customers` are served the single-page dashboard and resolved client-side.

## Data governance and security

### Read-only guarantees

- `D365Client` hard-codes `method: 'GET'` for every upstream request.
- Entity-set names are validated with a strict identifier pattern.
- Pagination links must use the configured D365 origin and remain under the configured `/data/` path; URLs with credentials, non-HTTPS origins, or arbitrary paths are rejected.
- Upstream response sizes are capped; error messages are reduced to safe first-line messages so stack traces and internal type names do not reach the browser or logs.
- The query builder validates entities, fields, filters, sorts, expansions, and limits against live metadata and policy lists.
- Filter expressions use a restricted tokenizer/parser; raw OData from the model is never forwarded unchanged.
- The application has no D365 write endpoints, and `AI_ENABLE_READ_ONLY=false` is ignored.

### Data-access policy

- `D365_ENTITY_ALLOWLIST` and `D365_FIELD_ALLOWLIST` define the exposed surface. An empty allowlist permits all discovered entities/fields unless denied.
- Denylists support `*` wildcards.
- The integration identity's D365 roles are the ultimate limit on what can be read. Application users share that identity.
- Metadata is discovered from the configured environment, so the catalog reflects the entities that identity can actually see.

### Browser and transport security

- Content Security Policy restricts scripts, styles, images, frames, and connections to the application origin.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, and `Cross-Origin-Resource-Policy` are set.
- HSTS is emitted in production.
- A same-origin guard blocks cross-site state-changing requests. Non-browser clients without `Origin`/`Sec-Fetch-Site` are allowed.
- API responses are marked `Cache-Control: no-store`.
- Request IDs are generated or validated and returned in `X-Request-Id`.
- Session cookies are `HttpOnly` and `SameSite=Lax`; `Secure` is enabled in production or when HTTPS is configured.
- Login attempts and API calls are rate-limited.
- Credentials and provider keys remain server-side and are never sent to the browser.

### Prompt and data safety

- User text and ERP values are explicitly treated as untrusted data in the system prompt.
- Tool calls are validated independently of model output.
- The model is instructed not to invent entities, fields, records, relationships, values, or calculations.
- The UI displays sources and row counts so users can distinguish a complete result from a bounded sample.
- Conversations, metadata caches, and audit logs may contain sensitive business data. Restrict filesystem access and protect backups.

## Tests and quality checks

The automated suite mocks external services and does not require live D365 access or an AI key.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

What the suite covers includes:

- token caching, refresh, retry, and D365 request validation
- CSDL parsing, metadata catalog search, schema, and relationships
- query selection, filter parsing, policy checks, and parameter limits
- bounded pagination and analytics
- agent tool execution, budgets, and failure behavior
- conversation lifecycle and persistence
- dashboard overview, breakdowns, drill-down, and records search
- device pairing, scan limits, and session behavior
- local Ollama request mapping, tool-call validation, error handling, prompt-size limits, and status reporting
- mandatory-login HTTP routes and configuration validation

The repository contains **16 test files** under `tests/`, plus fixtures and helpers.

Optional live smoke checks require a running local Ollama daemon and a configured `.env`; the D365 check additionally requires ERP access:

```sh
npm run smoke:ollama
npm run smoke:d365
```

Run smoke checks only in an authorized environment. A recommended release gate is:

```sh
npm run typecheck && npm run lint && npm test && npm run build
```

## Troubleshooting

| Symptom                                                       | Likely cause                                                                              | Fix                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup fails with “User credentials file was not found”      | `USERS_FILE` is missing or points to the wrong path.                                      | Create `config/users.json` or correct `USERS_FILE`.                                                                                               |
| Startup fails with “SESSION_SECRET is required in production” | Production mode has no secret, or the secret is shorter than 32 characters.               | Generate a 32+ character random secret and set `SESSION_SECRET`.                                                                                  |
| Startup fails with HTTPS file errors                          | Only one of `HTTPS_KEY_FILE` / `HTTPS_CERT_FILE` is set, or the files are unreadable.     | Set both matching PEM files or neither.                                                                                                           |
| `npm start` cannot find the server                            | The project has not been built.                                                           | Run `npm run build` first.                                                                                                                        |
| Login always returns `401`                                    | Wrong password, disabled user, bad hash, or the user file was edited without restarting.  | Regenerate the hash with `npm run hash-password`, verify `disabled`, and restart.                                                                 |
| Signed-in sessions disappear after restart                    | Development mode generated an ephemeral `SESSION_SECRET`.                                 | Set a persistent `SESSION_SECRET`.                                                                                                                |
| Login returns `429`                                           | Login rate limit reached.                                                                 | Wait for the window to reset or raise `LOGIN_RATE_LIMIT_MAX` deliberately.                                                                        |
| `/api/health` reports `degraded`                              | D365, metadata, or AI is not ready.                                                       | Inspect the health payload, configure the missing integration, and refresh metadata.                                                              |
| D365 authentication errors                                    | Wrong tenant, token URL, client ID/secret, or scope.                                      | Verify the Entra app registration, secret expiry, `D365_SCOPE`, and token endpoint.                                                               |
| D365 `403` or missing entities                                | The integration identity lacks D365 roles, or the entity is not published.                | Review the application user's D365 security roles and entity availability.                                                                        |
| Entity or field not found                                     | Metadata is stale or the field is not exposed.                                            | Search current metadata and refresh the catalog.                                                                                                  |
| Search returns no records that exist in D365                  | The bounded in-memory search window was exceeded, or the wrong module/field was used.     | Narrow the search, scan an exact code, or increase `D365_ANALYTICS_MAX_ROWS` within your limits.                                                  |
| Charts show partial data                                      | The analytics scan hit `D365_ANALYTICS_MAX_ROWS`.                                         | Narrow the filter or raise the scan bound after reviewing D365 throttling and memory limits.                                                      |
| AI requests fail with `AI_UNAVAILABLE`                        | Local Ollama daemon or model is unavailable, timed out, or rejected the request.          | Check that Ollama is running on loopback, `d365-local` is registered, and `npm run smoke:ollama` passes.                                         |
| AI answers without ERP evidence                               | The local model did not follow the tool-calling contract.                                 | Run `npm run smoke:ollama`; verify the model supports tools and re-run the six-chat evaluation.                                                  |
| API returns `401`                                             | No valid session cookie.                                                                  | Sign in again. The old `APP_API_KEY` mechanism no longer applies.                                                                                 |
| API returns `403` on a state-changing request                 | Cross-origin request blocked by the same-origin guard.                                    | Use the application origin or a non-browser client without a cross-site `Origin`.                                                                 |
| API returns `413`                                             | Request body exceeds `REQUEST_BODY_LIMIT`.                                                | Reduce the payload or raise the limit deliberately.                                                                                               |
| Phone camera will not start                                   | The page is not a secure context, the certificate is untrusted, or permission was denied. | Use trusted HTTPS, install the mkcert root CA on Phone B, and allow camera access.                                                                |
| Phone cannot load the scanner or reconnects repeatedly        | Wrong hotspot, changed laptop IP, firewall block, or client isolation.                    | Confirm both devices are on the same hotspot, re-run the setup script if the IP changed, allow the port, and disable client isolation on Phone A. |
| WebSocket returns `401` or `403`                              | Laptop session missing, origin mismatch, or expired pairing session.                      | Sign in again, use the same HTTPS origin, and create a fresh pairing QR.                                                                          |
| Metadata appears stale                                        | Cache TTL has not elapsed or D365 was unavailable.                                        | Call `POST /api/metadata/refresh`; inspect `/api/metadata/status`.                                                                                |
| TLS errors reaching D365                                      | The environment certificate chain is not trusted by Node/Windows.                         | Install the issuing CA in the OS trust store or set `NODE_EXTRA_CA_CERTS`; do not disable verification.                                           |

## Development guide

### Add or change a dashboard module

1. Add an entry to `DASHBOARD_MODULES` in `src/dashboard/modules.ts`.
2. Use a real `entitySet`, real field names, key fields, and optional scan/search fields.
3. Mark `featured: true` only if the module should appear in the KPI strip.
4. Add a test for the module ID, field resolution, and records behavior if the change is non-trivial.
5. Verify the module against live metadata with `POST /api/metadata/refresh` and a records request.

### Add a breakdown

1. Add a `BreakdownDefinition` to `BREAKDOWNS` in `src/dashboard/service.ts`.
2. Choose a real entity set and grouping field; set `section: 'decision'` only for decision-support cards.
3. Add `aggregateOperation`/`aggregateField` for value-weighted shares, and `drillGroupByField` if the card should drill down.
4. Confirm that the chart type (`bar`, `donut`, or `column`) matches the shape of the data.
5. Add or update dashboard tests, including an unavailable-entity case.

### Add a read-only AI tool

1. Add a `RegisteredTool` in `src/ai/tools.ts` with a JSON-schema argument definition and a backend implementation.
2. Validate every argument and resolve entities/properties through `MetadataService` and `QueryBuilder`.
3. Never accept arbitrary URLs, raw OData paths, HTTP methods, or write operations.
4. Return structured content and record source metadata through the existing attachment collector.
5. Keep ERP values out of logs.
6. Register the tool in `createTools()` and describe its intended use in the system prompt only when appropriate.
7. Add mocked tests for valid, invalid, disallowed, timeout, and failure cases.

### Change the local AI provider

- The only inference provider is `OllamaProvider` in `src/ai/ollama.ts`; it is instantiated in `createRuntime`.
- Keep all requests on the loopback endpoint, preserve the system prompt and history, and bound prompt size/context.
- Only registered tool names may pass to the backend executor; keep tool execution read-only.
- Add mocked tests for request mapping, error mapping, native and JSON tool calls, and status reporting.
- Never expose provider names, model identifiers, endpoints, or keys to the frontend.

### Change the UI

- Dashboard, chat, login, and mobile scanner assets live in `public/`.
- The frontend has no bundler; keep scripts compatible with the existing browser targets.
- Add new user-facing strings to both the English and Arabic dictionaries.
- Preserve RTL/LTR behavior and the existing CSP constraints: no inline scripts or external CDNs.
- Test light/dark themes, keyboard navigation, and mobile layouts.

### Code conventions

- TypeScript is strict (`tsconfig.json`).
- The server targets ES2022 and compiles to CommonJS.
- ESLint covers TypeScript files; `public/` is intentionally excluded from linting.
- Keep network calls bounded, validate inputs at the boundary, and avoid logging secrets or ERP record values.

## Known limitations

- **Shared D365 identity.** The integration uses client credentials for one application identity. Per-user D365 authorization and delegated OAuth are not implemented. Application roles are descriptive, not enforced.
- **Single-process design.** Rate limits, pairing sessions, WebSocket state, and some caches are in memory. The conversation store is a local JSON file. There is no built-in multi-instance coordination or external database.
- **Stateless sessions.** Logout clears the cookie, but a copied session token remains valid until expiry. Rotate `SESSION_SECRET` to invalidate all sessions.
- **Bounded search.** Module search scans up to `D365_ANALYTICS_MAX_ROWS` and filters in memory because live D365 rejects `contains()`/`startswith()` on these integration-map entities. Records outside the scan window are not found.
- **Bounded analytics.** Breakdowns and AI aggregates may be partial. `complete: false` and partial-result labels are intentional, not errors.
- **Static dashboard catalogue.** The 15 modules and 35 breakdowns are mapped to specific entity/field names. D365 schema or entity changes may require code updates, although missing fields are tolerated at query time.
- **OData capability differences.** D365 services vary in their support for counts, filters, expansions, and sorting. Unsupported operations fail explicitly rather than returning fabricated zeroes.
- **AI variability.** Local model quality and tool-calling reliability can vary with the GGUF build and hardware. Verify the registered model with the smoke test and the six-chat evaluation before deployment.
- **No token streaming.** The assistant streams execution status and the final result, not partial model text.
- **Phone workflow constraints.** Pairing needs local HTTPS, a trusted certificate on Phone B, and a network path between the laptop and phone. Some hotspot firmware blocks client-to-client traffic. There is no cloud relay, tunnel, or Bluetooth fallback.
- **Not an SSO product.** Authentication is local to this application. There is no OIDC/SAML integration, self-service password reset, or user administration UI.
- **No Docker or deployment manifests.** The project runs directly with Node.js; containerization and orchestration are left to the operator.
- **Historical documentation.** Root-level summary Markdown files may lag behind the implementation; use this README and the code as the source of truth.

## License and brand

The project is licensed under the **ISC License**, as declared in `package.json`. Add a `LICENSE` file before redistributing the project if your distribution requires one.

The Touch name, logo, and brand assets belong to El-Zenouki Group. They are included for this internal business application and are not licensed for unrelated redistribution.

Brand references:

- [Touch official site](https://touchelzenouki.com/)
- [Touch story, mission and vision](https://touchelzenouki.com/about-us/)
- [El-Zenouki Group](https://elzenouki.com/about-us/)

The UI palette uses the public Touch site's coral, charcoal, and sage-green accents, with darker interactive shades for readable contrast. The Touch wordmark is bundled locally in `public/touch-logo.png`.

---

**Security reminder:** this application can expose business data from Dynamics 365. Treat the `.env` file, `config/users.json`, `data/`, `certs/`, and any provider keys as sensitive. Restrict network access, use trusted HTTPS, keep dependencies patched, and review provider data-processing terms before enabling an AI endpoint.
