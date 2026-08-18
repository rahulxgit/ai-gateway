# AI Gateway — Project Overview

> **Purpose:** source-of-truth architecture and operational notes for future development sessions. Keep this file synchronized when architecture, environment behavior, provider behavior, or important hardening patterns change.

---

## What this is

AI Gateway is a multi-LLM chat gateway with one HTTP API in front of 23 provider adapters. The backend runs as an Express/TypeScript service with SQLite persistence and an optional Redis L2 cache. A React frontend is deployed separately.

- **Repository:** https://github.com/rahulxgit/ai-gateway
- **Frontend:** https://ai-gateway-alpha.vercel.app/
- **Backend:** https://ai-gateway-wx35.onrender.com

---

## Core architecture

```text
Client
  ↓
Express API / middleware
  ↓
Orchestrator
  ↓
Router / failover engine
  ↓
Provider adapters
  ↓
SQLite persistence
```

Optional cache path:

```text
L1 in-process cache
      ↓ miss
L2 Redis
      ↓ miss / Redis unavailable
SQLite or provider operation
```

The hard architectural boundary is:

```text
router → orchestrator → provider adapters → SQLite
```

Hardening changes should not replace this architecture or change the frontend/API contract without an explicit design decision.

---

## Folder map

```text
src/
  config/
    env.ts                  environment variables and defaults
    routing.ts              provider order, task routing, pricing
  controllers/              HTTP controllers
  database/                 SQLite client, schema, migration
  middleware/
    index.ts                request IDs, validation, rate limits, errors
    body-limit.ts           2 MB normal JSON / 50 MB chat JSON parsers
  providers/
    registry.ts             provider registry / source of truth
    *.adapter.ts            provider implementations
  routes/                   Express route registration
  services/
    router.service.ts       provider selection, retry, failover, deadline
    orchestrator.service.ts context injection and cost budget
    analytics.service.ts    usage/cost analytics and cache
    model-validation.service.ts model catalog/availability cache
    health.service.ts       provider health state, status taxonomy, cooldowns
    health-check.service.ts active background health probing (startup + interval)
    conversation.service.ts sessions/messages
    project-memory.service.ts projects and persistent context
    workspace.service.ts    file versions, undo, snapshots
    upload.service.ts       document/image extraction
  types/                    shared TypeScript types
  utils/
    logger.ts               Winston logging
    redis-cache.ts          optional Redis cache
    graceful-shutdown.ts   HTTP/Redis/SQLite shutdown flow
  __tests__/                Jest tests
frontend/
  React dashboard and API client
```

---

## Provider registry

There are 23 providers in the current registry:

1. OpenAI
2. Gemini
3. Anthropic
4. Groq
5. Together AI
6. OpenRouter
7. Hugging Face
8. DeepSeek
9. Kimi / Moonshot AI
10. Cerebras
11. Mistral
12. Cloudflare Workers AI
13. Fireworks AI
14. Inference.net
15. Nebius AI Studio
16. SambaNova Cloud
17. NVIDIA NIM
18. Novita AI
19. Baseten
20. ModelScope
21. AI/ML API
22. GitHub Models (free, no card, recurring daily quota — currently excluded from automatic routing, see note below; no key configured yet)
23. Cohere (free, no card, recurring monthly quota)

Use `src/providers/registry.ts` and `src/config/routing.ts` as the source of truth for provider registration and routing order. Do not maintain a separate hand-written provider list in middleware or API code.

**Free vs. paid automatic routing (added 2026-08-18):** `src/config/routing.ts` exports `FREE_AUTO_PROVIDERS` and `PAID_AUTO_PROVIDERS` as two disjoint pools. Automatic routing (`buildAutoProviderOrder`) defaults to the free pool only — this is the gateway's historical behavior and remains the default. A per-request `ChatRequest.freeOnly: false` opts a single request into also trying the paid pool, cheapest-first, strictly *after* every free provider has been attempted and failed — never instead of. `forceProvider` is unaffected either way; it pins exactly one provider regardless of free/paid status. `GET /providers` reports the current `freeModels`/`paidModels` split for configured providers.

**GitHub Models exclusion:** `githubmodels` is registered and priced as free, but is currently excluded from `FREE_AUTO_PROVIDERS` — a live provider audit (2026-08-18) found no `GITHUB_MODELS_API_KEY` configured in production, meaning it was a silent dead entry in every candidate order. Re-add it to `FREE_AUTO_PROVIDERS` (and the matching entries in `TASK_ROUTING`) once a real key is verified working; `src/__tests__/failover-no-dead-ends.test.ts` will fail the "every registered provider is reachable" check if a provider is ever left out of both pools without being added to that test's `knownExclusions` list, so update both together.

Vision routing currently restricts image-bearing requests to configured vision-capable providers.

---

## Important runtime configuration

`.env.example` is the canonical environment template.

| Variable | Default | Purpose |
|---|---:|---|
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | `./data/gateway.db` | SQLite path |
| `CORS_ORIGIN` | `*` | Allowed origin(s), comma-separated |
| `LOG_LEVEL` | `info` | Logger level |
| `REQUEST_TIMEOUT_MS` | `30000` | Per-request/provider timeout |
| `GATEWAY_REQUEST_BUDGET_MS` | `60000` | Total failover-chain wall-clock budget |
| `MAX_RETRIES` | `2` | Retryable provider retries |
| `MAX_PROMPT_LENGTH` | `3500000` | Prompt character limit |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `RATE_LIMIT_MAX` | `60` | Strict chat/default API rate limit |
| `DAILY_COST_BUDGET_USD` | `0` | Rolling 24h estimated spend guard; 0 disables |
| `CACHE_ENABLED` | `false` | Enable Redis L2 |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL |
| `REDIS_URL` | empty | Redis-compatible connection URL |

At least one provider API key is required for useful inference traffic. Cloudflare Workers AI requires both `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID`.

---

## Current hardening patterns

### 1. Global request deadline

`router.service.ts` applies `GATEWAY_REQUEST_BUDGET_MS` across the complete provider failover chain. Individual provider timeouts do not reset the global budget.

### 2. Retry/failover classification

`ProviderError.retryable` distinguishes transient failures from failures that should not retry the same provider. `AUTH_ERROR`, `NOT_FOUND`, `ACCOUNT_SUSPENDED`, and `INSUFFICIENT_CREDITS` are non-retryable for the same provider, while router failover to another provider remains possible.

`base.adapter.ts`'s billing-vs-auth classification is regex-based against the provider's error message text — it was found (2026-08-18) to miss "run out of funds"/"top up your balance" phrasing (aimlapi), which misclassified a billing issue as `AUTH_ERROR`. The regex was broadened; if a new provider's billing error message doesn't match `INSUFFICIENT_CREDITS`, check `classifyError()`'s regex first before assuming the key itself is bad.

### 3. Rolling 24-hour cost guard

`orchestrator.service.ts` checks the live 24-hour estimated spend before chat execution when `DAILY_COST_BUDGET_USD` is positive. Exceeding the budget returns HTTP `429`.

### 4. Rate-limit split

- `GET /health` and `GET /providers`: generous read limiter, 300 requests/window.
- `POST /chat` and `POST /chat/stream`: stricter chat limiter using `RATE_LIMIT_MAX`.
- Other API routes: normal limiter using `RATE_LIMIT_MAX`.

### 5. Health status taxonomy and active probing

`health.service.ts` classifies every provider into one of 9 statuses — `configured` (has a key, never checked yet), `healthy`, `degraded`, `rate_limited`, `auth_error`, `model_unavailable`, `billing_required`, `retired`, or `unknown` (no key configured at all) — derived from the exact same `ProviderErrorCode` that real routed traffic already produces via `classifyError()`. A billing failure detected from a live chat request and one detected from a background probe both land on `billing_required` identically.

`health-check.service.ts` runs an active liveness probe (`adapter.probeHealth()` — a `GET /models` call, no completion tokens spent) on server startup (staggered 250ms apart, non-blocking — doesn't delay `server.listen()`) and on a recurring 5-minute interval afterward, so health status stays current even with zero chat traffic. A provider already confirmed fresh by real traffic within the last ~4.5 minutes is skipped on that tick rather than redundantly re-probed. `/health/models` and `checkModelAvailability()` remain a separate, coarser existence check; `probeHealth()` is the one that actually updates `/health`'s status.

Each `ProviderHealth` entry also reports `lastCheckSource: 'traffic' | 'probe'` so it's possible to tell whether a given "healthy" reading came from a real user request or from the idle background prober.

### 6. Cooldown circuit-breaker with a probe-anyway fallback

Non-self-healing statuses (`rate_limited`, `auth_error`, `billing_required`, `model_unavailable`, `retired`) apply a cooldown so `isLikelyHealthy()` excludes them from `candidateOrder()` for a bounded window (5-30 min depending on the status) rather than retrying a known-bad provider on every request.

**Known failure mode this guards against:** health cooldowns are a heuristic (last known state), not a guarantee — a rate limit can lift, a quota can reset, a transient error can clear, all before the cooldown timer expires. If a correlated burst of failures happened to put every eligible provider into cooldown simultaneously, `candidateOrder()` would return `[]` and the gateway would fail immediately for up to 30 minutes even though a provider might have already recovered — a genuine dead end (fixed 2026-08-18, see `router.service.ts`'s `candidateOrder`). The fix: when health filtering would eliminate every eligible candidate, the router probes the full eligible set for real instead of failing synthetically. `src/__tests__/failover-no-dead-ends.test.ts` covers this along with structural coverage (every registered provider reachable via `FREE_AUTO_PROVIDERS`/`PAID_AUTO_PROVIDERS`/a documented exclusion, no `TASK_ROUTING` entry drifting from `FREE_AUTO_PROVIDERS`).

### 7. Correlation IDs

Every HTTP request gets a UUID in `X-Request-ID`. The ID is propagated into relevant router, orchestrator, health, and error logging.

### 8. Production logging

Production logging uses Winston console output rather than depending on persistent log files. This matches container/Render-style deployment where application filesystem logs are not the operational source of truth.

### 9. Graceful shutdown

`SIGTERM`/`SIGINT`:

```text
signal
  ↓
stop accepting new HTTP work
  ↓
drain active requests
  ↓
close Redis if enabled
  ↓
close SQLite
```

The shutdown path has a bounded fallback for stuck connections.

### 10. Redis L2 cache

Analytics and model-validation caches support an optional shared Redis L2. Existing in-process caching remains the fast L1 path and fallback. Redis failures are non-fatal to the application.

### 11. Body-size limits

- Normal JSON traffic: **2 MB**.
- `POST /chat` and `POST /chat/stream`: **50 MB** JSON parser so existing vision payloads remain supported.
- Upload-specific Multer limits remain in the upload route.
- JSON parser overflow is returned as HTTP `413`.

The current chat schema uses `messages[].images[]`, with each image attachment carrying an `image/*` MIME type and base64 payload.

---

## HTTP endpoints

Core endpoints currently include:

```text
POST /chat
POST /chat/stream
GET  /health
GET  /health/models
GET  /providers
GET  /analytics
POST /uploads
```

The repository also contains session, project, and workspace APIs. Check `src/routes/` and the corresponding controllers before adding or changing an endpoint.

---

## Caching rules

Redis is optional and disabled by default:

```text
CACHE_ENABLED=false
CACHE_TTL_SECONDS=300
REDIS_URL=
```

When enabled:

```text
memory cache → Redis → existing data/provider path
```

A Redis outage must not make the API unavailable. Never use the Redis cache as the source of truth for the rolling 24-hour cost guard; budget enforcement needs live persisted cost data.

---

## Render / SQLite deployment rule

The current Docker image creates `/app/data` and runs the application as the non-root `gateway` user.

For a Render persistent disk:

```text
mount: /app/data
DATABASE_URL=/app/data/gateway.db
```

Do not document `/var/data` for the current image unless that directory is explicitly created and made writable by the `gateway` user. A previous Render deployment using `/var/data` failed with `EACCES` before application startup.

A Render persistent disk is single-instance storage; this SQLite architecture should not be horizontally scaled by adding multiple instances that each use their own local disk.

See `docs/RENDER_DEPLOYMENT.md` for the complete deployment checklist.

---

## API contract rules

Preserve existing response shapes and frontend expectations unless a change is explicitly requested and reviewed.

Notable behavior:

- `X-Request-ID` is an additive response header.
- `413` is returned for JSON body-size overflow.
- `429` is returned for the configured rolling daily cost budget.
- `504` is used for the global gateway request-budget error.
- `502` is used when all configured providers fail.
- `503` is used when no usable providers/vision-capable providers are configured. The exact message varies: "No free automatic providers are currently available" (default `freeOnly` routing) vs. "No free or paid providers are currently available" (`freeOnly: false` and still nothing eligible) — `middleware/index.ts`'s error handler matches on both.

---

## Development and validation

Install and run locally:

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Recommended pre-PR checks:

```bash
npx tsc --noEmit
npm run lint
npx jest --runInBand
npm run build
```

**Test isolation from `.env` (added 2026-08-18):** `src/config/env.ts` skips loading the real `.env` file entirely when `NODE_ENV=test` (set by `src/__tests__/setup.ts` before any module imports). This was fixed after real provider keys in a local `.env` leaked into `process.env` during `npm test`, making tests that assumed "no providers configured" actually hit live APIs and blow past jest's default 5s timeout. Any test that needs a specific key present should set it explicitly via `process.env` or a `jest.mock('../config/env', ...)`, never by relying on the real `.env`.

CI additionally validates the repository's Docker/Vercel integration where configured.

---

## Maintenance rules for future sessions

1. Use `src/providers/registry.ts` for the authoritative provider list.
2. Keep routing/failover behavior in `router.service.ts`; do not duplicate provider-selection logic in controllers.
3. Keep context/cost orchestration in `orchestrator.service.ts`.
4. Treat SQLite as the persistence source of truth; Redis is a cache only.
5. Keep Redis optional and failure-tolerant.
6. Preserve API response and frontend contracts.
7. Add regression tests for every behavior change.
8. When architecture or environment behavior changes, update this file and the relevant deployment documentation in the same PR.
