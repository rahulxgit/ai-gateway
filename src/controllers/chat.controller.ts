import { Request, Response } from 'express';
import { orchestrateChat, orchestrateChatStream } from '../services/orchestrator.service';
import { getHealthSnapshot, refreshProviderHealth } from '../services/health.service';
import { listConfiguredProviders, listAllProviders } from '../providers/registry';
import { validateConfiguredModels } from '../services/model-validation.service';
import { logger } from '../utils/logger';

export async function postChat(req: Request, res: Response) {
  const result = await orchestrateChat(req.body, req.correlationId);
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
    }, req.correlationId);
    res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
  } catch (err) {
    logger.error('Stream failed', { correlationId: req.correlationId, error: (err as Error).message });
    res.write(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`);
  } finally {
    res.end();
  }
}

export function getProviders(_req: Request, res: Response) {
  res.json({
    configured: listConfiguredProviders(),
    all: listAllProviders(),
  });
}

export function getHealth(_req: Request, res: Response) {
  // Do not block the health request on 20+ provider API calls. The first
  // response returns the current snapshot immediately, while a single
  // cached refresh runs in the background and subsequent polls observe the
  // real results. This works for Vercel/serverless instances as well as a
  // long-running Node process.
  void refreshProviderHealth().catch((err) => {
    logger.warn('Provider health refresh failed', { error: String(err) });
  });

  res.json({
    status: 'ok',
    providers: getHealthSnapshot(),
  });
}

export async function getModelValidation(_req: Request, res: Response) {
  const results = await validateConfiguredModels();
  res.json({
    status: results.some((r) => r.status === 'unavailable') ? 'warning' : 'ok',
    results,
  });
}
