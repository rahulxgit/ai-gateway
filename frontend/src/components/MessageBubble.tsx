import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import { RoutingChain } from './RoutingChain';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[75%] flex-col items-end gap-2">
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  alt="attached"
                  className="h-32 w-32 rounded-lg border border-hairline object-cover"
                />
              ))}
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl rounded-br-sm bg-panel-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-w-[85%] min-w-0 rounded-2xl rounded-bl-sm border border-hairline bg-panel px-4 py-3 text-[15px] leading-relaxed text-ink">
        <div
          className="prose prose-invert prose-sm max-w-none break-words
                     prose-p:my-2 prose-p:leading-relaxed
                     prose-headings:mt-3 prose-headings:mb-1.5 prose-headings:font-semibold
                     prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
                     prose-strong:text-ink prose-strong:font-semibold
                     prose-code:rounded prose-code:bg-panel-raised prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none
                     prose-pre:bg-panel-raised prose-pre:border prose-pre:border-hairline
                     prose-a:text-signal prose-a:no-underline hover:prose-a:underline
                     prose-blockquote:border-l-signal-dim prose-blockquote:text-ink-muted"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
      {message.provider && message.failoverChain && (
        <div className="pl-1">
          <RoutingChain
            chain={message.failoverChain}
            finalProvider={message.provider}
            model={message.model ?? ''}
          />
        </div>
      )}
    </div>
  );
}
