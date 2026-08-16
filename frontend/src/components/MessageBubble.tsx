import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import { RoutingChain } from './RoutingChain';
import { CodeBlock } from './CodeBlock';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex w-full max-w-3xl flex-col items-end gap-2">
          {message.images && message.images.length > 0 && (
            <div className="flex max-w-full flex-wrap justify-end gap-2">
              {message.images.map((image, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-hairline bg-panel shadow-sm">
                  <img
                    src={`data:${image.mimeType};base64,${image.base64}`}
                    alt="Attached image"
                    className="h-36 w-36 object-cover md:h-44 md:w-44"
                  />
                </div>
              ))}
            </div>
          )}

          {message.attachmentNames && message.attachmentNames.length > 0 && (
            <div className="flex max-w-full flex-wrap justify-end gap-2">
              {message.attachmentNames.map((name, i) => (
                <div key={i} className="flex max-w-[240px] items-center gap-2 rounded-xl border border-hairline bg-panel px-3 py-2 text-xs text-ink-muted shadow-sm">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="truncate font-medium">{name}</span>
                </div>
              ))}
            </div>
          )}

          {message.content && (
            <div className="max-w-[92%] rounded-2xl rounded-br-md bg-signal px-4 py-3 text-[15px] leading-6 text-canvas shadow-[0_8px_24px_-8px_rgba(240,163,57,0.45)] md:max-w-[78%]">
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full max-w-3xl rounded-2xl border border-hairline bg-panel/75 px-4 py-4 text-[15px] leading-7 text-ink shadow-panel md:px-5">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">
          <span className="brand-mark h-5 w-5 rounded-md text-[8px]">AG</span>
          Assistant
          {message.provider && <span className="ml-auto truncate normal-case tracking-normal text-ink-faint">{message.provider}</span>}
        </div>

        <div className="prose prose-invert prose-sm max-w-none break-words
          prose-p:my-2.5 prose-p:leading-7
          prose-headings:mt-5 prose-headings:mb-2 prose-headings:font-semibold prose-headings:tracking-tight
          prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
          prose-strong:text-ink prose-strong:font-semibold
          prose-code:rounded prose-code:bg-panel-raised prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
          prose-pre:my-3
          prose-a:text-signal prose-a:no-underline hover:prose-a:underline
          prose-blockquote:border-l-signal-dim prose-blockquote:text-ink-muted"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children }) {
                if (!className) return <code className={className}>{children}</code>;
                return <CodeBlock className={className}>{children}</CodeBlock>;
              },
              pre({ children }) {
                return <>{children}</>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      </div>

      {message.provider && message.failoverChain && (
        <div className="pl-1">
          <RoutingChain chain={message.failoverChain} finalProvider={message.provider} model={message.model ?? ''} />
        </div>
      )}
    </div>
  );
}
