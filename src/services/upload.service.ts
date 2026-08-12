import path from 'path';

export interface ExtractedUpload {
  filename: string;
  mimeType: string;
  kind: 'text' | 'image' | 'unsupported';
  extractedText: string | null;
  base64: string | null;
  sizeBytes: number;
}

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.log', '.ts', '.js', '.py', '.html', '.css']);
const IMAGE_MIME_PREFIX = 'image/';

/**
 * Extracts plain text from a PDF using pdfjs-dist (actively maintained,
 * unlike the abandoned pdf-parse package which bundles a 2017-era pdf.js
 * that fails on many legitimately well-formed PDFs).
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    // Suppresses a harmless warning about missing standard font metrics —
    // irrelevant since we only need text content, not rendering.
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;

  // Pages are independent of one another, so fetch+parse them concurrently
  // via Promise.all instead of one at a time — pdf.js can process multiple
  // pages in parallel, which meaningfully speeds up extraction for large
  // PDFs. Results are collected in an array indexed by page number so
  // final order is preserved regardless of completion order.
  const pageNumbers = Array.from({ length: doc.numPages }, (_, i) => i + 1);
  const pages = await Promise.all(
    pageNumbers.map(async (i) => {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      return content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    })
  );
  return pages.join('\n\n');
}

/**
 * Extracts usable text from an uploaded file so it can be injected into a
 * chat request as context. PDFs and Word docs get parsed properly; plain
 * text formats are read as-is; images are flagged separately since text
 * extraction doesn't apply — they need a vision-capable provider instead.
 */
export async function extractUpload(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<ExtractedUpload> {
  const ext = path.extname(originalName).toLowerCase();
  const base = { filename: originalName, mimeType, sizeBytes: buffer.length };

  if (mimeType.startsWith(IMAGE_MIME_PREFIX)) {
    return { ...base, kind: 'image', extractedText: null, base64: buffer.toString('base64') };
  }

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const text = await extractPdfText(buffer);
    return { ...base, kind: 'text', extractedText: text.trim(), base64: null };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return { ...base, kind: 'text', extractedText: result.value.trim(), base64: null };
  }

  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/')) {
    return { ...base, kind: 'text', extractedText: buffer.toString('utf-8').trim(), base64: null };
  }

  return { ...base, kind: 'unsupported', extractedText: null, base64: null };
}

const MAX_EXTRACTED_CHARS = 40_000; // ~10k tokens — generous but keeps one file from blowing the context window

export function truncateExtractedText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_EXTRACTED_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}
