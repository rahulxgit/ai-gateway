import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { PROVIDER_NAMES } from '../types';

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const imageAttachmentSchema = z.object({
  mimeType: z.string().regex(/^image\//, 'mimeType must be an image/* type'),
  // Base64 for a ~15MB image is roughly 20M characters — cap generously
  // above that so legitimate uploads pass but we still bound payload size.
  base64: z.string().min(1).max(25_000_000),
});

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(env.maxPromptLength),
  images: z.array(imageAttachmentSchema).max(6).optional(),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  messages: z.array(chatMessageSchema).min(1).max(200),
  taskType: z
    .enum(['coding', 'reasoning', 'creative', 'fast', 'cheap', 'large-context', 'general'])
    .optional(),
  forceProvider: z
    // Derived from PROVIDER_NAMES (src/types/index.ts) rather than a
    // hand-copied literal list — this is the exact list every adapter is
    // registered under, so a provider can never be "live" in the registry
    // but still rejected here.
    .enum(PROVIDER_NAMES)
    .optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  // 384000 matches DeepSeek's real maxOutputTokens ceiling (the highest of
  // any configured provider — see PRICING_PER_1K_TOKENS/deepseek.adapter.ts).
  // This was previously capped at 65536, which silently rejected valid
  // long-output requests to DeepSeek with a 400 before they ever reached
  // the adapter. Every adapter already clamps maxTokens down to its own
  // real ceiling via Math.min(options.maxTokens ?? default, this.maxOutputTokens),
  // so raising this bound only removes an artificial restriction below what
  // routing already enforces correctly per-provider — it does not allow
  // any adapter to actually exceed its true limit.
  maxTokens: z.number().int().min(1).max(384000).optional(),
  stream: z.boolean().optional(),
});

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// Strips characters commonly used in prompt-injection-via-HTML or control
// sequences from free-text fields before they're persisted or forwarded.
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (typeof req.body === 'object' && req.body !== null) {
    JSON.stringify(req.body); // throws on circular refs before we do anything else
  }
  next();
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // Unused but required: Express only recognizes a handler as an error
  // handler (vs. a normal middleware) if it declares exactly 4 params.
  // No eslint-disable needed here — .eslintrc.json's no-unused-vars rule
  // already has `argsIgnorePattern: "^_"`, which covers this.
  _next: NextFunction
) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled request error', { path: req.path, error: message });

  if (message.includes('All configured providers failed')) {
    return res.status(502).json({ error: 'All providers failed', detail: message });
  }
  if (message.includes('No providers are configured') || message.includes('No vision-capable providers')) {
    return res.status(503).json({ error: message });
  }
  return res.status(500).json({ error: 'Internal server error', detail: message });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}
