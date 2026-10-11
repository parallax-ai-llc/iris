import { matchesCombo, useShortcutLayer, type ShortcutBinding } from '@/shared/lib/shortcuts';
import { useAssistantStore } from '../stores/assistant.store';
import { focusAssistantInput } from '../lib/focus';

const ASSISTANT_TOGGLE_COMBO = 'Mod+/';

/** True for Ctrl+/ (Cmd+/ on macOS) with no other modifier. */
export function isAssistantToggleShortcut(e: KeyboardEvent): boolean {
  return matchesCombo(e, ASSISTANT_TOGGLE_COMBO);
}

/** Open the panel (and focus the prompt) or close it. */
export function toggleAssistant(): void {
  const { isOpen, setOpen } = useAssistantStore.getState();
  setOpen(!isOpen);
  if (!isOpen) focusAssistantInput();
}

const ASSISTANT_BINDINGS: readonly ShortcutBinding[] = [
  {
    id: 'assistant.toggle',
    keys: ASSISTANT_TOGGLE_COMBO,
    // Works while the prompt box itself (or any other text field) has focus.
    allowInInput: true,
    run: () => toggleAssistant(),
  },
];

/** Global Ctrl+/ toggle, routed through the central shortcut dispatcher. */
export function useAssistantShortcut(): void {
  useShortcutLayer('global', ASSISTANT_BINDINGS);
}
