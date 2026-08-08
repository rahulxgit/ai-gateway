# AI Gateway — Project Overview

> **Purpose of this file**: a single reference to understand the whole
> project without reading every source file. Check here first. If you
> (Claude, future session) change architecture, providers, models, ceilings,
> or fix a real bug, **update this file in the same commit**.

---

## What this is

A multi-LLM chat gateway: one API/UI in front of 21 providers, with
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

## Providers (21) — current models & real max-output ceilings

| Provider | Model | Max output | Verified? | Vision? |
|---|---|---|---|---|
| OpenAI | `gpt-5-nano` | 128,000 | ✅ | ✅ |
| Gemini | `gemini-3.1-flash-lite` | 65,536 | ✅ (not independently re-verified for 3.1 specifically) | ✅ |
| Anthropic | `claude-haiku-4-5-20251001` | 64,000 | ✅ | ✅ |
| DeepSeek | `deepseek-v4-flash` | 384,000 | ✅ | ❌ |
| Together | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 64,000 | ⚠️ context-bound estimate | ❌ |
| Mistral | `mistral-small-latest` | 64,000 | ⚠️ context-bound estimate | ❌ |
| Cerebras | `gpt-oss-120b` | 40,960 | ✅ | ❌ |
| Groq | `qwen/qwen3.6-27b` | 16,384 | ✅ verified live 2026-08-07 (see bug #11) | ❌ (reasoning model — `reasoning_format: 'hidden'` set to suppress `<think>` output) |
| OpenRouter | `meta-llama/llama-3.3-70b-instruct` | 16,384 | ✅ | ❌ |
| Hugging Face | `meta-llama/Llama-3.3-70B-Instruct` | 8,192 | ⚠️ router proxies dynamically, unverifiable | ❌ |
| Kimi (Moonshot) | `kimi-k2.6` | 8,192 | ⚠️ conservative guess | ❌ |
| Novita AI | `meta-llama/llama-3.3-70b-instruct` | 16,384 | ⚠️ conservative | ❌ |
| Nebius AI Studio | `meta-llama/Llama-3.3-70B-Instruct` | 32,768 | ⚠️ conservative | ❌ |
| Fireworks AI | `accounts/fireworks/models/gpt-oss-120b` | 32,768 | ✅ verified live 2026-08-07 | ❌ |
| Inference.net | `meta-llama/llama-3.3-70b-instruct/fp-8` | 8,192 | ⚠️ conservative | ❌ |
| SambaNova Cloud | `Meta-Llama-3.3-70B-Instruct` | 8,192 | ⚠️ conservative | ❌ |
| NVIDIA NIM | `meta/llama-3.3-70b-instruct` | 8,192 | ⚠️ conservative | ❌ |
| Baseten | `meta-llama/Llama-3.3-70B-Instruct` | 8,192 | ⚠️ conservative | ❌ |
| ModelScope | `Qwen/Qwen2.5-72B-Instruct` | 8,192 | ⚠️ conservative | ❌ |
| AI/ML API | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | 8,192 | ⚠️ conservative | ❌ |
| Cloudflare Workers AI | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 4,096 | ⚠️ free daily neuron budget, conservative | ❌ |

**Every adapter clamps requested `maxTokens` to its own ceiling** (see
`src/providers/openai-compatible.adapter.ts` `Math.min` pattern) — an
over-limit request never hard-fails, it just gets capped. **When no
`maxTokens` is specified, the default is `DEFAULT_MAX_TOKENS = 1024`, not
the provider's full ceiling** — some providers (Groq confirmed) count
*requested* max_tokens against their TPM rate limit upfront, so defaulting
to the full ceiling on every request could exhaust a low TPM budget before
generating anything. See bug #11 below.

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

- `deepseek-chat` → `deepseek-v4-flash` migration (completed, was due
  2026-07-24). `deepseek-v4-flash` defaults to "thinking mode" on
  (deepseek-chat didn't) — adapter doesn't yet send the `thinking:
  disabled` control param, so expect slightly higher latency/cost than the
  old baseline until that's added.
- **Fireworks AI dropped the entire Llama 3.x line from its serverless
  catalog** (confirmed live against a real account 2026-08-07 — `GET
  /v1/models` returned zero matches for "llama"). Current Fireworks
  catalog is GLM, Kimi, MiniMax, GPT-OSS, DeepSeek v4, Qwen3, and Nemotron.
  Default switched from `llama-v3p3-70b-instruct` to `gpt-oss-120b` (same
  model family already used as the Cerebras default, for consistency).
  If Fireworks requests start 404ing again, re-run `GET
  /v1/models` against the account key before assuming it's a code bug —
  their catalog appears to churn fast.
- **Groq deprecated `meta-llama/llama-4-scout-17b-16e-instruct`** on
  2026-06-17 (confirmed 404 in prod 2026-08-07 — two months of drift
  before it was noticed). Current default is `qwen/qwen3.6-27b`. Groq's
  model catalog and per-model TPM/max_tokens limits appear to change
  often and are account-specific (no longer a fixed public table — check
  live at `console.groq.com/settings/limits`). **`GET /health/models`
  (added after this incident, `model-validation.service.ts`) checks every
  configured provider's default model against its live catalog on every
  boot and logs a warning if one goes missing — check that endpoint /
  Render startup logs first if Groq (or any OpenAI-compatible provider)
  starts silently failing over again**, before re-diagnosing from
  scratch.
- **Gemini default switched 2.5 Flash-Lite → 3.1 Flash-Lite** (2026-08-07)
  after real free-tier rate-limit hits within only a few chat turns.
  3.1 Flash-Lite is still on the older `generateContent` API shape this
  adapter uses. Google has since shipped 3.5 Flash-Lite / 3.6 Flash as GA,
  which deprecate `temperature`/`top_p`/`top_k` and introduce a new
  `/interactions` endpoint — migrating to those needs an adapter rewrite,
  not a one-line model-string swap, so it was deliberately skipped for now.

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
- **Composer**: text + file attach. PDF/DOCX/text files get extracted and
  sent to the model as context, but the chat bubble shows a clean filename
  chip — never the raw extracted text — same as Claude.ai/ChatGPT. Images →
  real base64 sent to vision providers, shown as thumbnails. Plus
  copy-code buttons on fenced code blocks in responses.
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
8. When 10 new providers (Cloudflare, Fireworks, Inference.net, Nebius,
   SambaNova, NVIDIA, Novita, Baseten, ModelScope, AI/ML API) were added,
   `chatRequestSchema.forceProvider` (a Zod enum in `src/middleware/index.ts`)
   had its own hand-copied provider list that never got updated — every
   request forcing one of the 10 new providers was rejected with a 400
   before it ever reached the adapter, even with a fully working API key.
   Fixed by deriving both `ProviderName` and the Zod enum from one
   `PROVIDER_NAMES` const array (`src/types/index.ts`) instead of two
   independent lists that could drift apart.
9. `classifyError` (`src/providers/base.adapter.ts`) had no cases for HTTP
   404 or 412, so both fell into a generic `UNKNOWN` error code. Discovered
   live: Fireworks returns 412 for a billing-suspended account and a bare,
   bodyless 404 once a model is gone from its catalog. Added
   `ACCOUNT_SUSPENDED` (412) and `NOT_FOUND` (404) as their own codes so
   this is diagnosable from Render logs / the health panel directly.
10. Fireworks default model — see "Known deprecation risk" above.
11. Groq multi-bug saga (Aug 2026) — four independent bugs stacked on top
    of each other, each one masking the next until the previous was fixed:
    - `meta-llama/llama-4-scout-17b-16e-instruct` was deprecated by Groq
      (2026-06-17) — `model or endpoint not found`, silently failed over
      to Gemini. Switched to `qwen/qwen3.6-27b`.
    - `maxOutputTokens` was stale at `32768`, a leftover from an even
      earlier default model, never updated across two subsequent model
      swaps — every request got a flat 400 (`max_tokens` must be ≤
      `16384`) and failed over. Corrected to `16384`.
    - `classifyError`'s 400/422 branch extracted the provider's actual
      error text into a `msg` variable but never used it, always
      returning the literal string `"invalid request"` — `/health`'s
      `lastError` was useless for diagnosing any of the above until this
      was fixed to surface the real message.
    - Even after both real bugs were fixed, `qwen/qwen3.6-27b` (8,000 TPM
      on this account) still 413'd, because the adapter defaulted
      `max_tokens` to the *entire* `maxOutputTokens` ceiling whenever a
      caller didn't specify one — Groq counts *requested* max_tokens
      against TPM upfront, so a bare `"hi"` was reserving 16,384 tokens
      before generating anything. Added `DEFAULT_MAX_TOKENS = 1024` as a
      sane default; explicit `maxTokens` still clamps to the real ceiling.
    - Once real replies came back, `qwen3.6-27b` (a reasoning model) was
      leaking its internal chain-of-thought into visible `content` via
      `<think>...</think>` tags. Fixed with `reasoning_format: 'hidden'`
      (Groq-specific, via a new `extraBodyParams` adapter hook) plus a
      defensive `stripThinkTags()` regex as a backstop, since
      `reasoning_format=hidden` has been reported unreliable for some
      Groq reasoning models in the wild.

**Pattern**: most real bugs here were *stale/wrong model IDs*, *config
defaults silently overridden elsewhere*, or *a value added in one place
(registry/adapter/type) but not a second hand-copied list that validates or
classifies against it* — rarely core logic errors. When adding a provider,
grep for every other hardcoded provider list (request validation schemas,
frontend label maps, error classifiers), not just the registry + type. Check
these two categories first when something that "should" work doesn't.

**Newer pattern (the Groq saga above): silent defaults mask downstream
failures, one layer at a time.** A default that's silently wrong doesn't
just cause one bug — it hides whatever bug is *behind* it, because the
request never gets far enough to hit it. Symptoms:
- Fixing one bug reveals what looks like a *new* bug, not progress. (Fix
  the deprecated model → now the ceiling is wrong. Fix the ceiling → now
  the default max_tokens blows TPM. Fix that → now reasoning tags leak.)
  Each fix was correct; each one just uncovered the next layer.
- The generic error message (`classifyError` returning a hardcoded string
  instead of the provider's real text) made every layer *look* identical
  from `/health` — "invalid request" told us nothing until that itself
  was fixed. **A swallowed error message is itself a bug that hides other
  bugs — fix error-surfacing first when debugging a chain like this.**
- A value that "should" auto-scale with context (here: `max_tokens`
  defaulting to `maxOutputTokens`, the full ceiling) instead ossifies at
  whatever was reasonable when it was written, and stays silently wrong
  through every subsequent model swap. Any `?? someOtherConfigValue`
  fallback is a candidate for this — ask whether the fallback should be a
  fixed, deliberately-chosen constant instead of inheriting a ceiling
  meant for something else.
- When a fix doesn't work, don't discard the previous fix and guess again
  — verify what actually changed (a real model swap? a genuinely new
  error?) before concluding the earlier diagnosis was wrong. Three of the
  four Groq bugs were only found by reading the *literal* error string
  from `/health` after each attempted fix, not by re-guessing.

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
