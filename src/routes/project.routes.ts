import { Router } from 'express';
import * as ctrl from '../controllers/project.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

router.post('/projects', asyncHandler(ctrl.postProject));
router.get('/projects', asyncHandler(ctrl.getProjects));
router.get('/projects/:id', asyncHandler(ctrl.getProject));
router.patch('/projects/:id', asyncHandler(ctrl.patchProject));
router.post('/projects/:id/tasks/complete', asyncHandler(ctrl.postTaskComplete));
router.post('/projects/:id/decisions', asyncHandler(ctrl.postArchitectureDecision));

router.put('/projects/:id/files', asyncHandler(ctrl.putFile));
router.get('/projects/:id/files', asyncHandler(ctrl.getFiles));
// File path is a wildcard segment (paths contain slashes), so /history and
// /revert are expressed as ?action=... rather than nested URL segments,
// which keeps the route unambiguous under Express's path matching.
router.get('/projects/:id/files/:path(*)', asyncHandler(ctrl.getFile));
router.delete('/projects/:id/files/:path(*)', asyncHandler(ctrl.deleteFile));
router.get('/projects/:id/file-history', asyncHandler(ctrl.getFileHistory));
router.post('/projects/:id/file-revert', asyncHandler(ctrl.postRevertFile));

router.post('/projects/:id/snapshots', asyncHandler(ctrl.postSnapshot));
router.get('/projects/:id/snapshots', asyncHandler(ctrl.getSnapshots));
router.post('/projects/:id/snapshots/:snapshotId/restore', asyncHandler(ctrl.postRestoreSnapshot));

export default router;
