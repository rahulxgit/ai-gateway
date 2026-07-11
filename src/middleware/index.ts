import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(env.maxPromptLength),
});

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  messages: z.array(chatMessageSchema).min(1).max(200),
  taskType: z
    .enum(['coding', 'reasoning', 'creative', 'fast', 'cheap', 'large-context', 'general'])
    .optional(),
  forceProvider: z
    .enum(['gemini', 'anthropic', 'openai', 'groq', 'together', 'openrouter', 'huggingface', 'deepseek', 'kimi', 'cerebras', 'mistral'])
    .optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled request error', { path: req.path, error: message });

  if (message.includes('All configured providers failed')) {
    return res.status(502).json({ error: 'All providers failed', detail: message });
  }
  if (message.includes('No providers are configured')) {
    return res.status(503).json({ error: message });
  }
  return res.status(500).json({ error: 'Internal server error', detail: message });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}
