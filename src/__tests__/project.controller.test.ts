import { Request, Response } from 'express';

jest.mock('../services/project-memory.service');
jest.mock('../services/workspace.service');

import * as projectMemory from '../services/project-memory.service';
import {
  postProject,
  getProjects,
  getProject,
  patchProject,
  postTaskComplete,
  postArchitectureDecision,
} from '../controllers/project.controller';

function mockRes() {
  const res: Partial<Response> = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('project.controller', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('postProject', () => {
    it('creates a project and returns 201 with the created memory', () => {
      const memory = { projectId: 'p1', name: 'My App', goal: 'ship it' };
      (projectMemory.createProject as jest.Mock).mockReturnValue(memory);

      const req = { body: { name: 'My App', goal: 'ship it' } } as Request;
      const res = mockRes();

      postProject(req, res);

      expect(projectMemory.createProject).toHaveBeenCalledWith('My App', 'ship it');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(memory);
    });

    it('rejects with 400 when name is missing, without calling the service', () => {
      const req = { body: { goal: 'no name here' } } as Request;
      const res = mockRes();

      postProject(req, res);

      expect(projectMemory.createProject).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'name is required' });
    });

    it('defaults goal to an empty string when omitted', () => {
      (projectMemory.createProject as jest.Mock).mockReturnValue({ projectId: 'p2', name: 'No Goal', goal: '' });
      const req = { body: { name: 'No Goal' } } as Request;
      const res = mockRes();

      postProject(req, res);

      expect(projectMemory.createProject).toHaveBeenCalledWith('No Goal', '');
    });
  });

  describe('getProjects', () => {
    it('returns the full project list', () => {
      const list = [{ projectId: 'p1', name: 'A' }, { projectId: 'p2', name: 'B' }];
      (projectMemory.listProjects as jest.Mock).mockReturnValue(list);

      const res = mockRes();
      getProjects({} as Request, res);

      expect(res.json).toHaveBeenCalledWith(list);
    });
  });

  describe('getProject', () => {
    it('returns the project memory when found', () => {
      const memory = { projectId: 'p1', name: 'Found Me' };
      (projectMemory.getProjectMemory as jest.Mock).mockReturnValue(memory);

      const req = { params: { id: 'p1' } } as unknown as Request;
      const res = mockRes();

      getProject(req, res);

      expect(res.json).toHaveBeenCalledWith(memory);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('returns 404 when the project does not exist', () => {
      (projectMemory.getProjectMemory as jest.Mock).mockReturnValue(null);

      const req = { params: { id: 'missing' } } as unknown as Request;
      const res = mockRes();

      getProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found' });
    });
  });

  describe('patchProject', () => {
    it('returns the updated memory on success', () => {
      const updated = { projectId: 'p1', name: 'Renamed' };
      (projectMemory.updateProjectMemory as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { name: 'Renamed' } } as unknown as Request;
      const res = mockRes();

      patchProject(req, res);

      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('returns 404 with the error message when the service throws (project not found)', () => {
      (projectMemory.updateProjectMemory as jest.Mock).mockImplementation(() => {
        throw new Error('Project not found: missing');
      });

      const req = { params: { id: 'missing' }, body: {} } as unknown as Request;
      const res = mockRes();

      patchProject(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Project not found: missing' });
    });
  });

  describe('postTaskComplete', () => {
    it('completes the given task and returns the updated memory', () => {
      const updated = { projectId: 'p1', completedTasks: ['build API'] };
      (projectMemory.completeTask as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { task: 'build API' } } as unknown as Request;
      const res = mockRes();

      postTaskComplete(req, res);

      expect(projectMemory.completeTask).toHaveBeenCalledWith('p1', 'build API');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when task is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      postTaskComplete(req, res);

      expect(projectMemory.completeTask).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('postArchitectureDecision', () => {
    it('records the decision and returns the updated memory', () => {
      const updated = { projectId: 'p1', architectureDecisions: [{ summary: 'Use SQLite' }] };
      (projectMemory.recordArchitectureDecision as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { summary: 'Use SQLite' } } as unknown as Request;
      const res = mockRes();

      postArchitectureDecision(req, res);

      expect(projectMemory.recordArchitectureDecision).toHaveBeenCalledWith('p1', 'Use SQLite');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when summary is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      postArchitectureDecision(req, res);

      expect(projectMemory.recordArchitectureDecision).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
