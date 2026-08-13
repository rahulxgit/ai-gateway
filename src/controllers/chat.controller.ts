import { Request, Response } from 'express';
import { orchestrateChat, orchestrateChatStream } from '../services/orchestrator.service';
import { getHealthSnapshot } from '../services/health.service';
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
  res.json({ status: 'ok', providers: getHealthSnapshot() });
}

// On-demand version of the startup model-deprecation check, so a
// deprecation can be caught by hitting this endpoint (or a cron/uptime
// pinger) instead of waiting for the next deploy/restart to notice.
export async function getModelValidation(_req: Request, res: Response) {
  const results = await validateConfiguredModels();
  res.json({
    status: results.some((r) => r.status === 'unavailable') ? 'warning' : 'ok',
    results,
  });
}
