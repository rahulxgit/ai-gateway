import { Request, Response } from 'express';
import { extractUpload, truncateExtractedText } from '../services/upload.service';
import { writeFile } from '../services/workspace.service';

export async function postUpload(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
    return;
  }

  const extracted = await extractUpload(file.buffer, file.originalname, file.mimetype);

  if (extracted.kind === 'unsupported') {
    res.status(415).json({
      error: `Unsupported file type: ${file.mimetype || 'unknown'}. Supported: PDF, DOCX, and plain text formats (images are accepted but not yet used for vision).`,
    });
    return;
  }

  let contextText: string | null = null;
  let truncated = false;

  if (extracted.kind === 'text' && extracted.extractedText) {
    const result = truncateExtractedText(extracted.extractedText);
    contextText = result.text;
    truncated = result.truncated;
  }

  // If a projectId was provided, also save the extracted text into the
  // project workspace so it persists and gets picked up as a "relevant
  // file" in later requests, not just this one.
  const projectId = req.body?.projectId as string | undefined;
  if (projectId && contextText) {
    writeFile(projectId, `uploads/${file.originalname}`, contextText, null, 'uploaded by user');
  }

  res.json({
    filename: extracted.filename,
    mimeType: extracted.mimeType,
    kind: extracted.kind,
    sizeBytes: extracted.sizeBytes,
    extractedText: contextText,
    truncated,
    savedToProject: Boolean(projectId && contextText),
  });
}
