# Graph Report - ai-gateway  (2026-08-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 724 nodes · 1562 edges · 38 communities (28 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `19ed1683`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- registry.ts
- orchestrator.service.ts
- types/index.ts
- App.tsx
- dependencies
- router.service.ts
- project-memory.service.ts
- compilerOptions
- model-validation.service.ts
- middleware/index.ts
- project.controller.ts
- compilerOptions
- .eslintrc.json
- compilerOptions
- devDependencies
- frontend/package.json
- devDependencies
- plugins
- @types/node
- frontend/tsconfig.json
- express.d.ts
- @types/supertest
- eslint-config-prettier
- supertest
- @types/cors
- @types/express
- @types/jest
- @types/multer
- @typescript-eslint/parser

## God Nodes (most connected - your core abstractions)
1. `OpenAICompatibleAdapter` - 58 edges
2. `Env` - 37 edges
3. `ProviderName` - 24 edges
4. `compilerOptions` - 20 edges
5. `compilerOptions` - 18 edges
6. `getProjectMemory()` - 17 edges
7. `updateProjectMemory()` - 16 edges
8. `compilerOptions` - 15 edges
9. `orchestrateChat()` - 14 edges
10. `ProviderAdapterOptions` - 13 edges

## Surprising Connections (you probably didn't know these)
- `exclude` --extends--> `frontend`  [EXTRACTED]
  tsconfig.eslint.json → .eslintrc.json
- `exclude` --extends--> `node_modules`  [EXTRACTED]
  tsconfig.eslint.json → .eslintrc.json
- `exclude` --extends--> `frontend`  [EXTRACTED]
  tsconfig.json → .eslintrc.json
- `exclude` --extends--> `node_modules`  [EXTRACTED]
  tsconfig.json → .eslintrc.json
- `OpenAICompatibleAdapter` --implements--> `ProviderAdapter`  [EXTRACTED]
  src/providers/openai-compatible.adapter.ts → src/types/index.ts

## Import Cycles
- None detected.

## Communities (38 total, 10 thin omitted)

### Community 0 - "registry.ts"
Cohesion: 0.06
Nodes (32): Env, AimlapiAdapter, BasetenAdapter, CerebrasAdapter, CloudflareAdapter, DeepSeekAdapter, FireworksAdapter, GeminiAdapter (+24 more)

### Community 1 - "orchestrator.service.ts"
Cohesion: 0.08
Nodes (52): getAnalytics(), getSessionMessages(), getSessions(), postSession(), removeSession(), db, runMigrations(), router (+44 more)

### Community 2 - "types/index.ts"
Cohesion: 0.07
Nodes (35): AnthropicAdapter, splitSystem(), toAnthropicMessages(), classifyError(), createSseFrameParser(), estimateCost(), estimateTokens(), HuggingFaceAdapter (+27 more)

### Community 3 - "App.tsx"
Cohesion: 0.10
Nodes (36): App(), STARTER_PROMPTS, AnalyticsPanel(), CodeBlock(), extractText(), Composer(), PendingAttachment, HealthBar() (+28 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (46): axios, cors, dotenv, express, express-rate-limit, helmet, ioredis, multer (+38 more)

### Community 5 - "router.service.ts"
Cohesion: 0.10
Nodes (35): buildProviderOrder(), DEFAULT_FAILOVER_ORDER, FREE_AUTO_PROVIDERS, FREE_MODEL_IDS, isFreeModel(), PRICING_PER_1K_TOKENS, TASK_ROUTING, OPENROUTER_FREE_MODEL (+27 more)

### Community 6 - "project-memory.service.ts"
Cohesion: 0.09
Nodes (36): postUpload(), addPendingTasks(), completeTask(), createProject(), emptyMemory(), getProjectMemory(), listProjects(), persist() (+28 more)

### Community 7 - "compilerOptions"
Cohesion: 0.05
Nodes (39): ignorePatterns, dist, frontend, node_modules, coverage, ES2021, src/__tests__, ./tsconfig.json (+31 more)

### Community 8 - "model-validation.service.ts"
Cohesion: 0.12
Nodes (30): getHealth(), getModelValidation(), getProviders(), postChat(), postChatStream(), validateBody(), listAllProviders(), listConfiguredProviders() (+22 more)

### Community 9 - "middleware/index.ts"
Cohesion: 0.10
Nodes (27): createApp(), isChatRequest(), isJsonContentType(), largeJsonBodyParser, smallJsonBodyParser, apiChatRateLimiter, apiRateLimiter, apiReadRateLimiter (+19 more)

### Community 10 - "project.controller.ts"
Cohesion: 0.12
Nodes (13): getProject(), getProjects(), patchBugResolve(), patchConventions(), patchCurrentTask(), patchProject(), patchUserPreference(), postArchitectureDecision() (+5 more)

### Community 11 - "compilerOptions"
Cohesion: 0.08
Nodes (23): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+15 more)

### Community 12 - ".eslintrc.json"
Cohesion: 0.09
Nodes (22): env, es2021, jest, node, extends, warn, parser, parserOptions (+14 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+11 more)

### Community 14 - "devDependencies"
Cohesion: 0.11
Nodes (19): autoprefixer, devDependencies, autoprefixer, oxlint, postcss, tailwindcss, @tailwindcss/typography, @types/react (+11 more)

### Community 15 - "frontend/package.json"
Cohesion: 0.11
Nodes (18): dependencies, react, react-dom, react-markdown, remark-gfm, name, private, scripts (+10 more)

### Community 16 - "devDependencies"
Cohesion: 0.11
Nodes (19): eslint, jest, nodemon, devDependencies, eslint, jest, nodemon, prettier (+11 more)

### Community 17 - "plugins"
Cohesion: 0.18
Nodes (10): warn, plugins, rules, react/only-export-components, react/rules-of-hooks, $schema, typescript, typescript (+2 more)

### Community 18 - "@types/node"
Cohesion: 0.67
Nodes (3): @types/node, @types/node, @types/node

## Knowledge Gaps
- **198 isolated node(s):** `AnalyticsSummary`, `SessionRow`, `ArchitectureDecision`, `BugRecord`, `CommitSummary` (+193 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `dependencies`, `plugins`, `@types/node`, `@types/supertest`, `eslint-config-prettier`, `supertest`, `@types/cors`, `@types/express`, `@types/jest`, `@types/multer`, `@typescript-eslint/parser`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `ProviderName` connect `router.service.ts` to `registry.ts`, `orchestrator.service.ts`, `types/index.ts`, `project-memory.service.ts`, `model-validation.service.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `AnalyticsSummary`, `SessionRow`, `ArchitectureDecision` to the rest of the system?**
  _198 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `registry.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06224899598393574 - nodes in this community are weakly interconnected._
- **Should `orchestrator.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07660455486542443 - nodes in this community are weakly interconnected._
- **Should `types/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06558118498417007 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09725490196078432 - nodes in this community are weakly interconnected._