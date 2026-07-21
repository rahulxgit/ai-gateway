# AI Gateway — Project Overview

> **Purpose of this file**: a single reference to understand the whole
> project without reading every source file. Check here first. If you
> (Claude, future session) change architecture, providers, models, ceilings,
> or fix a real bug, **update this file in the same commit**.

---

## What this is

A multi-LLM chat gateway: one API/UI in front of 11 providers, with
automatic failover, persistent project memory, file/image upload, and a
React dashboard. Backend on Render, frontend on Vercel.

- **Live site**: https://ai-gateway-alpha.vercel.app/
- **Backend API**: https://ai-gateway-wx35.onrender.com
- **Repo**: github.com/rahulxgit/ai-gateway

---

## Architecture (one paragraph)

Client → Express API → **Orchestrator** (injects project memory + conversation
history + relevant files as context) → **Router** (tries providers in
task-based priority order, retries transient errors, fails over on
failure) → **Provider Adapters** (one class per provider, all implementing
`ProviderAdapter`) → SQLite (sessions, messages, projects, files, edit
history, snapshots, analytics).

---

## Folder map

```
src/
  config/env.ts        — env var loading, all optional with defaults
  config/routing.ts     — DEFAULT_FAILOVER_ORDER, TASK_ROUTING, PRICING_PER_1K_TOKENS
  providers/            — one file per provider + registry.ts (source of truth)
  services/router.service.ts       — failover engine (routeChat / routeChatStream)
  services/orchestrator.service.ts — wraps router, injects project/conversation context
  services/project-memory.service.ts — project CRUD (goal, tasks, decisions, etc.)
  services/workspace.service.ts    — file versioning, undo, snapshots
  services/upload.service.ts       — PDF/DOCX/image extraction (pdfjs-dist, mammoth)
  services/health.service.ts       — per-provider rolling health/latency
  services/analytics.service.ts    — cost/usage tracking
  services/conversation.service.ts — session + message persistence, auto-titling
  controllers/ + routes/ + middleware/ — Express HTTP layer
  database/schema.sql   — SQLite schema (7 tables)
  types/index.ts        — ALL shared types, including ProviderAdapter interface
  __tests__/             — 59 tests across 8 files

frontend/src/
  App.tsx                — main layout, all state
  components/            — Sidebar, Composer, MessageBubble, CodeBlock,
                            RoutingChain, RoutingControls, HealthBar,
                            ProjectSwitcher, AnalyticsPanel
  lib/api.ts              — fetch wrapper, all backend calls
  types.ts                — frontend copy of shared types (kept manually in sync)
```

---

## Providers (11) — current models & real max-output ceilings

| Provider | Model | Max output | Verified? | Vision? |
|---|---|---|---|---|
| OpenAI | `gpt-5-nano` | 128,000 | ✅ | ✅ |
| Gemini | `gemini-2.5-flash-lite` | 65,536 | ✅ | ✅ |
| Anthropic | `claude-haiku-4-5-20251001` | 64,000 | ✅ | ✅ |
| DeepSeek | `deepseek-v4-flash` | 384,000 | ✅ | ❌ |
| Together | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 64,000 | ⚠️ context-bound estimate | ❌ |
| Mistral | `mistral-small-latest` | 64,000 | ⚠️ context-bound estimate | ❌ |
| Cerebras | `gpt-oss-120b` | 40,960 | ✅ | ❌ |
| Groq | `llama-3.3-70b-versatile` | 32,768 | ✅ | ❌ |
| OpenRouter | `meta-llama/llama-3.3-70b-instruct` | 16,384 | ✅ | ❌ |
| Hugging Face | `meta-llama/Llama-3.3-70B-Instruct` | 8,192 | ⚠️ router proxies dynamically, unverifiable | ❌ |
| Kimi (Moonshot) | `kimi-k2.6` | 8,192 | ⚠️ conservative guess | ❌ |

**Every adapter clamps requested `maxTokens` to its own ceiling** (see
`src/providers/openai-compatible.adapter.ts` `Math.min` pattern) — an
over-limit request never hard-fails, it just gets capped.

Vision-capable providers only: **Gemini, Anthropic, OpenAI**. Router
auto-restricts image-bearing requests to these three
(`requestHasImages()` check in `router.service.ts`).

### Free-tier reality (what's actually $0)
Gemini, Groq, Together, Hugging Face, OpenRouter, Cerebras, Mistral —
genuinely free. DeepSeek — 5M free tokens once, then cheap. Kimi — needs
$1 minimum recharge, not free-to-start. **Zero-cost DeepSeek/Kimi
alternative**: force `provider: openrouter` + pick a `:free`-suffixed
model via the frontend's model picker (only appears when OpenRouter is
selected).

---

## Known deprecation risk

None currently outstanding — `deepseek-chat` → `deepseek-v4-flash`
migration (completed, was due 2026-07-24) was the last one.
`deepseek-v4-flash` defaults to "thinking mode" on (deepseek-chat didn't) —
adapter doesn't yet send the `thinking: disabled` control param, so expect
slightly higher latency/cost than the old baseline until that's added.

---

## Config that lives in Render env vars, NOT just code defaults

**Important**: Render environment variables **override** code defaults.
If a bug looks fixed in code but not in production, check Render's actual
env vars first — this bit us once with `MAX_PROMPT_LENGTH`.

| Var | Current default (code) | Notes |
|---|---|---|
| `MAX_PROMPT_LENGTH` | 3,500,000 | chars, not tokens (~875K tokens) — was stuck at 32,000 on Render for a while, causing false "Invalid request body" errors |
| `CORS_ORIGIN` | `*` | comma-separated list supported (multi-frontend) |
| `RATE_LIMIT_MAX` | 60 | per `RATE_LIMIT_WINDOW_MS` (60s) |
| `DATABASE_URL` | `./data/gateway.db` | Render disk must be mounted here or data is lost on redeploy |

---

## Frontend features map

- **Sidebar**: session list, mobile slide-over drawer
- **Composer**: text + file attach (PDF/DOCX/text → extracted as context;
  images → real base64 sent to vision providers) + copy-code buttons on
  fenced code blocks in responses
- **RoutingControls**: task type dropdown, provider force dropdown, and
  (only when `provider: openrouter` selected) a free-model picker
- **RoutingChain**: visualizes the actual failover chain per response
  (struck-through failed providers → final success, in orange if failover
  happened)
- **HealthBar**: live dot per provider, polls `/health` every 8s
- **ProjectSwitcher**: create/switch persistent projects
- **AnalyticsPanel**: cost/success-rate/failover-count slide-over

---

## Real bugs found & fixed (chronological, for pattern-recognition)

1. Stray `:memory:` file committed to git — broke Windows checkout (colon
   illegal in Windows filenames). Root cause: SQLite client resolved
   `":memory:"` as a literal path instead of special-casing it.
2. Model override (e.g. an OpenRouter-specific model string) leaked into
   every fallback provider during failover, causing cascading failure
   instead of clean failover. Fixed: only pass model override to the
   explicitly forced provider.
3. Universal 1024-token output cap (later fixed to per-provider real
   ceilings) — was silently truncating every long response across every
   provider.
4. `MAX_PROMPT_LENGTH` — see "Config that lives in Render env vars" above.
5. `/providers` endpoint had a hardcoded provider array that went stale
   every time a new provider was added — fixed to derive from the registry.
6. Cerebras default model (`llama-3.3-70b`) was deprecated Feb 2026 —
   silently broken until switched to `gpt-oss-120b`.
7. Gemini default model (`gemini-2.0-flash`) was deprecated March 2026 —
   same class of bug, switched to `gemini-2.5-flash-lite`.

**Pattern**: most real bugs here were *stale/wrong model IDs* or
*config defaults silently overridden elsewhere* — not logic errors. Check
these two categories first when something that "should" work doesn't.

---

## Testing

`npm test` — 59 tests, 8 files. Full suite takes ~15s. Notable coverage:
- `router.test.ts` — failover ordering, model-scoping, vision-only routing
- `token-clamping.test.ts` — locks in every provider's exact ceiling (this
  is the regression test to update if you change any `maxOutputTokens`)
- `upload.test.ts` — real PDF/DOCX fixtures, not just mocks
- `workspace.test.ts` — file versioning, undo, snapshots

`pdfjs-dist` is ESM-only and mocked in Jest (real extraction verified
manually via curl against a running server instead — see comments in
`upload.test.ts`).

---

## Deployment

- **Backend**: Render, auto-deploys from `main` push. Needs a persistent
  disk mounted at the `DATABASE_URL` path or SQLite data is wiped on every
  redeploy.
- **Frontend**: Vercel, auto-deploys from `main` push. `VITE_API_URL` is
  baked in at build time (Vite env vars aren't runtime-configurable) — if
  it's wrong, needs a rebuild, not just a redeploy.

---

## Workflow notes for future sessions

- User pushes require a **fresh GitHub PAT every time** — I don't have
  standing repo access. Always remind to revoke after use.
- Check `git log` / `git fetch origin` before pushing — external commits
  (e.g. from GitHub's own Copilot coding agent, seen once via PR #1) can
  land directly on `main` outside this sandbox.
- User is currently focused on: job-search automation script
  (`job_search.py`, separate repo/project) that calls this gateway's
  `/chat` endpoint as a fallback AI provider — mentioned once, not part of
  this repo.
