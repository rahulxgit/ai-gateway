import { Request, Response } from 'express';
import { getAnalyticsSummary, getRecentAnalytics } from '../services/analytics.service';

export function getAnalytics(req: Request, res: Response) {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({
    summary: getAnalyticsSummary(),
    recent: getRecentAnalytics(Number.isFinite(limit) ? limit : 50),
  });
}
