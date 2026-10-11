/**
 * Keyboard + ARIA behaviour shared by the app's custom dropdowns
 * (ModelSelector, Dropdown).
 *
 * While the list is open it owns the keyboard through a blocking `modal`
 * shortcut layer, so page / editor / global shortcuts do not run underneath:
 *   ArrowDown / ArrowUp  move the active option (disabled options skipped, no wrap)
 *   Home / End           first / last enabled option
 *   Enter                pick the active option
 *   Escape               close without picking
 * Focus moves to the listbox (`aria-activedescendant` points at the active
 * option) and returns to the trigger when the list closes from the keyboard.
 * The layer is registered once per mount and is skipped while the list is closed.
 */

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useShortcutLayer, type ShortcutBinding } from '@/shared/lib/shortcuts';

export interface ListboxNavigationOptions {
  isOpen: boolean;
  count: number;
  /** Index of the current value; the active option starts there. -1 when none. */
  selectedIndex: number;
  isDisabled?: (index: number) => boolean;
  /** Pick an option (the caller sets the value and closes the list). */
  onSelect: (index: number) => void;
  onClose: () => void;
  listboxRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLElement | null>;
}

export interface ListboxNavigation {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  listboxId: string;
  optionId: (index: number) => string;
}

/** Above ordinary dialogs, so a dropdown inside a dialog keeps its keys. */
const LISTBOX_LAYER_PRIORITY = 10;

export function useListboxNavigation(options: ListboxNavigationOptions): ListboxNavigation {
  const { isOpen, count, selectedIndex, listboxRef, triggerRef } = options;
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = useCallback((index: number) => `${baseId}-opt-${index}`, [baseId]);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Latest options for the key handlers (the layer is registered once).
  const optsRef = useRef(options);
  optsRef.current = options;
  const activeRef = useRef(activeIndex);
  activeRef.current = activeIndex;

  const enabledFrom = useCallback((start: number, step: 1 | -1): number => {
    const { count: n, isDisabled } = optsRef.current;
    for (let i = start; i >= 0 && i < n; i += step) {
      if (!isDisabled?.(i)) return i;
    }
    return -1;
  }, []);

  // Reset the active option each time the list opens.
  const selectedRef = useRef(selectedIndex);
  selectedRef.current = selectedIndex;
  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }
    const start = selectedRef.current >= 0 ? selectedRef.current : 0;
    const forward = enabledFrom(start, 1);
    setActiveIndex(forward >= 0 ? forward : enabledFrom(start, -1));
    listboxRef.current?.focus();
  }, [isOpen, enabledFrom, listboxRef]);

  // Keep the active option visible in a scrolling list.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const el = document.getElementById(optionId(activeIndex));
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [isOpen, activeIndex, optionId]);

  const closeAndRefocus = useCallback(() => {
    optsRef.current.onClose();
    triggerRef.current?.focus();
  }, [triggerRef]);

  const move = (step: 1 | -1) => {
    const current = activeRef.current;
    const next = current < 0 ? enabledFrom(step === 1 ? 0 : count - 1, step) : enabledFrom(current + step, step);
    if (next >= 0) setActiveIndex(next);
  };

  const bindings: ShortcutBinding[] = [
    { keys: 'ArrowDown', run: () => move(1) },
    { keys: 'ArrowUp', run: () => move(-1) },
    { keys: 'Home', run: () => setActiveIndex(enabledFrom(0, 1)) },
    { keys: 'End', run: () => setActiveIndex(enabledFrom(optsRef.current.count - 1, -1)) },
    {
      keys: 'Enter',
      allowRepeat: false,
      run: () => {
        const index = activeRef.current;
        if (index < 0 || optsRef.current.isDisabled?.(index)) return;
        optsRef.current.onSelect(index);
        triggerRef.current?.focus();
      },
    },
    { keys: 'Escape', allowInInput: true, run: closeAndRefocus },
  ];

  useShortcutLayer('modal', bindings, {
    enabled: isOpen,
    blocking: true,
    priority: LISTBOX_LAYER_PRIORITY,
  });

  return { activeIndex, setActiveIndex, listboxId, optionId };
}
