import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function optionalNumber(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: optionalNumber('PORT', 4000),

  // Provider API keys — all optional at the env level. Each adapter checks
  // isConfigured() itself, so the gateway degrades gracefully instead of
  // crashing on boot when a key is missing.
  geminiApiKey: optional('GEMINI_API_KEY'),
  anthropicApiKey: optional('ANTHROPIC_API_KEY'),
  openaiApiKey: optional('OPENAI_API_KEY'),
  groqApiKey: optional('GROQ_API_KEY'),
  togetherApiKey: optional('TOGETHER_API_KEY'),
  openrouterApiKey: optional('OPENROUTER_API_KEY'),
  hfApiKey: optional('HF_API_KEY'),
  deepseekApiKey: optional('DEEPSEEK_API_KEY'),
  kimiApiKey: optional('KIMI_API_KEY'),
  cerebrasApiKey: optional('CEREBRAS_API_KEY'),
  mistralApiKey: optional('MISTRAL_API_KEY'),
  cloudflareApiKey: optional('CLOUDFLARE_API_KEY'),
  cloudflareAccountId: optional('CLOUDFLARE_ACCOUNT_ID'),
  fireworksApiKey: optional('FIREWORKS_API_KEY'),
  inferenceApiKey: optional('INFERENCE_API_KEY'),
  nebiusApiKey: optional('NEBIUS_API_KEY'),
  sambanovaApiKey: optional('SAMBANOVA_API_KEY'),
  nvidiaApiKey: optional('NVIDIA_API_KEY'),
  novitaApiKey: optional('NOVITA_API_KEY'),
  basetenApiKey: optional('BASETEN_API_KEY'),
  modelscopeApiKey: optional('MODELSCOPE_API_KEY'),
  aimlapiApiKey: optional('AIMLAPI_API_KEY'),

  redisUrl: optional('REDIS_URL', ''),
  cacheEnabled: optional('CACHE_ENABLED', 'false') === 'true',
  cacheTtlSeconds: optionalNumber('CACHE_TTL_SECONDS', 300),

  databaseUrl: optional('DATABASE_URL', './data/gateway.db'),

  rateLimitWindowMs: optionalNumber('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: optionalNumber('RATE_LIMIT_MAX', 60),

  maxPromptLength: optionalNumber('MAX_PROMPT_LENGTH', 3_500_000),
  requestTimeoutMs: optionalNumber('REQUEST_TIMEOUT_MS', 30_000),
  maxRetries: optionalNumber('MAX_RETRIES', 2),
  gatewayRequestBudgetMs: optionalNumber('GATEWAY_REQUEST_BUDGET_MS', 60_000),

  corsOrigin: optional('CORS_ORIGIN', '*'),
  logLevel: optional('LOG_LEVEL', 'info'),
};

export type Env = typeof env;
