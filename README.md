# AI Gateway — Multi-LLM Router with Automatic Failover

AI Gateway is a production-oriented Express/TypeScript service that exposes one chat API in front of multiple LLM providers. It adds task-aware routing, provider failover, conversation/project persistence, analytics, model validation, Redis caching, request protection, and graceful shutdown without changing the core architecture:

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

Optional cache layer:
L1 in-process cache → L2 Redis → existing SQLite/provider operation
```

Repository: https://github.com/rahulxgit/ai-gateway  
Frontend: https://ai-gateway-alpha.vercel.app/  
Backend: https://ai-gateway-wx35.onrender.com

## Current capabilities

- 23 configured provider adapters behind a shared `ProviderAdapter` interface.
- Task-aware routing and automatic provider failover.
- Free-first automatic routing by default, with an opt-in `freeOnly: false` per request to also try paid providers (cheapest-first) once every free one has failed — see [Free vs. paid routing](#free-vs-paid-routing) below.
- Streaming chat support.
- Conversation/session persistence in SQLite.
- Persistent projects, workspace files, edit history, undo/revert, and snapshots.
- Document upload/extraction support for the existing upload flow.
- Provider health and model-availability checks, including Gemini and Anthropic, backed by both real request traffic and an active background prober (startup + every 5 minutes) so status stays current even with no chat activity.
- Token/cost analytics and an optional rolling 24-hour cost budget.
- Optional Redis L2 caching with in-process L1 fallback.
- Request correlation IDs through the HTTP request and service logging path.
- Graceful `SIGTERM`/`SIGINT` shutdown with HTTP draining and database close.
- Production stdout logging instead of relying on persistent log files.
- Separate rate limits for chat traffic and lightweight read endpoints.
- 2 MB default JSON request limit, with a dedicated 50 MB JSON parser for `/chat` and `/chat/stream` so existing vision payloads continue to work.

## Architecture

```text
                         ┌───────────────────────┐
                         │       Express API     │
                         │ CORS / Helmet / limit  │
                         │ rate limit / request ID│
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │      Orchestrator     │
                         │ context + cost guard  │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │ Router / Failover     │
                         │ retries + deadline    │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
              Provider adapters  Health checks   Analytics
                    │
                    ▼
                 SQLite

              Optional shared cache:
          L1 memory → L2 Redis → SQLite/provider
```

### Source-of-truth modules

| Area | Location |
|---|---|
| Environment/config | `src/config/env.ts` |
| Routing priorities | `src/config/routing.ts` |
| Provider registry | `src/providers/registry.ts` |
| Provider interface/types | `src/types/index.ts` |
| Failover + global request budget | `src/services/router.service.ts` |
| Orchestration + daily cost guard | `src/services/orchestrator.service.ts` |
| Analytics | `src/services/analytics.service.ts` |
| Model validation | `src/services/model-validation.service.ts` |
| Health | `src/services/health.service.ts` |
| Active health probing | `src/services/health-check.service.ts` |
| Redis L2 cache | `src/utils/redis-cache.ts` |
| Request parsing limits | `src/middleware/body-limit.ts` |
| HTTP middleware | `src/middleware/index.ts` |
| Graceful shutdown | `src/utils/graceful-shutdown.ts` |
| Logging | `src/utils/logger.ts` |
| SQLite client/schema | `src/database/` |

## Google Gemini / free-tier configuration

The gateway supports Google Gemini through the **Gemini Developer API / Google AI Studio** using Google's documented **OpenAI-compatible Chat Completions endpoint**. Set `GEMINI_API_KEY` from Google AI Studio; no Vertex AI configuration is required for this adapter.

```text
GEMINI_API_KEY=your_google_gemini_api_key
```

The default Gemini model is **`gemini-3.1-flash-lite`**. Google lists this GA model in the Gemini API free tier and describes it as optimized for high-volume, lightweight workloads. The gateway therefore prefers it in the general and cheap routing lanes. Google applies free-tier rate limits at the **project level**, measured through RPM, TPM, and RPD; active limits are account/project/model dependent and should be checked in Google AI Studio. The gateway deliberately does not hard-code a universal quota or assume that multiple API keys multiply a project's capacity.

OpenAI-compatible Gemini requests are routed through:

```text
https://generativelanguage.googleapis.com/v1beta/openai
```

The shared OpenAI-compatible adapter provides model discovery, streaming, error classification, and automatic failover. This keeps Gemini behavior consistent with the other OpenAI-compatible providers without duplicating transport code.

**Important:** Google's OpenAI compatibility layer is intended for unified Chat Completions-style integrations. Gemini-specific features such as some built-in tools and other native capabilities may require Google's direct Gemini API.

Official documentation:

- Gemini OpenAI compatibility: https://ai.google.dev/gemini-api/docs/openai
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Google AI Studio: https://aistudio.google.com/

## Supported providers

The current registry contains 23 providers:

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
22. GitHub Models (free, no card, recurring daily quota — currently excluded from automatic routing; no key configured yet, see note below)
23. Cohere (free, no card, recurring monthly quota)

Provider availability is configuration-driven: set a provider's API key (and Cloudflare's account ID where required) and the registry can expose it. `/providers` and `/health/models` reflect the providers configured in the running environment. `/providers` also returns `freeModels`/`paidModels`, reflecting which configured providers currently participate in the free vs. paid automatic-routing pools (see below).

> **GitHub Models note:** registered and priced as free, but excluded from automatic routing as of 2026-08-18 — a live provider audit found no `GITHUB_MODELS_API_KEY` in production, so it was an unreachable dead entry in every routing order. Still usable via `forceProvider: "githubmodels"` once a key is set; re-add to `FREE_AUTO_PROVIDERS` in `src/config/routing.ts` after verifying.

## Free vs. paid routing

Automatic routing defaults to free/no-billing-risk providers only — this has always been the gateway's behavior and remains unchanged by default. A request can opt into also trying paid providers as a fallback tier, strictly *after* every free provider has been attempted and failed, by setting `freeOnly: false`:

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "freeOnly": false
}
```

Paid providers are tried cheapest-per-token first. `forceProvider` is unaffected either way — it pins exactly one provider regardless of free/paid status, and `freeOnly` is ignored when it's set. Omitting `freeOnly` (or setting it `true`) preserves the original free-only behavior.

## Provider health

Every provider reports one of 9 statuses via `GET /health`: `configured` (key set, never checked yet), `healthy`, `degraded`, `rate_limited`, `auth_error`, `model_unavailable`, `billing_required`, `retired`, or `unknown` (no key configured). Status is derived identically whether it came from a real routed chat request or from the background prober — both funnel through the same error classification.

The background prober (`health-check.service.ts`) runs a lightweight `GET /models` liveness check — never a completion request, so it costs no tokens — on server startup and every 5 minutes afterward, so health data stays current even during periods with no chat traffic at all. A provider already confirmed fresh by real traffic recently is skipped on a given tick rather than redundantly re-probed.

## Quick start

```bash
git clone https://github.com/rahulxgit/ai-gateway.git
cd ai-gateway
npm install
cp .env.example .env
# add at least one provider API key
npm run migrate
npm run dev
```

The local server defaults to `http://localhost:4000`.

Useful commands:

```bash
npm run dev
npm run build
npm test
npm run lint
npx tsc --noEmit
npm run migrate
```

## Docker

```bash
cp .env.example .env
docker compose up --build
```

The repository includes Redis support for the optional shared cache. You can run without Redis; `CACHE_ENABLED=false` keeps the application on its normal in-process/data path.

## Environment variables

All runtime configuration comes from environment variables. `.env.example` is the canonical template.

### Provider keys

Set at least one supported provider key:

```text
GEMINI_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GROQ_API_KEY=
TOGETHER_API_KEY=
OPENROUTER_API_KEY=
HF_API_KEY=
DEEPSEEK_API_KEY=
KIMI_API_KEY=
CEREBRAS_API_KEY=
MISTRAL_API_KEY=
CLOUDFLARE_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
FIREWORKS_API_KEY=
INFERENCE_API_KEY=
NEBIUS_API_KEY=
SAMBANOVA_API_KEY=
NVIDIA_API_KEY=
NOVITA_API_KEY=
BASETEN_API_KEY=
MODELSCOPE_API_KEY=
AIMLAPI_API_KEY=
GITHUB_MODELS_API_KEY=
COHERE_API_KEY=
```

Cloudflare Workers AI requires both `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID`.

### Runtime defaults

| Variable | Default | Purpose |
|---|---:|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `4000` | HTTP port; Render can provide its own `PORT` |
| `DATABASE_URL` | `./data/gateway.db` | SQLite database path |
| `CORS_ORIGIN` | `*` | Allowed origin(s), comma-separated |
| `LOG_LEVEL` | `info` | Winston log level |
| `REQUEST_TIMEOUT_MS` | `30000` | Individual provider/request timeout |
| `GATEWAY_REQUEST_BUDGET_MS` | `60000` | Total wall-clock budget across a failover chain |
| `MAX_RETRIES` | `2` | Retries for retryable provider failures |
| `MAX_PROMPT_LENGTH` | `3500000` | Prompt character limit |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window |
| `RATE_LIMIT_MAX` | `60` | Strict chat/default API limit per window |
| `DAILY_COST_BUDGET_USD` | `0` | Rolling 24h estimated spend guard; `0` disables |
| `CACHE_ENABLED` | `false` | Enables Redis L2 cache when true |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL |
| `REDIS_URL` | empty | Redis-compatible connection URL |

### Redis cache

Redis is optional. When enabled, the cache hierarchy is:

```text
L1 in-process memory
       ↓ miss
L2 Redis
       ↓ miss / Redis unavailable
SQLite/provider operation
```

A Redis outage is treated as a cache failure, not an application failure. The application continues using the existing local/database/provider path.

Enable it with:

```text
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
REDIS_URL=<redis-compatible-url>
```

## API endpoints

### Chat

`POST /chat`  
Standard non-streaming chat request.

`POST /chat/stream`  
Streaming chat request.

`POST /chat` and `POST /chat/stream` use a 50 MB JSON parser to preserve large vision payloads.

### Health and provider discovery

`GET /health`  
Provider health/status information — one of 9 statuses per provider (`configured`, `healthy`, `degraded`, `rate_limited`, `auth_error`, `model_unavailable`, `billing_required`, `retired`, `unknown`), refreshed by both real chat traffic and an active background prober.

`GET /health/models`  
Checks configured provider model availability, including Gemini and Anthropic.

`GET /providers`  
Lists configured/available providers, plus a `freeModels`/`paidModels` breakdown of the automatic-routing pools.

These lightweight read endpoints use the generous read rate limiter.

### Analytics

`GET /analytics`  
Usage, cost, request, and failover analytics.

The analytics service can use the optional Redis L2 cache, while the 24-hour cost guard continues to use the live persistence path for budget enforcement.

### Sessions, projects, workspace, and uploads

The gateway also exposes the existing session, project, workspace, and upload APIs. The upload route keeps its existing Multer file-size limit; the new 2 MB JSON default does not replace the upload-specific handling.

## Chat request example

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Explain how provider failover works."
    }
  ],
  "taskType": "reasoning"
}
```

Optional routing controls include `taskType`, `forceProvider`, `model`, and `freeOnly` (see [Free vs. paid routing](#free-vs-paid-routing) above).

Example forcing a provider:

```json
{
  "messages": [
    { "role": "user", "content": "Give me a concise code review." }
  ],
  "forceProvider": "anthropic"
}
```

### Vision request shape

The current chat schema uses `messages[].images[]`:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Describe this image.",
      "images": [
        {
          "mimeType": "image/jpeg",
          "base64": "..."
        }
      ]
    }
  ]
}
```

Each image attachment is validated as an `image/*` MIME type with a base64 payload limit, and the router restricts image requests to vision-capable providers.

## Response and observability

Successful chat responses include the existing message and metadata fields, including provider/model information and the failover chain.

Every HTTP request receives an `X-Request-ID` correlation ID. The same correlation ID is threaded into relevant router, orchestrator, health, and error logs so a request can be traced across failover and provider-health events.

## Reliability and hardening

The current `main` includes the following production hardening changes:

1. **Global request budget** — a single wall-clock deadline applies across the provider failover chain so a full outage cannot run indefinitely.
2. **Retry classification** — authentication, not-found, suspended-account, and insufficient-credit conditions are non-retryable for the same provider, while failover to other providers remains possible.
3. **24-hour cost guard** — an optional rolling spend budget returns HTTP `429` when exceeded.
4. **Split rate limiting** — `/health` and `/providers` are generous read endpoints; chat traffic uses the stricter limiter.
5. **Model availability checks** — Gemini and Anthropic participate in `/health/models` alongside the other adapters.
6. **Correlation IDs** — UUID request IDs are propagated through service logging.
7. **Production logging** — production logs are emitted to stdout instead of depending on persistent log files.
8. **Graceful shutdown** — `SIGTERM`/`SIGINT` stops new HTTP connections, drains active requests, closes optional Redis, and closes SQLite with a bounded fallback.
9. **Optional Redis L2** — Redis can back analytics/model-validation caches while the in-process cache remains the fast path and fallback.
10. **Body-size hardening** — normal JSON is capped at 2 MB; chat JSON remains at 50 MB for existing image/vision payloads.
11. **Active health probing** — a background prober checks provider liveness on startup and every 5 minutes via a zero-token-cost `GET /models` call, so `/health` stays accurate without depending on chat traffic to surface it.
12. **No-dead-end failover** — if a correlated burst of failures puts every eligible provider into a health cooldown simultaneously, the router probes them anyway rather than failing synthetically for up to 30 minutes; a real attempt beats a heuristic-driven outage.

## Security note

The gateway does not currently implement API-key authentication for its own HTTP API. If you expose the backend publicly, add an authentication/authorization layer before treating it as a shared production service. Provider rate limits and the gateway's own rate limiter/cost guard are not substitutes for client authentication.

## Render deployment

See [docs/RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md) for production environment variables, Redis setup, and SQLite persistence.

Important for Render + SQLite: the image runs as the non-root `gateway` user and already owns `/app/data`. If you attach a Render persistent disk, mount it at `/app/data` and use:

```text
DATABASE_URL=/app/data/gateway.db
```

Do not point the application at `/var/data` unless that directory is explicitly created and writable by the service user.

## Tests and CI

The project uses Jest, TypeScript, and ESLint. The CI pipeline validates TypeScript, linting, tests, and build; Docker and Vercel checks run in the repository's pull-request workflow.

Recommended local checks before opening a PR:

```bash
npx tsc --noEmit
npm run lint
npx jest --runInBand
npm run build
```

## Project layout

```text
src/
  config/                 environment + routing configuration
  controllers/            HTTP controllers
  database/               SQLite client, schema, migration
  middleware/             rate limits, validation, request IDs, body limits
  providers/              provider adapters + registry
  routes/                 Express route registration
  services/               router, orchestrator, analytics, health, projects, uploads
  types/                  shared TypeScript types
  utils/                  logger, Redis cache, graceful shutdown, helpers
  __tests__/              Jest tests
frontend/
  React dashboard and API client
```

## Development principles

Keep the core architecture stable:

```text
router → orchestrator → provider adapters → SQLite
```

Hardening changes should preserve existing API response shapes and frontend contracts. Prefer small, isolated changes with regression tests and keep `PROJECT_OVERVIEW.md` synchronized when architecture or environment behavior changes.