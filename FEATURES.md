# AI Gateway Features

This document outlines the core capabilities of the AI Gateway.

## Multi-LLM Routing & Failover
- **Intelligent Routing**: Tries providers in a task-aware priority order.
- **Automatic Failover**: Seamlessly fails over to the next provider on rate limits, quota errors, timeouts, or outages.
- **Provider Adapters**: Supports 11 LLM providers behind a single API (Gemini, Anthropic, OpenAI, Groq, Together AI, OpenRouter, Hugging Face, DeepSeek, Kimi, Cerebras, Mistral).
- **Transient Error Retry**: Retries transient errors with exponential backoff before failing over.
- **Token Clamping**: Automatically caps the `maxTokens` requested to each provider's verified real ceiling.

## Context & Memory
- **Persistent Project Context**: Every file write, task, bug, and conversation turn is stored in SQLite.
- **Version History**: Full history of workspace files with undo/revert functionality.
- **Snapshots**: Support for named, point-in-time project snapshots.
- **Automatic Context Injection**: Orchestrator reloads project memory, conversation history, and relevant files, injecting them into the context before every LLM call, ensuring continuity across failovers.
- **Session Management**: Chat sessions are persisted server-side.

## File & Image Support
- **Document Processing**: Upload PDFs, DOCX, and text files. Text is automatically extracted and injected into the conversation context and saved to the project workspace.
- **Vision/Image Capabilities**: Pass images to vision-capable providers (Gemini, Anthropic, OpenAI). The router automatically restricts image-bearing requests to supported providers.

## Frontend Dashboard
- **React-based UI**: Technical "control room" aesthetic for managing conversations and features.
- **Live Routing Chain**: Visual representation of the failover chain for every message.
- **Live Provider Health Bar**: Real-time polling of provider health/latency (green/amber/red statuses).
- **Analytics Panel**: Tracks total requests, success rate, failover count, cost, and per-provider breakdown.
- **Project Switcher**: Easily attach conversations to specific project contexts.
- **Configuration Controls**: Dropdowns for task types, provider forcing, and free-tier model selection (e.g., via OpenRouter).

## API Capabilities
- **Chat & Streaming**: `/chat` and `/chat/stream` endpoints for standard and SSE-streamed requests.
- **Health & Provider Status**: `/health` and `/providers` endpoints for monitoring.
- **Analytics Data**: `/analytics` endpoint for usage, cost, and success metrics.
- **Project & File Management**: Full CRUD operations for projects, workspace files, and snapshots.
- **Context Handling**: `MAX_PROMPT_LENGTH` configurable (default ~3.5M chars), capable of handling very large codebase pastes.