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
  onSend: (apiText: string, displayText: string, images?: ImageAttachment[], attachmentNames?: string[]) => void;
  disabled: boolean;
  projectId?: string;
}) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || disabled) return;
    for (const file of Array.from(files)) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setAttachments((prev) => [...prev, { id, filename: file.name, status: 'uploading' }]);
      try {
        const result = await api.uploadFile(file, projectId);
        if (result.kind === 'unsupported') {
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'error', error: 'Unsupported file type' } : a)));
        } else {
          setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'ready', result } : a)));
        }
      } catch (err) {
        setAttachments((prev) => prev.map((a) => (
          a.id === id ? { ...a, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : a
        )));
      }
    }
  };

  const removeAttachment = (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id));

  const submit = () => {
    const text = value.trim();
    const readyAttachments = attachments.filter((a) => a.status === 'ready' && a.result);
    if ((!text && readyAttachments.length === 0) || disabled) return;

    const textAttachments = readyAttachments.filter((a) => a.result!.kind === 'text');
    const imageAttachments = readyAttachments.filter((a) => a.result!.kind === 'image');
    const attachmentBlocks = textAttachments
      .map((a) => `--- Attached file: ${a.result!.filename} ---\n${a.result!.extractedText}\n--- end of attachment ---`)
      .join('\n\n');
    const apiText = attachmentBlocks ? `${attachmentBlocks}\n\n${text}`.trim() : text;
    const apiTextOrFallback = apiText || 'What is in this image?';
    const images: ImageAttachment[] = imageAttachments.map((a) => ({
      mimeType: a.result!.mimeType,
      base64: a.result!.base64!,
    }));
    const attachmentNames = textAttachments.map((a) => a.result!.filename);

    onSend(
      apiTextOrFallback,
      text,
      images.length > 0 ? images : undefined,
      attachmentNames.length > 0 ? attachmentNames : undefined
    );
    setValue('');
    setAttachments([]);
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  };

  const hasUploading = attachments.some((a) => a.status === 'uploading');
  const canSend = !disabled && !hasUploading && (!!value.trim() || attachments.some((a) => a.status === 'ready'));
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-panel shadow-panel transition duration-150 focus-within:border-signal-dim/80 focus-within:shadow-floating">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-hairline/80 bg-panel-raised/30 px-3 py-2.5">
          {attachments.map((attachment) => {
            const isImage = attachment.result?.kind === 'image' && attachment.result.base64;
            return (
              <div
                key={attachment.id}
                className={`flex max-w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs shadow-sm transition duration-150 ${
                  attachment.status === 'error'
                    ? 'border-danger/30 bg-danger/10 text-danger'
                    : attachment.status === 'uploading'
                      ? 'border-hairline bg-panel text-ink-faint'
                      : 'border-ok-dim/60 bg-ok/10 text-ok'
                }`}
              >
                {attachment.status === 'uploading' && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ink-faint" />}
                {isImage && (
                  <img src={`data:${attachment.result!.mimeType};base64,${attachment.result!.base64}`} alt="" className="h-7 w-7 rounded-lg object-cover" />
                )}
                {!isImage && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                <span className="max-w-[180px] truncate font-medium">{attachment.filename}</span>
                {attachment.status === 'error' && <span className="max-w-[160px] truncate opacity-80">· {attachment.error}</span>}
                <button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-md px-1 text-current/60 hover:bg-black/10 hover:text-current" aria-label={`Remove ${attachment.filename}`}>
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2 p-2.5">
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
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Attach an image, PDF, DOCX, or text file"
          aria-label="Attach file"
          className="icon-button h-10 w-10 rounded-xl disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={projectId ? 'Message this project…' : 'Ask the gateway anything…'}
            rows={1}
            aria-label="Message"
            className="max-h-56 min-h-10 w-full resize-none bg-transparent px-1 py-2 text-base leading-6 text-ink placeholder:text-ink-faint outline-none"
          />
          <div className="flex items-center justify-between px-1 pb-0.5 pt-0.5 font-mono text-[10px] text-ink-faint">
            <span>{hasUploading ? 'Uploading attachment…' : 'Shift+Enter for newline'}</span>
            <span>{wordCount > 0 ? `${wordCount} words` : 'Ready'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="btn-primary h-10 shrink-0 px-4 text-sm"
        >
          <span className="hidden sm:inline">Send</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
