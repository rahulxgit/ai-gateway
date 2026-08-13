import { Router } from 'express';
import { postChat, postChatStream, getProviders, getHealth, getModelValidation } from '../controllers/chat.controller';
import { validateBody, chatRequestSchema } from '../middleware';
import { largeJsonBodyParser } from '../middleware/body-limit';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.post('/chat', largeJsonBodyParser, validateBody(chatRequestSchema), asyncHandler(postChat));
router.post('/chat/stream', largeJsonBodyParser, validateBody(chatRequestSchema), asyncHandler(postChatStream));
router.get('/providers', getProviders);
router.get('/health', getHealth);
router.get('/health/models', asyncHandler(getModelValidation));

export default router;
