import { json, RequestHandler } from 'express';
import type { IncomingMessage } from 'node:http';

const DEFAULT_BODY_LIMIT = '2mb';
const LARGE_BODY_LIMIT = '50mb';

function isChatPath(req: Parameters<RequestHandler>[0]): boolean {
  if (req.method !== 'POST') return false;
  const path = `${req.baseUrl}${req.path}`.replace(/\/$/, '') || '/';
  return path === '/chat' || path === '/chat/stream';
}

function isChatRequest(req: IncomingMessage): boolean {
  if (req.method !== 'POST') return false;
  const path = (req.url ?? '').split('?')[0].replace(/\/$/, '') || '/';
  return path === '/chat' || path === '/chat/stream';
}

function isJsonContentType(req: IncomingMessage): boolean {
  const contentType = req.headers['content-type'];
  if (Array.isArray(contentType)) return contentType.some((value) => value.toLowerCase().startsWith('application/json'));
  return typeof contentType === 'string' && contentType.toLowerCase().startsWith('application/json');
}

/**
 * Parses non-chat JSON requests with the smaller default limit.
 * Chat requests are skipped here and parsed by the route-level 50mb parser.
 */
export const smallJsonBodyParser = json({
  limit: DEFAULT_BODY_LIMIT,
  type: (req) => !isChatRequest(req) && isJsonContentType(req),
});

/** Parser used only by POST /chat and POST /chat/stream. */
export const largeJsonBodyParser = json({ limit: LARGE_BODY_LIMIT });

export { DEFAULT_BODY_LIMIT, LARGE_BODY_LIMIT, isChatPath };
