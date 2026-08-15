import { Router } from 'express';
import {
  getSessions,
  postSession,
  getSessionMessages,
  removeSession,
} from '../controllers/session.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get('/sessions', asyncHandler(getSessions));
router.post('/sessions', asyncHandler(postSession));
router.get('/sessions/:id/messages', asyncHandler(getSessionMessages));
router.delete('/sessions/:id', asyncHandler(removeSession));
// Deprecated: the singular /session/:id path was inconsistent with every
// other route in this file (all plural /sessions...). Kept as an alias to
// the same handler so any existing caller hitting this path directly
// (outside the frontend, which has been updated to use /sessions/:id)
// doesn't break. Safe to remove in a future cleanup once confirmed unused.
router.delete('/session/:id', asyncHandler(removeSession));

export default router;
