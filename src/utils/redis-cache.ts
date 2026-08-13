import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

let client: Redis | null = null;

function redisEnabled(): boolean {
  return env.cacheEnabled && Boolean(env.redisUrl);
}

function getClient(): Redis | null {
  if (!redisEnabled()) return null;
  if (client) return client;

  client = new Redis(env.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });

  client.on('error', (error) => {
    logger.warn('Redis cache error; continuing with local cache fallback', {
      error: error.message,
    });
  });

  return client;
}

async function ensureConnected(redis: Redis): Promise<void> {
  if (redis.status === 'wait') {
    await redis.connect();
  }
}

export async function getRedisCache(key: string): Promise<string | null> {
  const redis = getClient();
  if (!redis) return null;

  try {
    await ensureConnected(redis);
    return await redis.get(key);
  } catch (error) {
    logger.warn('Redis cache read failed; continuing with local cache fallback', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function setRedisCache(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  try {
    await ensureConnected(redis);
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch (error) {
    logger.warn('Redis cache write failed; continuing without shared cache', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteRedisCache(key: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  try {
    await ensureConnected(redis);
    await redis.del(key);
  } catch (error) {
    logger.warn('Redis cache invalidation failed; continuing with local cache', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function closeRedisCache(): void {
  if (!client) return;
  client.disconnect();
  client = null;
}

export const CACHE_KEYS = {
  analyticsSummary: 'ai-gateway:analytics:summary:v1',
  modelValidationPrefix: 'ai-gateway:model-validation:v1:',
} as const;
