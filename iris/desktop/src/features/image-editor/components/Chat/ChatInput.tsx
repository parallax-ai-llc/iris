import { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onAbort, isStreaming, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '36px';
    }
  }, [text, isStreaming, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '36px';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  return (
    <div className="flex items-end gap-2 p-2 border-t border-zinc-700/50">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask AI to edit your image..."
        disabled={isStreaming || disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50 scrollbar-thin scrollbar-thumb-zinc-600"
        style={{ minHeight: '36px', maxHeight: '120px' }}
      />
      {isStreaming ? (
        <button
          onClick={onAbort}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
          title="Stop"
        >
          <Square className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
