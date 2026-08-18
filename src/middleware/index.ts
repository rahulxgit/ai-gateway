import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { PROVIDER_NAMES } from '../types';
import { GatewayRequestBudgetExceededError } from '../services/router.service';
import { DailyCostBudgetExceededError } from '../services/orchestrator.service';

const requestPath = (req: Request): string => `${req.baseUrl}${req.path}`.replace(/\/$/, '') || '/';
const isChatRequest = (req: Request): boolean => req.method === 'POST' && (requestPath(req) === '/chat' || requestPath(req) === '/chat/stream');
const isGenerousReadRequest = (req: Request): boolean => req.method === 'GET' && (requestPath(req) === '/health' || requestPath(req) === '/providers');

export const apiRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isChatRequest(req) || isGenerousReadRequest(req),
  message: { error: 'Too many requests, please slow down.' },
});

export const apiReadRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isGenerousReadRequest(req),
  message: { error: 'Too many requests, please slow down.' },
});

export const apiChatRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isChatRequest(req),
  message: { error: 'Too many chat requests, please slow down.' },
});

const imageAttachmentSchema = z.object({
  mimeType: z.string().regex(/^image\//, 'mimeType must be an image/* type'),
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
  taskType: z.enum(['coding', 'reasoning', 'creative', 'fast', 'cheap', 'large-context', 'general']).optional(),
  forceProvider: z.enum(PROVIDER_NAMES).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(384000).optional(),
  stream: z.boolean().optional(),
  freeOnly: z.boolean().optional(),
});

export function requestCorrelationId(req: Request, res: Response, next: NextFunction) {
  const correlationId = uuidv4();
  req.correlationId = correlationId;
  res.setHeader('X-Request-ID', correlationId);
  next();
}

export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid request body', details: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (typeof req.body === 'object' && req.body !== null) JSON.stringify(req.body);
  next();
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('Unhandled request error', { correlationId: req.correlationId, path: req.path, error: message });

  const parserError = err as { type?: string; status?: number; statusCode?: number };
  if (parserError.type === 'entity.too.large' || parserError.status === 413 || parserError.statusCode === 413) {
    return res.status(413).json({ error: 'Request body too large' });
  }
  if (err instanceof DailyCostBudgetExceededError) return res.status(429).json({ error: message });
  if (err instanceof GatewayRequestBudgetExceededError) return res.status(504).json({ error: message });
  if (message.includes('All configured providers failed') || message.includes('All eligible providers failed')) {
    return res.status(502).json({ error: 'All providers failed', detail: message });
  }
  if (
    message.includes('No providers are configured') ||
    message.includes('No free automatic providers') ||
    message.includes('No free or paid providers') ||
    message.includes('No vision-capable providers') ||
    message.includes('Forced provider')
  ) {
    return res.status(503).json({ error: message });
  }
  return res.status(500).json({ error: 'Internal server error', detail: message });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}
