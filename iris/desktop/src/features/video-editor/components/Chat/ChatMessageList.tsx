import { useEffect, useRef } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import type { VideoChatMessage } from '@/features/video-editor/stores/videoEditorChat.store';

interface ChatMessageListProps {
  messages: VideoChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
}

function CommandStatus({ message }: { message: VideoChatMessage }) {
  if (!message.command || !message.commandStatus) return null;

  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
      {message.commandStatus === 'running' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
          <span className="text-blue-400">Executing…</span>
        </>
      )}
      {message.commandStatus === 'success' && (
        <>
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400">Done</span>
        </>
      )}
      {message.commandStatus === 'error' && (
        <>
          <AlertCircle className="w-3 h-3 text-red-400" />
          <span className="text-red-400">{message.commandError || 'Failed'}</span>
        </>
      )}
      {message.commandStatus === 'pending' && (
        <>
          <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />
          <span className="text-zinc-400">Preparing…</span>
        </>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: VideoChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-zinc-700 text-zinc-100'
            : 'bg-zinc-800/60 text-zinc-300 border border-zinc-700/50'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <CommandStatus message={message} />
      </div>
    </div>
  );
}

function StreamingBubble({ content }: { content: string }) {
  const displayContent = content.replace(/<command>[\s\S]*?<\/command>/g, '').trim();

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-zinc-800/60 text-zinc-300 border border-zinc-700/50">
        <p className="whitespace-pre-wrap break-words">
          {displayContent || '…'}
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse" />
        </p>
      </div>
    </div>
  );
}

export function ChatMessageList({ messages, streamingContent, isStreaming }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingContent]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-xs text-zinc-500 text-center leading-relaxed">
          Ask AI about your video.<br />
          Try: "What is this video about?", "Remove silence", or
          "Add a yellow bold 'Welcome' title at 0.5s".
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && streamingContent && <StreamingBubble content={streamingContent} />}
      {isStreaming && !streamingContent && (
        <div className="flex justify-start">
          <div className="rounded-lg px-3 py-2 bg-zinc-800/60 border border-zinc-700/50">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
