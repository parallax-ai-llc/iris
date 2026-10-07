import { useEffect } from 'react';
import { useAssistantStore } from '../stores/assistant.store';
import { focusAssistantInput } from '../lib/focus';

/** True for Ctrl+/ (Cmd+/ on macOS) with no other modifier. */
export function isAssistantToggleShortcut(e: KeyboardEvent): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const slash = e.key === '/' || e.code === 'Slash';
  return mod && slash && !e.shiftKey && !e.altKey;
}

/** Open the panel (and focus the prompt) or close it. */
export function toggleAssistant(): void {
  const { isOpen, setOpen } = useAssistantStore.getState();
  setOpen(!isOpen);
  if (!isOpen) focusAssistantInput();
}

/**
 * Global Ctrl+/ toggle. Listens in the capture phase so it also works while
 * the prompt box itself (or any other text field) has focus, and before an
 * editor's own key handler sees the event.
 */
export function useAssistantShortcut(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isAssistantToggleShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      toggleAssistant();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
}
