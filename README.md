# AI Gateway — Multi-LLM Router with Automatic Failover

A production-ready gateway that routes chat requests across multiple LLM providers, automatically failing over on rate limits, quota errors, timeouts, or outages — without losing conversation or project context.

## Why this exists

Single-provider apps break when a provider rate-limits, goes down, or runs out of quota. This gateway sits in front of configured providers behind one API, so applications can keep working even when an individual provider is unavailable.

## Architecture

```text
Client
  │
  ▼
Express API ──▶ AI Orchestrator ──▶ Router (failover engine)
                      │                    │
                      │                    ▼
                      │             Provider Adapters
                      │        (Gemini / Anthropic / OpenAI /
                      │         Groq / Together / OpenRouter / ...)
                      ▼
             Persistent Project Context
       (SQLite: sessions, messages, projects,
        files, edit history, snapshots, analytics)
```

- **Provider adapters** (`src/providers/`) implement the shared `ProviderAdapter` interface.
- **Router** (`src/services/router.service.ts`) applies task-aware provider ordering, retries transient failures, and fails over to another provider when appropriate.
- **Orchestrator** (`src/services/orchestrator.service.ts`) restores conversation history, project memory, and relevant workspace context before routing a request.
- **Persistent project context** stores sessions, messages, projects, files, edit history, snapshots, and analytics in SQLite.

## Quick start

```bash
git clone https://github.com/rahulxgit/ai-gateway.git
cd ai-gateway
npm install
cp .env.example .env
# edit .env and add at least one provider API key
npm run migrate
npm run dev
```

The backend starts on `http://localhost:4000`. Use `GET /health` to confirm it is running.

### Docker

```bash
cp .env.example .env
# add your provider keys
docker compose up --build
```

This starts the gateway together with Redis for optional response caching.

## Configuration

Configuration is provided through environment variables; see `.env.example` for the full list. At least one provider key is enough to run the gateway. Unconfigured providers are reported as unavailable and skipped by routing.

### Provider support

The gateway currently contains adapters for Gemini, Anthropic, OpenAI, Groq, Together AI, OpenRouter, Hugging Face, DeepSeek, Kimi (Moonshot AI), Cerebras, Mistral, Cloudflare Workers AI, Fireworks AI, Inference.net, Nebius AI Studio, SambaNova Cloud, NVIDIA NIM, Novita AI, Baseten, ModelScope, and AI/ML API.

Provider availability, model identifiers, rate limits, and free-tier terms can change over time. Treat the adapter defaults and the project's verification notes as the source of truth for the current implementation rather than assuming every provider offers a permanent free tier.

### Routing

Task-based routing (`taskType: "coding"`, `"reasoning"`, etc.) selects a preferred provider order. Health information can influence that ordering, and retryable failures trigger automatic failover.

Provider-specific adapters clamp requested `maxTokens` to their configured ceiling. When a request omits `maxTokens`, the backend uses its conservative default rather than automatically requesting each provider's entire output ceiling.

## Using the gateway as an API

Point your application at the gateway's API base URL and use the same JSON request structure for chat calls.

For local development:

```text
http://localhost:4000
```

For the project's currently deployed backend, see `PROJECT_OVERVIEW.md` and your deployment configuration rather than copying a production endpoint into application code without verifying that it is still active.

### cURL

```bash
curl -X POST http://localhost:4000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Write a short poem about a server that never goes down."
      }
    ],
    "taskType": "creative"
  }'
```

### Python

```python
import requests

API_BASE = "http://localhost:4000"

payload = {
    "messages": [{"role": "user", "content": "Explain async/await in JavaScript."}],
    "taskType": "coding",
}

response = requests.post(f"{API_BASE}/chat", json=payload, timeout=60)
response.raise_for_status()

print(response.json()["message"]["content"])
```

### Node.js

```javascript
const API_BASE = "http://localhost:4000";

async function chatWithGateway(userMessage) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: userMessage }],
      taskType: "reasoning",
    }),
  });

  if (!response.ok) {
    throw new Error(`Gateway error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log(data.message.content);
  console.log(data.metadata?.chain);
}

chatWithGateway("What are the architectural benefits of the actor model?");
```

## Request examples

### Basic chat

```json
{
  "messages": [
    { "role": "user", "content": "Hello, world!" }
  ]
}
```

### Force a provider

```json
{
  "messages": [
    { "role": "user", "content": "Give me a code review." }
  ],
  "forceProvider": "anthropic"
}
```

### Multi-turn conversation

```json
{
  "sessionId": "a1b2c3d4-e5f6-7890",
  "messages": [
    { "role": "user", "content": "Can you explain that last point in more detail?" }
  ]
}
```

### Response controls

```json
{
  "messages": [
    { "role": "user", "content": "Write 5 unusual names for a pet cat." }
  ],
  "temperature": 0.9,
  "maxTokens": 200
}
```

## Useful endpoints

- `GET /health` — health and latency information for configured providers.
- `GET /health/models` — checks configured default models against provider catalogs when supported.
- `GET /providers` — lists providers known to the gateway and their current configuration state.
- `GET /analytics` — usage, cost, success, and failover statistics.
- `POST /uploads` — upload documents or images for extraction/vision workflows.
- `GET /projects` — list persistent projects.

## Project context

The gateway keeps durable context in SQLite so failover does not require the client to rebuild its state. Sessions and messages are persisted alongside project goals, tasks, decisions, workspace files, edit history, and snapshots.

For architecture details, known bugs, provider verification notes, current deployment information, and operational lessons learned, see [`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).

## Development

Run the main checks before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

The exact scripts available in a checkout are defined by `package.json`; some repository-specific checks may also be documented in `PROJECT_OVERVIEW.md`.

## Security note

Do not expose a deployment to the public internet without reviewing authentication, CORS, rate limiting, provider quota exposure, logging, and secret management. Never commit provider API keys or other credentials to the repository.

## Contributing

Create a feature or fix branch from `main`, keep changes focused, run the relevant test/build checks, and open a pull request describing the problem, the change, and verification results.
