# AI Gateway — Multi-LLM Router with Automatic Failover

A production-ready gateway that routes chat requests across seven LLM providers
(Gemini, Anthropic, OpenAI, Groq, Together AI, OpenRouter, Hugging Face),
automatically failing over between them on rate limits, quota errors,
timeouts, or outages — **without losing conversation or project context**.

## Why this exists

Single-provider apps break when that provider rate-limits, goes down, or
runs out of quota. This gateway sits in front of every provider behind one
API, so your app keeps working even when any individual provider doesn't.

## Architecture

```
Client
  │
  ▼
Express API  ──▶  AI Orchestrator  ──▶  Router (failover engine)
                        │                     │
                        │                     ▼
                        │              Provider Adapters
                        │        (Gemini / Anthropic / OpenAI /
                        │         Groq / Together / OpenRouter / HF)
                        ▼
              Persistent Project Context
        (SQLite: sessions, messages, projects,
         files, edit history, snapshots, analytics)
```

- **Provider adapters** (`src/providers/`) all implement one `ProviderAdapter`
  interface. OpenAI, Groq, Together, and OpenRouter share a single
  `OpenAICompatibleAdapter` base since they speak the same API shape;
  Anthropic and Gemini have their own adapters for their native formats.
- **Router** (`src/services/router.service.ts`) tries providers in a
  task-aware priority order, retries transient errors with exponential
  backoff, and fails over to the next provider on any retryable error.
- **Orchestrator** (`src/services/orchestrator.service.ts`) wraps the router
  and guarantees continuity: before every call it reloads project memory,
  conversation history, and relevant files from SQLite and injects them as
  context — so a failover to a different provider is invisible to the user.
- **Persistent Project Context**: every file write, architecture decision,
  task, bug, and conversation turn is stored in SQLite with full version
  history, undo/revert, and named snapshots.

## Quick start

```bash
git clone <your-repo-url>
cd ai-gateway
npm install
cp .env.example .env
# edit .env and add at least one provider API key
npm run migrate
npm run dev
```

The server starts on `http://localhost:4000`. Check `GET /health` to
confirm it's up.

### Docker

```bash
cp .env.example .env   # add your keys
docker compose up --build
```

This runs the gateway plus a Redis instance (for optional response caching).

## Configuration

All config is via environment variables — see `.env.example`. You only need
**one** provider key to run; the gateway adapts to whatever's configured and
reports the rest as unavailable via `/health` and `/providers`.

### Providers

Eleven providers are supported, all behind the same `ProviderAdapter`
interface: Gemini, Anthropic, OpenAI, Groq, Together AI, OpenRouter,
Hugging Face, DeepSeek, Kimi (Moonshot AI), Cerebras, and Mistral. A few
notes on cost, since "free" means different things across them:

- **Gemini, Groq, Together, Hugging Face, OpenRouter, Cerebras, Mistral** —
  genuinely free tiers with no card required (limits and reliability vary;
  Cerebras's 1M tokens/day resets daily and is currently the most generous
  raw daily volume of any provider here; Mistral's ~1B tokens/month
  "Experiment" tier includes Codestral for coding).
- **DeepSeek** — 5 million free tokens on signup, no card required, then
  roughly $0.14 per million tokens after. One of the strongest
  price-to-coding-quality ratios available.
- **Kimi (Moonshot)** — requires a minimum $1 recharge to activate the API
  (not free-to-start), then cheap per-token after. Notable for a very large
  context window, so it leads the `large-context` task routing.
- **Zero-cost alternative to DeepSeek/Kimi**: OpenRouter (free to create a
  key for) hosts `:free`-suffixed variants of both, e.g.
  `deepseek/deepseek-chat-v3.1:free` or `moonshotai/kimi-k2:free`. Pass
  `forceProvider: "openrouter"` with `model: "deepseek/deepseek-chat-v3.1:free"`
  in a `/chat` request to use them at no cost.

### Max output tokens per provider

Every adapter clamps a request's `maxTokens` to its own real ceiling before
sending it, so asking for more than a provider allows fails over cleanly
instead of hard-erroring. Verified ceilings (checked against each
provider's own docs):

| Provider | Max output tokens | Verified? |
|---|---|---|
| OpenAI (gpt-5-nano) | 128,000 | ✅ verified — OpenAI docs |
| Gemini (2.5 Flash-Lite) | 65,536 | ✅ verified — Google docs |
| Anthropic (Haiku 4.5) | 64,000 | ✅ verified — Anthropic docs |
| Together (Llama-3.3-70B-Instruct-Turbo) | 64,000 | ⚠️ no separate cap published; context-bound estimate (131K context, one listing shows "unlimited" output) |
| Mistral (Small 4) | 64,000 | ⚠️ no separate cap published; context-bound estimate (256K shared input+output budget) |
| Cerebras (gpt-oss-120b) | 40,960 | ✅ verified — Cerebras model config |
| Groq (llama-3.3-70b-versatile) | 32,768 | ✅ verified — Groq docs |
| OpenRouter (llama-3.3-70b-instruct) | 16,384 | ✅ verified — OpenRouter model page |
| DeepSeek (deepseek-chat) | 8,000 | ✅ verified — DeepSeek docs |
| Hugging Face | 8,192 | ⚠️ genuinely unverifiable — HF's router dynamically proxies to a different backend per request, so there's no single fixed ceiling to check |
| Kimi (k2.6) | 8,192 | ⚠️ conservative estimate, not individually verified |

If you confirm a higher real ceiling for any of the unverified ones, update
`maxOutputTokens` in that adapter's constructor (`src/providers/*.adapter.ts`).

**Time-sensitive:** DeepSeek's `deepseek-chat` model ID is scheduled for
deprecation on **2026-07-24**. It currently works (aliased internally to
`deepseek-v4-flash`), but will stop accepting that exact model string after
the deadline — migrate to `deepseek-v4-flash` in `src/providers/deepseek.adapter.ts`
before then.

Task-based routing (`taskType: "coding"`, `"reasoning"`, etc.) automatically
prefers whichever provider tends to perform best for that kind of work —
see `src/config/routing.ts` to adjust the priority order.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/chat` | Send a chat request; routes + fails over automatically |
| POST | `/chat/stream` | Same, streamed via SSE |
| GET | `/providers` | List all providers and which are configured |
| GET | `/health` | Per-provider health/latency snapshot |
| GET | `/analytics` | Usage, cost, and success-rate summary |
| GET/POST | `/sessions` | List / create chat sessions |
| GET | `/sessions/:id/messages` | Full conversation history |
| DELETE | `/session/:id` | Delete a session |
| POST/GET | `/projects` | Create / list projects (persistent project memory) |
| GET/PATCH | `/projects/:id` | Read / update project memory |
| PUT/GET/DELETE | `/projects/:id/files` | Workspace file management, versioned |
| POST/GET | `/projects/:id/snapshots` | Create/list/restore full project snapshots |
| POST | `/uploads` | Upload a PDF/DOCX/text file; extracts text (optionally saves into a project's workspace via `projectId` field) |

### Example: basic chat request

```bash
curl -X POST http://localhost:4000/chat \
  -H 'Content-Type: application/json' \
  -d '{
        "messages": [{ "role": "user", "content": "Explain event loops in Node.js" }],
        "taskType": "reasoning"
      }'
```

### Example: project-aware coding session

```bash
# 1. Create a project
curl -X POST http://localhost:4000/projects \
  -d '{"name":"My App","goal":"Build a REST API"}' -H 'Content-Type: application/json'

# 2. Chat with project context attached — the orchestrator injects
#    project memory + relevant files automatically, and if the provider
#    fails mid-project, the next one picks up with full context intact.
curl -X POST http://localhost:4000/chat \
  -H 'Content-Type: application/json' \
  -d '{
        "projectId": "<id from step 1>",
        "taskType": "coding",
        "messages": [{ "role": "user", "content": "Add a /users endpoint" }]
      }'
```

## Frontend (React dashboard)

A chat UI lives in `frontend/` — dark, technical "control room" aesthetic
built around the one thing this product actually does: route around failure.
Every assistant reply shows its **routing chain** (which providers were
tried, which one answered, in what time), a live provider health bar in the
header, and a slide-over analytics panel.

```bash
cd frontend
npm install
cp .env.example .env   # points at http://localhost:4000 by default
npm run dev
```

Opens on `http://localhost:5173`. Make sure the backend (`npm run dev` in
the repo root) is running first — the frontend is just a client for it.

```bash
npm run build   # production build to frontend/dist
```

### What you'll see

- **Sidebar** — chat sessions, persisted server-side, switch between them freely.
- **Header controls** — pick a task type (routes to the best-suited provider
  chain) or force a specific provider to test failover deliberately.
- **Health bar** — live dot per provider (green = healthy, amber = degraded/
  rate-limited, red = down), polled every 8s.
- **Routing chain per message** — e.g. `gemini →(failed) groq · llama-3.3-70b-versatile · failover`.
  This is the actual feature, made visible instead of hidden.
- **Analytics panel** — total requests, success rate, failover count, cost,
  and per-provider breakdown.
- **Project switcher** — create a persistent project, attach it to a chat,
  and the orchestrator automatically injects that project's goal, files,
  and decisions as context on every message.
- **File uploads** — attach a PDF, DOCX, or text file from the composer.
  The backend extracts the text and folds it into your next message; if a
  project is active, the file is also saved into that project's workspace
  so later requests can reference it automatically.
- **Image input (vision)** — attach an image and it's sent as real image
  data to a vision-capable provider (Gemini, Anthropic, or OpenAI — the
  only three configured here whose default model actually accepts image
  input), the same way Claude.ai or ChatGPT handle a photo. The router
  automatically restricts image-bearing requests to vision-capable
  providers only; if none are configured, you get a clear error naming
  which keys would enable it, instead of the image silently being ignored.
  Note: unlike text, attached images are not currently persisted into
  conversation history — they apply to the turn you send them in.

## Testing


```bash
npm test              # full suite (35 tests)
npm run test:watch    # watch mode
npx jest --coverage   # with coverage report
```

## Folder structure

```
src/
  config/       env + task-routing + pricing config
  providers/    one adapter per LLM provider + shared registry
  services/     router, orchestrator, project memory, workspace, analytics
  controllers/  request handlers
  routes/       Express route definitions
  middleware/   validation, rate limiting, error handling
  database/     SQLite schema + client
  types/        shared TypeScript types
  __tests__/    Jest test suite
```

## Troubleshooting

- **`503 No providers are configured`** — set at least one `*_API_KEY` in `.env`.
- **`502 All providers failed`** — every configured provider rejected the
  request; check `/health` for per-provider error detail.
- **`400 Invalid request body` on a large paste** — the request body has a
  `MAX_PROMPT_LENGTH` cap (default 3.5M characters, ~875K tokens — enough
  for roughly 50k+ lines of code). If you still hit this on something
  larger, raise `MAX_PROMPT_LENGTH` in `.env`, but note the actual LLM call
  will still fail over if it exceeds whichever provider's real context
  window ends up handling it (Gemini 2.5 Flash-Lite's 1M-token window is
  the largest configured here).
- **SQLite locked errors under heavy load** — WAL mode is enabled by
  default, but very high concurrency may still want a move to Postgres
  (swap out `src/database/client.ts`).

## License

MIT — use freely, including as a portfolio project.
