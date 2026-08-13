import { Request, Response } from 'express';

jest.mock('../services/orchestrator.service', () => ({
  orchestrateChat: jest.fn(),
  orchestrateChatStream: jest.fn(),
}));
jest.mock('../services/health.service', () => ({
  getHealthSnapshot: jest.fn(),
}));
jest.mock('../providers/registry', () => ({
  listConfiguredProviders: jest.fn(),
  listAllProviders: jest.fn(),
}));
jest.mock('../services/model-validation.service', () => ({
  validateConfiguredModels: jest.fn(),
}));

import { orchestrateChat } from '../services/orchestrator.service';
import { getHealthSnapshot } from '../services/health.service';
import { listConfiguredProviders, listAllProviders } from '../providers/registry';
import { validateConfiguredModels } from '../services/model-validation.service';
import { postChat, getProviders, getHealth, getModelValidation } from '../controllers/chat.controller';

function mockRes() {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('chat.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postChat', () => {
    it('forwards the request body and correlation ID to orchestrateChat and returns its result as JSON', async () => {
      const fakeResult = { sessionId: 's1', content: 'hi', provider: 'gemini', model: 'gemini-3.1-flash-lite' };
      const correlationId = 'test-correlation-id';
      (orchestrateChat as jest.Mock).mockResolvedValue(fakeResult);

      const req = { body: { messages: [{ role: 'user', content: 'hi' }] }, correlationId } as Request;
      const res = mockRes();

      await postChat(req, res);

      expect(orchestrateChat).toHaveBeenCalledWith(req.body, correlationId);
      expect(res.json).toHaveBeenCalledWith(fakeResult);
    });

    it('propagates a rejection from orchestrateChat instead of swallowing it', async () => {
      const err = new Error('All configured providers failed to fulfill the request');
      (orchestrateChat as jest.Mock).mockRejectedValue(err);

      const req = { body: { messages: [{ role: 'user', content: 'hi' }] }, correlationId: 'test-correlation-id' } as Request;
      const res = mockRes();

      await expect(postChat(req, res)).rejects.toThrow(err.message);
    });
  });

  describe('getProviders', () => {
    it('returns configured and all provider lists from the registry', () => {
      (listConfiguredProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic']);
      (listAllProviders as jest.Mock).mockReturnValue(['gemini', 'anthropic', 'openai']);

      const res = mockRes();
      getProviders({} as Request, res);

      expect(res.json).toHaveBeenCalledWith({
        configured: ['gemini', 'anthropic'],
        all: ['gemini', 'anthropic', 'openai'],
      });
    });
  });

  describe('getHealth', () => {
    it('wraps the health snapshot with an ok status', () => {
      const snapshot = [{ provider: 'gemini', status: 'healthy', lastCheckedAt: 'x', consecutiveFailures: 0 }];
      (getHealthSnapshot as jest.Mock).mockReturnValue(snapshot);

      const res = mockRes();
      getHealth({} as Request, res);

      expect(res.json).toHaveBeenCalledWith({ status: 'ok', providers: snapshot });
    });
  });

  describe('getModelValidation', () => {
    it('reports status "ok" when every checked model is available', async () => {
      (validateConfiguredModels as jest.Mock).mockResolvedValue([
        { provider: 'gemini', status: 'available', model: 'gemini-3.1-flash-lite' },
      ]);

      const res = mockRes();
      await getModelValidation({} as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok' })
      );
    });

    it('reports status "warning" when at least one model is unavailable', async () => {
      (validateConfiguredModels as jest.Mock).mockResolvedValue([
        { provider: 'gemini', status: 'available', model: 'gemini-3.1-flash-lite' },
        { provider: 'groq', status: 'unavailable', model: 'old-model', detail: 'not present' },
      ]);

      const res = mockRes();
      await getModelValidation({} as Request, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'warning' })
      );
    });
  });
});
