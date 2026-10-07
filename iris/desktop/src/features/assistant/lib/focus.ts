/** Attribute that marks the assistant prompt box, so it can be focused from anywhere. */
export const ASSISTANT_INPUT_ATTR = 'data-assistant-input';

/** Focus the prompt box once it has rendered (e.g. right after opening the panel). */
export function focusAssistantInput(): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLTextAreaElement>(`[${ASSISTANT_INPUT_ATTR}]`);
    if (el && !el.disabled) el.focus();
  });
}
