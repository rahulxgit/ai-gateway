import { Request, Response } from 'express';
import * as projectMemory from '../services/project-memory.service';
import * as workspace from '../services/workspace.service';

export function postProject(req: Request, res: Response) {
  const { name, goal } = req.body ?? {};
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  res.status(201).json(projectMemory.createProject(name, goal ?? ''));
}

export function getProjects(_req: Request, res: Response) {
  res.json(projectMemory.listProjects());
}

export function getProject(req: Request, res: Response) {
  const memory = projectMemory.getProjectMemory(req.params.id);
  if (!memory) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json(memory);
}

export function patchProject(req: Request, res: Response) {
  try {
    const updated = projectMemory.updateProjectMemory(req.params.id, req.body ?? {});
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
}

export function postTaskComplete(req: Request, res: Response) {
  const { task } = req.body ?? {};
  if (!task) { res.status(400).json({ error: 'task is required' }); return; }
  res.json(projectMemory.completeTask(req.params.id, task));
}

export function postArchitectureDecision(req: Request, res: Response) {
  const { summary } = req.body ?? {};
  if (!summary) { res.status(400).json({ error: 'summary is required' }); return; }
  res.json(projectMemory.recordArchitectureDecision(req.params.id, summary));
}

// -- Workspace / files ---------------------------------------------------

export function putFile(req: Request, res: Response) {
  const { path: filePath, content, provider, diffSummary } = req.body ?? {};
  if (!filePath || typeof content !== 'string') {
    { res.status(400).json({ error: 'path and content are required' }); return; }
  }
  const file = workspace.writeFile(
    req.params.id,
    filePath,
    content,
    provider ?? null,
    diffSummary ?? 'updated'
  );
  res.json(file);
}

export function getFiles(req: Request, res: Response) {
  res.json(workspace.listFiles(req.params.id));
}

export function getFile(req: Request, res: Response) {
  const file = workspace.getFile(req.params.id, req.params.path);
  if (!file) { res.status(404).json({ error: 'File not found' }); return; }
  res.json(file);
}

export function getFileHistory(req: Request, res: Response) {
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).json({ error: 'path query param is required' }); return; }
  res.json(workspace.getFileHistory(req.params.id, filePath));
}

export function postRevertFile(req: Request, res: Response) {
  const { path: filePath, version } = req.body ?? {};
  if (!filePath || typeof version !== 'number') {
    res.status(400).json({ error: 'path and numeric version are required' });
    return;
  }
  res.json(workspace.revertFile(req.params.id, filePath, version));
}

export function deleteFile(req: Request, res: Response) {
  workspace.deleteFile(req.params.id, req.params.path);
  res.status(204).send();
}

// -- Snapshots ------------------------------------------------------------

export function postSnapshot(req: Request, res: Response) {
  const { label } = req.body ?? {};
  const id = workspace.createSnapshot(req.params.id, label ?? `snapshot-${Date.now()}`);
  res.status(201).json({ id });
}

export function getSnapshots(req: Request, res: Response) {
  res.json(workspace.listSnapshots(req.params.id));
}

export function postRestoreSnapshot(req: Request, res: Response) {
  workspace.restoreSnapshot(req.params.id, req.params.snapshotId);
  res.json(projectMemory.getProjectMemory(req.params.id));
}
