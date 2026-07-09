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
router.delete('/session/:id', asyncHandler(removeSession));

export default router;
