import { Request, Response } from 'express';
import { orchestrateChat, orchestrateChatStream } from '../services/orchestrator.service';
import { getHealthSnapshot } from '../services/health.service';
import { listConfiguredProviders } from '../providers/registry';
import { logger } from '../utils/logger';

export async function postChat(req: Request, res: Response) {
  const result = await orchestrateChat(req.body);
  res.json(result);
}

export async function postChatStream(req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const result = await orchestrateChatStream(req.body, (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });
    res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
  } catch (err) {
    logger.error('Stream failed', { error: (err as Error).message });
    res.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
  } finally {
    res.end();
  }
}

export function getProviders(_req: Request, res: Response) {
  res.json({
    configured: listConfiguredProviders(),
    all: ['gemini', 'anthropic', 'openai', 'groq', 'together', 'openrouter', 'huggingface'],
  });
}

export function getHealth(_req: Request, res: Response) {
  res.json({ status: 'ok', providers: getHealthSnapshot() });
}
