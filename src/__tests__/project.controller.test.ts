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
  patchCurrentTask,
  postPendingTasks,
  postBug,
  patchBugResolve,
  postCommit,
  patchConventions,
  patchUserPreference,
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

  describe('patchCurrentTask', () => {
    it('sets the current task and returns the updated memory', () => {
      const updated = { projectId: 'p1', currentTask: 'implement auth' };
      (projectMemory.setCurrentTask as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { task: 'implement auth' } } as unknown as Request;
      const res = mockRes();

      patchCurrentTask(req, res);

      expect(projectMemory.setCurrentTask).toHaveBeenCalledWith('p1', 'implement auth');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when task is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      patchCurrentTask(req, res);

      expect(projectMemory.setCurrentTask).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('postPendingTasks', () => {
    it('adds pending tasks and returns the updated memory', () => {
      const updated = { projectId: 'p1', pendingTasks: ['a', 'b'] };
      (projectMemory.addPendingTasks as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { tasks: ['a', 'b'] } } as unknown as Request;
      const res = mockRes();

      postPendingTasks(req, res);

      expect(projectMemory.addPendingTasks).toHaveBeenCalledWith('p1', ['a', 'b']);
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when tasks is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      postPendingTasks(req, res);

      expect(projectMemory.addPendingTasks).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects with 400 when tasks is an empty array', () => {
      const req = { params: { id: 'p1' }, body: { tasks: [] } } as unknown as Request;
      const res = mockRes();

      postPendingTasks(req, res);

      expect(projectMemory.addPendingTasks).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects with 400 when tasks contains a non-string element', () => {
      const req = { params: { id: 'p1' }, body: { tasks: ['ok', 123] } } as unknown as Request;
      const res = mockRes();

      postPendingTasks(req, res);

      expect(projectMemory.addPendingTasks).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('postBug', () => {
    it('records a bug and returns the updated memory', () => {
      const updated = { projectId: 'p1', errorsEncountered: [{ description: 'crashes on load' }] };
      (projectMemory.recordBug as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { description: 'crashes on load' } } as unknown as Request;
      const res = mockRes();

      postBug(req, res);

      expect(projectMemory.recordBug).toHaveBeenCalledWith('p1', 'crashes on load');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when description is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      postBug(req, res);

      expect(projectMemory.recordBug).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('patchBugResolve', () => {
    it('resolves a bug with a fix and returns the updated memory', () => {
      const updated = { projectId: 'p1', errorsEncountered: [{ id: 'b1', resolved: true, fix: 'added null check' }] };
      (projectMemory.resolveBug as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1', bugId: 'b1' }, body: { fix: 'added null check' } } as unknown as Request;
      const res = mockRes();

      patchBugResolve(req, res);

      expect(projectMemory.resolveBug).toHaveBeenCalledWith('p1', 'b1', 'added null check');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when fix is missing', () => {
      const req = { params: { id: 'p1', bugId: 'b1' }, body: {} } as unknown as Request;
      const res = mockRes();

      patchBugResolve(req, res);

      expect(projectMemory.resolveBug).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('postCommit', () => {
    it('records a commit summary and returns the updated memory', () => {
      const updated = { projectId: 'p1', commitSummaries: [{ message: 'add auth flow' }] };
      (projectMemory.recordCommit as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { message: 'add auth flow' } } as unknown as Request;
      const res = mockRes();

      postCommit(req, res);

      expect(projectMemory.recordCommit).toHaveBeenCalledWith('p1', 'add auth flow');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when message is missing', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      postCommit(req, res);

      expect(projectMemory.recordCommit).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('patchConventions', () => {
    it('sets conventions and returns the updated memory', () => {
      const updated = { projectId: 'p1', conventions: { namingConvention: 'camelCase' } };
      (projectMemory.setConventions as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { namingConvention: 'camelCase' } } as unknown as Request;
      const res = mockRes();

      patchConventions(req, res);

      expect(projectMemory.setConventions).toHaveBeenCalledWith('p1', { namingConvention: 'camelCase' });
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when body is empty', () => {
      const req = { params: { id: 'p1' }, body: {} } as unknown as Request;
      const res = mockRes();

      patchConventions(req, res);

      expect(projectMemory.setConventions).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('patchUserPreference', () => {
    it('sets a user preference and returns the updated memory', () => {
      const updated = { projectId: 'p1', userPreferences: { theme: 'dark' } };
      (projectMemory.setUserPreference as jest.Mock).mockReturnValue(updated);

      const req = { params: { id: 'p1' }, body: { key: 'theme', value: 'dark' } } as unknown as Request;
      const res = mockRes();

      patchUserPreference(req, res);

      expect(projectMemory.setUserPreference).toHaveBeenCalledWith('p1', 'theme', 'dark');
      expect(res.json).toHaveBeenCalledWith(updated);
    });

    it('rejects with 400 when key is missing', () => {
      const req = { params: { id: 'p1' }, body: { value: 'dark' } } as unknown as Request;
      const res = mockRes();

      patchUserPreference(req, res);

      expect(projectMemory.setUserPreference).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects with 400 when value is missing or not a string', () => {
      const req = { params: { id: 'p1' }, body: { key: 'theme' } } as unknown as Request;
      const res = mockRes();

      patchUserPreference(req, res);

      expect(projectMemory.setUserPreference).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
