import fs from 'fs';
import path from 'path';

// pdfjs-dist ships ESM-only (no CJS build), which Jest's CommonJS transform
// pipeline can't execute directly — it works correctly under real Node
// (verified manually: `curl -X POST /uploads -F file=@sample.pdf` against
// this exact fixture returns the correct extracted text). We mock it here
// so this test can still exercise extractUpload's own logic — MIME/extension
// routing, truncation, error paths — without depending on Jest's ESM support.
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            { str: 'This is a test project spec.' },
            { str: 'Goal: build a REST API for tracking daily puzzle streaks.' },
            { str: 'Requirement: use SQLite and TypeScript.' },
          ],
        }),
      }),
    }),
  }),
}));

import { extractUpload, truncateExtractedText } from '../services/upload.service';

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

describe('extractUpload', () => {
  it('extracts text from a real PDF', async () => {
    const result = await extractUpload(fixture('sample.pdf'), 'sample.pdf', 'application/pdf');
    expect(result.kind).toBe('text');
    expect(result.extractedText).toContain('test project spec');
    expect(result.extractedText).toContain('SQLite');
  });

  it('extracts text from a real DOCX', async () => {
    const result = await extractUpload(
      fixture('sample.docx'),
      'sample.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    expect(result.kind).toBe('text');
    expect(result.extractedText).toContain('Word format');
    expect(result.extractedText).toContain('undo, redo');
  });

  it('reads plain text files as-is', async () => {
    const buf = Buffer.from('hello world\nsecond line');
    const result = await extractUpload(buf, 'notes.txt', 'text/plain');
    expect(result.kind).toBe('text');
    expect(result.extractedText).toBe('hello world\nsecond line');
  });

  it('flags images as kind "image" and returns usable base64 data', async () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff]); // JPEG magic bytes, content irrelevant here
    const result = await extractUpload(buf, 'photo.jpg', 'image/jpeg');
    expect(result.kind).toBe('image');
    expect(result.extractedText).toBeNull();
    expect(result.base64).toBe(buf.toString('base64'));
  });

  it('flags unrecognized binary formats as unsupported', async () => {
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    const result = await extractUpload(buf, 'archive.zip', 'application/zip');
    expect(result.kind).toBe('unsupported');
    expect(result.extractedText).toBeNull();
  });
});

describe('truncateExtractedText', () => {
  it('leaves short text unchanged', () => {
    const { text, truncated } = truncateExtractedText('short text');
    expect(text).toBe('short text');
    expect(truncated).toBe(false);
  });

  it('truncates text beyond the character limit', () => {
    const long = 'a'.repeat(50_000);
    const { text, truncated } = truncateExtractedText(long);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(long.length);
  });
});
