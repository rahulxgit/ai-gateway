# Render Deployment Guide

This page documents the environment variables and storage considerations for deploying AI Gateway on Render.

## Required environment variables

Set at least one provider API key. You do not need to configure every provider.

```text
GEMINI_API_KEY=<your-key>
# or another supported provider key
```

Recommended production runtime settings:

```text
NODE_ENV=production
LOG_LEVEL=info
CORS_ORIGIN=https://your-frontend.example.com
```

Render provides a `PORT` value for web services. The application reads `PORT` when it is supplied and otherwise falls back to its local default.

## Request protection

The gateway already has production hardening defaults, but these can be tuned in Render:

```text
GATEWAY_REQUEST_BUDGET_MS=60000
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=2
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
MAX_PROMPT_LENGTH=3500000
```

`GATEWAY_REQUEST_BUDGET_MS` is the total wall-clock budget shared across the provider failover chain.

## Optional 24-hour cost guard

Disabled by default:

```text
DAILY_COST_BUDGET_USD=0
```

Set it to a positive number to limit estimated spend in the rolling 24-hour window, for example:

```text
DAILY_COST_BUDGET_USD=10
```

When the budget is exceeded, chat requests are rejected with HTTP `429`.

## Optional Redis L2 cache

Redis is disabled by default. To enable the shared cache:

```text
CACHE_ENABLED=true
CACHE_TTL_SECONDS=300
REDIS_URL=<your-Redis-compatible-connection-url>
```

Cache flow:

```text
L1 in-process cache
      ↓ miss
L2 Redis
      ↓ miss / Redis unavailable
SQLite or provider API
```

Redis is best-effort. A Redis outage does not make analytics or model validation fail.

On Render, a managed Key Value service can provide a Redis-compatible shared cache.

## SQLite persistence

The default database configuration is:

```text
DATABASE_URL=./data/gateway.db
```

Render's service filesystem is ephemeral by default. If you want SQLite data to survive restarts and deploys, attach a Render persistent disk and place the database under that disk's mount path, for example:

```text
DATABASE_URL=/var/data/gateway.db
```

Mount the persistent disk at `/var/data`.

A persistent disk is tied to a single service instance, so it is not appropriate for horizontally scaling the SQLite-backed application. For multi-instance production, move persistent application data to a managed database.

## Recommended Render checklist

```text
NODE_ENV=production
<at least one provider API key>=<secret>
CORS_ORIGIN=https://your-frontend.example.com
LOG_LEVEL=info
GATEWAY_REQUEST_BUDGET_MS=60000
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=2
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60
DAILY_COST_BUDGET_USD=0

# Redis (optional)
CACHE_ENABLED=false
CACHE_TTL_SECONDS=300
REDIS_URL=

# SQLite
DATABASE_URL=./data/gateway.db
```

If you enable Redis:

```text
CACHE_ENABLED=true
REDIS_URL=<your-Redis-compatible-connection-url>
```

If you attach a persistent disk for SQLite:

```text
DATABASE_URL=/var/data/gateway.db
```
