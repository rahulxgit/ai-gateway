import { Request, Response } from 'express';
import {
  listSessions,
  deleteSession,
  getSessionHistory,
  createSession,
} from '../services/conversation.service';

export function getSessions(_req: Request, res: Response) {
  res.json(listSessions());
}

export function postSession(req: Request, res: Response) {
  const title = typeof req.body?.title === 'string' ? req.body.title : undefined;
  res.status(201).json(createSession(title));
}

export function getSessionMessages(req: Request, res: Response) {
  res.json(getSessionHistory(req.params.id));
}

export function removeSession(req: Request, res: Response) {
  deleteSession(req.params.id);
  res.status(204).send();
}
