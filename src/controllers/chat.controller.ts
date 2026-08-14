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

export async function getHealth(_req: Request, res: Response) {
  // Vercel/serverless instances may stop execution after the response is
  // sent, so the live probe must be awaited rather than fire-and-forget.
  // refreshProviderHealth() caches the result for two minutes and shares a
  // single in-flight refresh across concurrent dashboard polls.
  try {
    await refreshProviderHealth();
  } catch (err) {
    logger.warn('Provider health refresh failed', { error: String(err) });
  }

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
