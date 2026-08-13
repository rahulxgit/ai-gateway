import { Router } from 'express';
import { json } from 'express';
import { postChat, postChatStream, getProviders, getHealth, getModelValidation } from '../controllers/chat.controller';
import { validateBody, chatRequestSchema } from '../middleware';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

const chatJson = json({ limit: '50mb' });

router.post('/chat', chatJson, validateBody(chatRequestSchema), asyncHandler(postChat));
router.post('/chat/stream', chatJson, validateBody(chatRequestSchema), asyncHandler(postChatStream));
router.get('/providers', getProviders);
router.get('/health', getHealth);
router.get('/health/models', asyncHandler(getModelValidation));

export default router;
