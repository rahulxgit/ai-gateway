# Render Deployment Guide

This document describes the current environment, persistence, Redis, and hardening settings for the AI Gateway backend on Render.

## 1. Required configuration

Set **at least one provider API key**. You do not need to configure every provider.

```text
GEMINI_API_KEY=<your-key>
# or another supported provider key
```

Recommended production settings:

```text
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.example.com
```

Render supplies `PORT` for the web service. The application uses it when present and falls back to its local default when it is not.

## 2. Request protection

The current defaults are:

```text
GATEWAY_REQUEST_BUDGET_MS=60000
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=2
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
MAX_PROMPT_LENGTH=3500000
DAILY_COST_BUDGET_USD=0
```

`GATEWAY_REQUEST_BUDGET_MS` is the total wall-clock budget shared by the provider failover chain. It is separate from the timeout applied to an individual provider request.

`DAILY_COST_BUDGET_USD=0` disables the rolling 24-hour spend guard. Set a positive amount to reject new chat requests with HTTP `429` after the configured rolling 24-hour estimated spend has been reached.

## 3. Rate limits and request-body limits

The current HTTP protection is intentionally split:

```text
GET /health
GET /providers
    → generous read limiter (300 requests per window)

POST /chat
POST /chat/stream
    → stricter chat limiter (RATE_LIMIT_MAX per window)

Other API routes
    → normal API limiter (RATE_LIMIT_MAX per window)
```

JSON body parsing is also split:

```text
Normal JSON routes
    → 2 MB

POST /chat
POST /chat/stream
    → 50 MB
```

The large chat parser exists to preserve existing vision/image payloads. The current chat schema uses `messages[].images[]` with base64 image attachments.

The upload endpoint retains its own Multer file-size handling; the 2 MB JSON parser does not replace upload-specific limits.

Requests that exceed the applicable JSON limit return HTTP `413`.

## 4. Redis L2 cache (optional)

Redis is disabled by default. The cache hierarchy is:

```text
L1 in-process cache
       ↓ miss
L2 Redis
       ↓ miss / Redis unavailable
normal SQLite/provider operation
```

Enable it with:

```text
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
REDIS_URL=<your-Redis-compatible-connection-url>
```

Default values:

```text
CACHE_ENABLED=false
CACHE_TTL_SECONDS=300
REDIS_URL=
```

Redis is best-effort. If Redis is unavailable, analytics/model-validation operations continue through their existing fallback paths instead of making the API unavailable.

When graceful shutdown is triggered, the optional Redis client is closed as part of the shutdown sequence.

## 5. SQLite persistence

The application defaults to:

```text
DATABASE_URL=./data/gateway.db
```

The Docker image creates `/app/data` and runs the application as the non-root `gateway` user with ownership of that directory.

### Recommended Render persistent-disk setup

If you want SQLite to survive instance replacement/redeploys:

1. Add a Render persistent disk to the backend service.
2. Mount the disk at:

```text
/app/data
```

3. Set:

```text
DATABASE_URL=/app/data/gateway.db
```

Do **not** use `/var/data` with the current image unless you explicitly create that directory and make it writable by the `gateway` user. The service failed to start previously when `/var/data` was configured because the non-root process could not create that directory.

A Render persistent disk is tied to one service instance. This SQLite architecture therefore should not be horizontally scaled by simply adding multiple service instances. For multi-instance production, move persistent application data to a managed database.

## 6. Logging

Production logging is stdout-oriented. The application does not depend on a persistent filesystem log directory for normal production logging.

This is intentional for Render deployments and makes logs available through the platform log stream.

## 7. Graceful shutdown

The backend handles `SIGTERM` and `SIGINT` by:

```text
signal
  ↓
stop accepting new HTTP connections
  ↓
drain active requests
  ↓
close Redis when enabled
  ↓
close SQLite
```

A bounded fallback prevents a stuck connection from keeping the service alive indefinitely.

## 8. Correlation IDs

Every incoming HTTP request receives a UUID in:

```text
X-Request-ID: <uuid>
```

The correlation ID is also passed into relevant router, orchestrator, health, and error logs for request tracing.

## 9. Recommended Render environment

Use the following as a starting point and replace secrets/URLs with your real values:

```text
NODE_ENV=production
PORT=<Render-provided or omitted>

# At least one provider key
GEMINI_API_KEY=<secret>

# Frontend
CORS_ORIGIN=https://your-frontend.example.com
LOG_LEVEL=info

# Request protection
GATEWAY_REQUEST_BUDGET_MS=60000
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=2
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
MAX_PROMPT_LENGTH=3500000
DAILY_COST_BUDGET_USD=0

# Optional Redis
CACHE_ENABLED=false
CACHE_TTL_SECONDS=300
REDIS_URL=

# SQLite — use the mounted persistent-disk path when a disk is attached
DATABASE_URL=/app/data/gateway.db
```

If you are not using a Render persistent disk yet, the code default is:

```text
DATABASE_URL=./data/gateway.db
```

but SQLite data can be lost when Render replaces the service filesystem.

## 10. Deployment checklist

Before deploying:

- At least one provider API key is present.
- `CORS_ORIGIN` points to the real frontend origin(s).
- `CACHE_ENABLED` is `true` only when a working `REDIS_URL` is available.
- `DATABASE_URL` points into the mounted persistent disk when SQLite persistence is required.
- The persistent disk mount path is `/app/data` for the current Docker image.
- Run `GET /health` after deployment and inspect startup logs if a provider is unavailable.
- Run `GET /health/models` to validate configured provider model availability.
