import { Router } from 'express';
import multer from 'multer';
import { postUpload } from '../controllers/upload.controller';
import { asyncHandler } from '../utils/async-handler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — generous for docs, keeps memory bounded
});

const router = Router();

router.post('/uploads', upload.single('file'), asyncHandler(postUpload));

export default router;
