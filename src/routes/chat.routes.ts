import { Router } from 'express';
import { postChat, postChatStream, getProviders, getHealth } from '../controllers/chat.controller';
import { validateBody, chatRequestSchema } from '../middleware';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.post('/chat', validateBody(chatRequestSchema), asyncHandler(postChat));
router.post('/chat/stream', validateBody(chatRequestSchema), asyncHandler(postChatStream));
router.get('/providers', getProviders);
router.get('/health', getHealth);

export default router;
