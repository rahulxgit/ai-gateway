import { json, RequestHandler } from 'express';

const DEFAULT_BODY_LIMIT = '2mb';
const LARGE_BODY_LIMIT = '50mb';

function hasImagePayload(req: Parameters<RequestHandler>[0]): boolean {
  const body = req.body;
  if (!body || !Array.isArray(body.messages)) return false;

  return body.messages.some(
    (message: unknown) =>
      typeof message === 'object' &&
      message !== null &&
      'image' in message &&
      typeof (message as { image?: unknown }).image === 'string' &&
      (message as { image: string }).image.length > 0
  );
}

/**
 * Parses normal JSON requests with a small default limit, while allowing
 * image-bearing chat requests to use the existing large limit.
 *
 * Note: Express's JSON parser runs before req.body exists, so this middleware
 * cannot inspect a parsed body to choose its limit. The route-level parser
 * must therefore be used for chat requests; this handler is intended for
 * non-chat JSON traffic only.
 */
export const smallJsonBodyParser = json({ limit: DEFAULT_BODY_LIMIT });

export const largeJsonBodyParser = json({ limit: LARGE_BODY_LIMIT });

export { DEFAULT_BODY_LIMIT, LARGE_BODY_LIMIT, hasImagePayload };
