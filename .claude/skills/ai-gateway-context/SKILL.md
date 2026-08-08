---
name: ai-gateway-context
description: Use this whenever working on the ai-gateway repo (github.com/rahulxgit/ai-gateway) — a TypeScript LLM gateway routing across 21 providers with automatic failover, health-aware routing, SQLite-backed conversation/project memory, and context compression. Trigger this for any task touching provider adapters, the router/failover chain, error classification, health scoring, context compression, the database layer, the React dashboard, Docker, or the Jest suite. Load this before writing code so the architecture, provider list, and existing conventions don't need to be re-explained every session.
---

# AI Gateway — Architecture Context

TypeScript LLM gateway that routes chat requests across 21 providers with automatic failover, health-based provider ordering, SQLite conversation/project memory, and LLM-driven context compression. Frontend is a separate React (Vite) dashboard. Repo: github.com/rahulxgit/ai-gateway.

## Layout

```
src/
  providers/     - one adapter per provider + base.adapter.ts (shared error classification) + registry.ts
  services/      - router, health, context-compression, conversation, project-memory, analytics, workspace, upload, model-validation, orchestrator
  config/        - env.ts, routing.ts (failover order, task routing, pricing table)
  database/      - client.ts, migrate.ts, schema.sql (SQLite)
  controllers/, routes/, middleware/  - Express layer
  types/         - ChatRequest, ProviderName, TaskType, ProviderError, etc.
  __tests__/     - 14 Jest test files
frontend/        - Vite + React dashboard, separate package.json
```

## The 21 providers

`gemini, anthropic, openai, groq, together, openrouter, huggingface, deepseek, kimi, cerebras, mistral, cloudflare, fireworks, inference, nebius, sambanova, nvidia, novita, baseten, modelscope, aimlapi`

Single source of truth is `src/providers/registry.ts`. **To add a new provider: write an adapter implementing the shared interface, instantiate it in the registry, add the name to the `ProviderName` union in `types/index.ts`, add it to `DEFAULT_FAILOVER_ORDER` and `PRICING_PER_1K_TOKENS` in `config/routing.ts`.** Nothing else needs to change — that's the whole point of the registry pattern. Don't special-case a new provider in the router.

## Routing (`services/router.service.ts` + `config/routing.ts`)

- `candidateOrder()` builds the try-order per request: task-type preference (`TASK_ROUTING`) → rest of `DEFAULT_FAILOVER_ORDER` → filtered to configured providers → filtered to vision-capable providers if the request has images → healthy providers sorted before degraded/rate-limited ones (never dropped entirely, just deprioritized).
- `TaskType` is one of: `coding, reasoning, creative, fast, cheap, large-context, general`. Each has a hand-picked provider preference list with reasoning in comments (e.g. `coding` leads with DeepSeek/Mistral-Codestral for SWE-bench performance-per-dollar; `fast` leads with Cerebras/Groq for wafer-scale/LPU inference speed).
- **Non-streaming (`routeChat`)**: tries each candidate with retry+backoff (`utils/retry.ts`), fails over to the next provider on any retryable error, throws `AllProvidersFailedError` only after every candidate is exhausted.
- **Streaming (`routeChatStream`)**: same chain, but failover is only allowed *before* the first chunk reaches the client. Once tokens start flowing under a provider's name, a mid-stream failure is surfaced rather than silently restarting from a different provider — don't change this without a good reason, it exists to avoid confusing the end user.
- A `forceProvider` + `model` override only applies to the forced provider itself; every other provider in the fallback chain uses its own default model (an OpenRouter-style model string like `deepseek/deepseek-chat-v3.1:free` is meaningless to a different provider's API).

## Error classification (`providers/base.adapter.ts`)

Every adapter's catch block runs errors through `classifyError()`, which turns raw HTTP status codes into semantic `ProviderErrorCode`s (`TIMEOUT`, `AUTH_ERROR`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `ACCOUNT_SUSPENDED`, `INSUFFICIENT_CREDITS`, `NOT_FOUND`, `INVALID_REQUEST`, `SERVER_ERROR`, `UNAVAILABLE`, `UNKNOWN`). This file documents several **non-obvious, provider-specific quirks discovered live** — read the inline comments before touching it:
- Fireworks returns `412` for billing suspension, not `402/403`.
- Groq returns `413` ("request too large") for what is actually a tokens-per-minute rate limit, not an oversized payload.
- Anthropic returns a plain `400` for "insufficient credit balance" rather than `402/403`.
- `404` can mask a suspended account on some providers instead of meaning "model not found."

If you find another provider-specific status-code quirk, add it here with a comment — this is exactly the kind of thing that should live in code once, not get re-explained in every prompt.

## Health scoring (`services/health.service.ts`)

Per-provider rolling state: `healthy | degraded | rate_limited | down | unknown`, based on a 20-call latency window and consecutive-failure count. `ACCOUNT_SUSPENDED`/`INSUFFICIENT_CREDITS` mark a provider `down` immediately (not worth retrying); generic failures need 3 consecutive before going `down`. The router reads this via `isLikelyHealthy()` to reorder (not eliminate) candidates.

## Context compression (`services/context-compression.service.ts`)

This is the token-efficiency layer, and it's already built around principles worth keeping in mind when extending it:
- Triggers at 12,000 estimated tokens (`shouldCompress`); keeps the last 10 messages verbatim, compresses everything older via `splitForCompression`.
- Compression itself is delegated to whichever provider is currently configured/healthy, using a dense structured-markdown prompt that explicitly preserves architecture decisions, API signatures, open TODOs, and requirements while dropping small talk and superseded code.
- Falls back to a naive truncation-based summary (`naiveSummary`) if no provider is available — compression must never hard-fail the request.
- `buildProjectContextBlock()` assembles the persistent per-project memory block (goal, pending/completed tasks, architecture decisions, conventions, unresolved bugs) that gets prepended to conversations — this is the "skill-like" persistent context for a given project inside the gateway itself.

## Database (`src/database/`)

SQLite via `client.ts` + `schema.sql`, migrations in `migrate.ts`. Stores conversations and project memory so state survives restarts. Keep schema changes additive/backward-compatible where feasible.

## Testing

14 Jest test files in `src/__tests__/` (routing, router, health, base-adapter, retry, provider-validation, new-providers, token-clamping, model-validation, analytics, workspace, upload, app, reasoning-model-output). Before changing provider or routing logic:
1. Run the existing suite first to confirm a clean baseline.
2. Test the shared adapter interface/error-classification contract rather than re-testing each provider's internals individually — that's what keeps adding providers cheap.
3. Only touch `frontend/` tests if the change actually affects the dashboard.

## Working conventions for agents in this repo

- Don't re-explain the provider list, routing logic, or error-classification quirks in prompts — they're documented above and in the source comments. Point at the exact file/line/error instead.
- Plan non-trivial changes (new provider, reworking failover behavior, schema migration) in one focused pass; execute in a clean session rather than accumulating context across many small corrections.
- Provider-specific quirks belong in that provider's adapter or in `base.adapter.ts`'s classification logic — never leak them into the shared router.
- If you keep correcting an agent on the same thing in this repo, add it to this file rather than repeating the correction every session.
