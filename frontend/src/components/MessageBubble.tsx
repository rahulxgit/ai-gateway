import type { ChatMessage } from '../types';
import { RoutingChain } from './RoutingChain';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-panel-raised px-4 py-2.5 text-[15px] leading-relaxed text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-hairline bg-panel px-4 py-3 text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
        {message.content}
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
