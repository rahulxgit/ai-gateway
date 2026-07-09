import { Router } from 'express';
import { getAnalytics } from '../controllers/analytics.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.get('/analytics', asyncHandler(getAnalytics));

export default router;
