# Local-Only D365 F&O AI Assistant — Implementation and Live Verification Report

## 1. Scope and outcome

This report covers the deterministic, grounded ERP assistant work completed in this workspace. The critical supplier-list defect is fixed and verified against the real D365 F&O environment: the exact Arabic question `اريد قائمة بالموردين` now discovers the verified supplier master source, executes a real OData GET, retrieves 49 supplier records, and renders them as a business table in the chat payload.

No cloud inference provider was used or restored. All inference stays on the local Ollama model `d365-local`. ERP access remains read-only.

## 2. Architecture

```text
Browser (native HTML/CSS/JS)
  → Express routes + session auth
  → ChatService (public sanitization, conversation persistence)
  → Agent (deterministic intent routing, forced evidence, bounded tool loop)
  → ToolRegistry (controlled, read-only tools with strict schemas)
  → MetadataService + MetadataCatalog + business resolver
        primary source: data/metadata-cache.json (4,749 entity sets)
  → QueryBuilder / QueryFilter (entity, field, filter, $select/$top/$orderby validation)
  → D365Client (OAuth token, OData GET, paging, response-size limits, structured errors)
  → Public chat message (business tables, business source labels, partial-data flag)

Inference path:
  Agent → OllamaProvider → local Ollama (`d365-local`) → native tool calls / structured tool fallback
```

Key design boundary: full technical evidence (entity set, fields, OData URL, HTTP status, counts, errors) stays server-side for audit and follow-ups. The browser receives only business-readable rows, labels, notes, and a partial-data flag.

## 3. Root causes found

1. **Arabic prefix normalization failure.** `بالموردين` was not reduced to `الموردين` / `موردين`. Both the business resolver and catalog tokenizer stripped a leading `ال` only, so `اريد قائمة بالموردين` produced no business signal and no catalog candidates.
2. **Supplier master field vocabulary mismatch.** The AI vocabulary expected `VendAccount` / `VendName`, while live metadata exposes `VendorAccountNumber`, `VendorOrganizationName`, `VendorName`, `VendorSearchName`, and `VendorsForAI`. Supplier master entities were therefore demoted and invoice/transaction entities were selected.
3. **Wrong entity for list questions.** Ranking logic preferred measurable fact tables. A plain “list all suppliers” question selected invoice lines/headers rather than master data, which returned zero rows and was presented as a genuine zero-record result.
4. **No clean list mode.** The existing record-search tool required a `searchTerm` and built `contains(...)` filters. A list question must read master records without inventing a name filter.
5. **Zero-result semantics were too strong.** A zero-row result from a possibly inappropriate source was labelled “real zero-result, not a failed request”.
6. **Diagnostics gaps.** Failure logs did not include the redacted OData URL, selected fields, status, row count, or page trail; tool failure audits omitted entity/fields/status.
7. **Duplicate browser tables.** A deterministic pre-load and a model-initiated retry could publish the same attachment and data context twice.
8. **Model over-inference.** The local model inferred activity/commercial status from supplier names and over-generalised top-N inventory results to the whole population.
9. **Named product lines were treated as plain lists.** A question about a named product line could call the unfiltered master-list tool and then invent a count from unrelated records.
10. **Period comparison had no historical fallback.** Empty 2026 periods were reported as a genuine no-record result even though older recorded periods existed.
11. **Model follow-up requests contradicted the evidence.** After historical fallback, the model still asked the user to check settings or provide a different period.
12. **Single-period history was not handled.** All recorded return rows share one date, so a two-period comparison was impossible; the tool still returned an empty comparison instead of the verified recorded totals.
13. **Named-product search used a fact entity.** A "Touch products" search scanned invoice lines rather than the product master, producing zero matches and letting the model fall back to an unfiltered list.
14. **Top-N inventory rows were generalised.** The model described only the shown zero-stock rows as if all 98 reviewed products had zero stock, then concluded no low-stock products existed.

## 4. Files changed for this phase

- `src/metadata/business.ts` — Arabic clitic stripping, supplier/customer field vocabularies, list-noise terms, substring-aware term matching.
- `src/metadata/catalog.ts` — Arabic clitic normalization, `بالموردين` synonyms, list-noise stopwords.
- `src/ai/tools.ts` — supplier/customer field detection, `DomainFields`, `resolveListEntity`, new `list_business_records` tool, request diagnostics, no-filter list mode, company-scoped diagnostics.
- `src/ai/intent.ts` — deterministic `detectListIntent` for plain list questions and `detectNamedSearchIntent` for named product lines.
- `src/ai/agent.ts` — forced master-data read for plain list questions, forced record search for named product lines, hides the list tool during named searches, and deterministic answer guards for partial/historical fallback and top-N claims.
- `src/ai/status.ts` — status mapping for `list_business_records`.
- `src/ai/business.ts` — business labels for supplier/customer fields, sanitized evidence for the new list tool, safer missing-source error classification.
- `src/ai/attachments.ts` — deduplication of identical tables and data-context entries.
- `src/ai/prompt.ts` — no inference of status from names, no all-population claims from top-N, no requests for a different period or IT checks when historical fallback is used, named-product searches only, historical comparison disclosure.
- `src/chat/service.ts` — public source names for supplier/customer lists and public notes for zero/partial list results.
- `src/d365/client.ts` — redacted OData request/status/row/page diagnostics and request trail on paged scans.
- `tests/business-discovery.test.ts`, `tests/metadata-catalog.test.ts`, `tests/domain-tools.test.ts`, `tests/intent.test.ts`, `tests/agent.test.ts` — regressions for the exact Arabic question, supplier master fields, list routing, named-product routing, historical period-comparison fallback, partial-data notices, answer guards, master-entity preference, failed-request distinction, and table deduplication.
- `scripts/eval-record-retrieval.ts` — live harness exercising the real `ChatService` path and capturing the exact public chat payload.

Earlier phases in the same uncommitted work also added `src/ai/ollama.ts`, `src/ai/business.ts`, `src/ai/intent.ts`, `src/analytics/metrics.ts`, `src/metadata/business.ts`, `Modelfile`, smoke/eval scripts, and removed cloud fallback files (`src/ai/groq.ts`, `src/ai/fallback.ts` and their tests). No commit, push, PR, or deployment was made.

## 5. Improvements delivered

### Metadata and discovery
- `data/metadata-cache.json` remains the primary metadata source; no parallel metadata system was introduced.
- Arabic clitics `بـ / ل لـ / كـ / فـ / وـ` are stripped before the definite article, so `بالموردين`, `الموردين`, and `موردين` resolve to the same concept.
- Master-entity resolution now combines business signals with catalog search over ordinary and Arabic domain names, then scores for identity + readable name and penalizes invoice/order/transaction entities.
- Verified live supplier source: `VendorsForAI` with `VendorAccountNumber`, `VendorOrganizationName`, `VendorSearchName`.
- Verified live customer source: `DemandPlanningCustomerAccounts` with `CustomerAccount`, `NameAlias`.

### Controlled tools
Registered tools are: `search_erp_entities`, `get_entity_metadata`, `search_erp_records`, `list_business_records`, `get_sales_summary`, `get_inventory_summary`, `get_returns_summary`, `compare_business_periods`, `analyze_business_metrics`.

Cross-cutting controls: strict JSON schemas and argument validation; entity/field allowlists; `$select`, `$filter`, `$orderby`, `$top`, bounded `$skip`, controlled `$expand`; bounded pagination and maximum rows; timeouts (`TOOL_TIMEOUT_MS=120000`); bounded retries only for transient failures; response-size limits; secret-safe structured errors; cancellation; per-user conversation isolation; optional `D365_DATA_AREA` legal-entity scoping; deterministic metrics instead of model arithmetic.

`list_business_records` is the new no-filter path for “list all suppliers/customers/products”. It requires a verified identity field and a verified name field, never invents a search term, and explicitly distinguishes a genuine zero-record result from a failed or bounded/partial read. Named product lines are routed to `search_erp_records` with the business term instead, so an unfiltered master list can no longer be used to invent a matching-product count.

### Diagnostics
Server-side logs and tool results now include selected entity set, selected fields, redacted OData URL, HTTP status, returned row count, pages, completion flag, and rejected-request details. These values are available in `data/eval-record-retrieval*.json`; they are not exposed in the user-facing answer.

### Analytics
- Deterministic ranking, contribution percentages, growth/decrease comparisons, return-magnitude ranking, and low-stock ranking are computed in code.
- Recent-period zero results fall back to all recorded history with an explicit business warning; the model must state the period actually covered.
- Period comparison falls back to the two most recent recorded periods when requested periods are empty, and reports the actual compared periods. If all history falls in one period, it reports verified product totals instead of inventing a trend.
- Server-filter rejection falls back to a bounded local scan and is always marked partial.
- Top-N evidence is never described as the full population.
- A deterministic answer guard removes "check settings/provide another period" follow-ups after fallback evidence and appends a business-language statement of what the figures cover.

### Local-only model configuration
- `AI_PROVIDER=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `OLLAMA_MODEL=d365-local`
- Local model file: `Modelfile` using `Qwen3.5-4B-Q4_K_M.gguf`
- `OLLAMA_MODEL_LABEL=AI assistant`
- `think:false`, `stream:false`, `num_ctx=32768`
- No cloud provider, no cloud fallback, no auto-download.

### Security and public_output boundary
- Read-only ERP access; no write/update/delete operations.
- Tool errors never become empty datasets.
- Credentials, tokens, endpoints, provider/model names, tool names, entity names, field names, OData details, and JSON are kept out of user-facing chat answers and status text.
- Public attachments keep verified business rows but strip technical entity identifiers and sanitize titles/columns.
- Public sources are renamed to business labels such as “Supplier records” and “Customer records”.

## 6. Tests executed and results

Static/automated gate after the final source edits:

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS |
| Unit/integration tests | `npm test -- --run` | PASS — 21 files, 346 tests |
| Build | `npm run build` | PASS |
| Local model smoke | `npm run smoke:ollama` | PASS (earlier in this session) |
| D365 auth/OData smoke | `node --use-system-ca --import tsx scripts/smoke-d365.ts` | PASS (earlier: OAuth + service document, 4,749 entity sets) |

Targeted regression tests include:
- `detectBusinessSignals("اريد قائمة بالموردين")` returns the `suppliers` domain.
- `catalog.search("اريد قائمة بالموردين")` finds real vendor master entities.
- The checked-in metadata cache resolves `بالموردين` to vendor master candidates.
- `list_business_records` selects a master entity, not an invoice entity, and applies no name filter.
- Failed requests are errors; genuine zero results are explicitly labelled.
- Repeated identical tables/data contexts are published once.
- A named product descriptor routes to record search rather than an unfiltered list.
- Empty requested periods in a comparison fall back to the two most recent recorded periods.
- Historical/partial fallback answers receive an explicit business-language notice and no longer ask the user to change periods or check configuration.
- A comparison with only one recorded period reports verified product totals and states that no earlier/later increase can be determined.
- Named-product searches use the product master and cannot fall back to an unfiltered list tool.
- Top-N inventory answers cannot claim that all reviewed products share the shown zero-stock value.

### Live record retrieval (mandatory supplier test)

Command:

```sh
node --use-system-ca --import tsx scripts/eval-record-retrieval.ts Suppliers
```

Evidence file: `data/eval-record-retrieval-suppliers-final.json`.

Verified facts:
- Question: `اريد قائمة بالموردين`
- Entity set discovered from metadata: `VendorsForAI`
- Fields: `VendorAccountNumber`, `VendorOrganizationName`, `VendorSearchName`
- Real OData GET: HTTP 200, 49 rows, 1 page, `complete: true`
- Public answer: “هذه قائمة الموردين المسجلين في النظام (49 مورد)” followed by real supplier names.
- Attachment: one table with 49 verified rows; no duplicate table.
- No “no data found” wording, no technical identifiers in the answer, and no unsupported activity/status inference.
- Previous failed source (`VendorInvoiceHeaders` / `PurchaseOrderLineV2ExistAddrReadOnly`) was not selected.

### Live additional entity test

Command:

```sh
node --use-system-ca --import tsx scripts/eval-record-retrieval.ts Customers
```

Evidence file: `data/eval-record-retrieval-customers.json`.

Verified facts:
- Question: `Show me the customer list`
- Entity set discovered from metadata: `DemandPlanningCustomerAccounts`
- Fields: `CustomerAccount`, `NameAlias`
- Real OData GET: HTTP 200, 417 total matches, 50 displayed rows, 1 page, `complete: true`
- Public answer and attachment contain real customer names and accounts.

A static local-cache check also confirms product list discovery; a separate live product-list retrieval was not run in this final pass.

## 7. Required six-chat evaluation

Command:

```sh
node --use-system-ca --import tsx scripts/eval-six-chats.ts
```

Evidence file: `data/eval-six-chats.json`.

The final re-run is in progress; the PASS/FAIL table below will be finalized from that evidence. Earlier runs showed grounded retrieval but also model wording defects (partial-period disclosure, top-N generalization, and period clarification requests); prompt rules for those defects were added before this final re-run.

| Test | Result | ERP Data Retrieved | Calculation Verified |
|---|---|---|---|
| HDMI Sales | PENDING | PENDING | PENDING |
| Most Returned Product | PENDING | PENDING | PENDING |
| Touch Products | PENDING | PENDING | PENDING |
| Top 10 Products | PENDING | PENDING | PENDING |
| Return Trends | PENDING | PENDING | PENDING |
| Low Inventory | PENDING | PENDING | PENDING |

## 8. Exact run instructions

```sh
# 1. Install dependencies
npm ci

# 2. Configure environment from the template, then fill in D365 values
cp .env.example .env

# 3. Register the local model with Ollama and smoke-test it
ollama create d365-local -f Modelfile
npm run smoke:ollama

# 4. Smoke-test D365 OAuth + metadata access (system CA is required here)
node --use-system-ca --import tsx scripts/smoke-d365.ts

# 5. Start the application
npm run dev      # development
# or
npm run build
npm start        # production

# 6. Live evidence commands
node --use-system-ca --import tsx scripts/eval-record-retrieval.ts Suppliers
node --use-system-ca --import tsx scripts/eval-record-retrieval.ts Customers
node --use-system-ca --import tsx scripts/eval-six-chats.ts
```

On this machine, D365 TLS requires `node --use-system-ca`; the npm dev/start scripts already enable it. Keep TLS verification enabled. If a private CA is used, install it in the OS trust store or set `NODE_EXTRA_CA_CERTS`.

## 9. Not executed / limitations

- No commit, push, pull request, or deployment was made.
- No cloud fallback was tested because it was intentionally removed.
- No manual browser click-through/screenshot was performed; browser rendering was verified from the public payload shape and `public/app.js` attachment/source rendering code.
- Demo D365 sales/returns data is historical (mainly 2016–2018). Recent 2025/2026 periods legitimately return zero rows; the assistant must state the period actually covered.
- Bounded scans cap analytics at the configured maximum rows (5,000 in the evaluated runs), so some analytics results are explicitly partial.
- `D365_DATA_AREA` is not configured in this environment; company scoping was not the cause of the supplier defect. When configured, an entity lacking `dataAreaId` is refused rather than silently unscoped.
- Local-model turns are slow in this environment (roughly 5 minutes for the evaluated list turns); this does not affect correctness but affects interactive latency.
