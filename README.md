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
- **SQLite locked errors under heavy load** — WAL mode is enabled by
  default, but very high concurrency may still want a move to Postgres
  (swap out `src/database/client.ts`).

## License

MIT — use freely, including as a portfolio project.
