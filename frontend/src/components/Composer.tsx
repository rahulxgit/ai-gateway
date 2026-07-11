import { useRef, useState } from 'react';
import { api } from '../lib/api';
import type { ImageAttachment, UploadResult } from '../types';

interface PendingAttachment {
  id: string;
  filename: string;
  status: 'uploading' | 'ready' | 'error';
  result?: UploadResult;
  error?: string;
}

const ACCEPTED = '.pdf,.docx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp';

export function Composer({
  onSend,
  disabled,
  projectId,
}: {
  onSend: (text: string, images?: ImageAttachment[]) => void;
  disabled: boolean;
  projectId?: string;
}) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setAttachments((prev) => [...prev, { id, filename: file.name, status: 'uploading' }]);
      try {
        const result = await api.uploadFile(file, projectId);
        if (result.kind === 'unsupported') {
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'error', error: 'Unsupported file type' } : a))
          );
        } else {
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'ready', result } : a)));
        }
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : a
          )
        );
      }
    }
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const submit = () => {
    const text = value.trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready' && a.result);
    if ((!text && readyAttachments.length === 0) || disabled) return;

    // Text-extractable files (PDF/DOCX/plain text) get prepended as
    // clearly-delimited context ahead of the user's message — the backend
    // treats this as one user turn either way. Images are handled
    // completely differently: they travel as real image data on the
    // message so a vision-capable provider actually sees the picture,
    // not a text description of it.
    const textAttachments = readyAttachments.filter((a) => a.result!.kind === 'text');
    const imageAttachments = readyAttachments.filter((a) => a.result!.kind === 'image');

    const attachmentBlocks = textAttachments
      .map((a) => `--- Attached file: ${a.result!.filename} ---\n${a.result!.extractedText}\n--- end of attachment ---`)
      .join('\n\n');
    const finalText = attachmentBlocks ? `${attachmentBlocks}\n\n${text}`.trim() : text;

    const images: ImageAttachment[] = imageAttachments.map((a) => ({
      mimeType: a.result!.mimeType,
      base64: a.result!.base64!,
    }));

    onSend(finalText || 'What is in this image?', images.length > 0 ? images : undefined);
    setValue('');
    setAttachments([]);
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  };

  const hasUploading = attachments.some((a) => a.status === 'uploading');

  return (
    <div className="rounded-xl border border-hairline bg-panel-raised p-2 focus-within:border-signal-dim">
      {attachments.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
          {attachments.map((a) => {
            const isImage = a.result?.kind === 'image' && a.result.base64;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] ${
                  a.status === 'error'
                    ? 'border-danger/40 bg-danger/10 text-danger'
                    : a.status === 'uploading'
                      ? 'border-hairline bg-panel text-ink-faint'
                      : 'border-ok-dim bg-ok-dim/20 text-ok'
                }`}
              >
                {a.status === 'uploading' && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-faint" />}
                {isImage && (
                  <img
                    src={`data:${a.result!.mimeType};base64,${a.result!.base64}`}
                    alt={a.filename}
                    className="h-5 w-5 rounded object-cover"
                  />
                )}
                <span className="max-w-[160px] truncate">{a.filename}</span>
                {a.status === 'error' && <span className="opacity-80">· {a.error}</span>}
                <button onClick={() => removeAttachment(a.id)} className="opacity-60 hover:opacity-100">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach an image, PDF, DOCX, or text file"
          className="shrink-0 rounded-lg border border-hairline p-2 text-ink-muted transition hover:border-signal-dim hover:text-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message the gateway…"
          rows={1}
          className="max-h-48 flex-1 resize-none bg-transparent px-1 py-1.5 text-[15px] text-ink placeholder:text-ink-faint outline-none"
        />
        <button
          onClick={submit}
          disabled={disabled || hasUploading || (!value.trim() && attachments.every((a) => a.status !== 'ready'))}
          className="shrink-0 rounded-lg bg-signal px-3.5 py-2 text-sm font-medium text-canvas transition disabled:cursor-not-allowed disabled:bg-panel disabled:text-ink-faint"
        >
          Send
        </button>
      </div>
    </div>
  );
}
