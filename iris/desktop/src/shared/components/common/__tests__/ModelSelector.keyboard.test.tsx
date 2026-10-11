/**
 * ModelSelector — keyboard navigation and listbox semantics.
 *
 * While the menu is open the dropdown owns the keyboard (a blocking modal
 * layer in the shortcut dispatcher): ↑/↓ move the active option, Home/End jump,
 * Enter picks, Esc closes and returns focus to the trigger. Page shortcuts
 * registered underneath must not run while it is open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ModelSelector, type ModelOption } from '../ModelSelector';
import {
  registerShortcutLayer,
  resetShortcutDispatcherForTests,
  setShortcutPlatform,
} from '@/shared/lib/shortcuts';

const OPTIONS: ModelOption[] = [
  { id: 'm-a', name: 'Model A', provider: 'openai' },
  { id: 'm-b', name: 'Model B', provider: 'google' },
  { id: 'm-c', name: 'Model C', provider: 'xai' },
  { id: 'm-d', name: 'Model D', provider: 'bfl' },
];

function Harness({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState('m-b');
  return (
    <ModelSelector
      value={value}
      options={OPTIONS}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const key = (code: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: code, code, ...init });

const activeOptionName = () => {
  const listbox = screen.getByRole('listbox');
  const id = listbox.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent ?? '' : '';
};

beforeEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform('other');
});
afterEach(() => {
  resetShortcutDispatcherForTests();
  setShortcutPlatform(null);
});

describe('ModelSelector keyboard', () => {
  it('opens as a focused listbox whose active option is the selected one', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /Model B/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    const listbox = screen.getByRole('listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(listbox);
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: /Model B/ })).toHaveAttribute('aria-selected', 'true');
    expect(activeOptionName()).toContain('Model B');
  });

  it('ArrowDown / ArrowUp move, Home / End jump, movement stops at the ends', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Model B/ }));

    key('ArrowDown');
    expect(activeOptionName()).toContain('Model C');
    key('ArrowDown');
    key('ArrowDown');
    expect(activeOptionName()).toContain('Model D');
    key('ArrowUp');
    expect(activeOptionName()).toContain('Model C');
    key('Home');
    expect(activeOptionName()).toContain('Model A');
    key('ArrowUp');
    expect(activeOptionName()).toContain('Model A');
    key('End');
    expect(activeOptionName()).toContain('Model D');
  });

  it('Enter selects the active option, closes and refocuses the trigger', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Model B/ }));
    key('ArrowDown');
    key('Enter');

    expect(onChange).toHaveBeenCalledWith('m-c');
    expect(screen.queryByRole('listbox')).toBeNull();
    const trigger = screen.getByRole('button', { name: /Model C/ });
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes without changing the value and refocuses the trigger', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Model B/ });
    fireEvent.click(trigger);
    key('ArrowDown');
    key('Escape');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('blocks page shortcuts only while open; Escape is not handled while closed', () => {
    const pageShortcut = vi.fn();
    const pageEscape = vi.fn();
    registerShortcutLayer('page', [
      { keys: 'ArrowDown', run: pageShortcut },
      { keys: 'Escape', run: pageEscape },
    ]);
    render(<Harness />);

    key('ArrowDown');
    key('Escape');
    expect(pageShortcut).toHaveBeenCalledTimes(1);
    expect(pageEscape).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Model B/ }));
    key('ArrowDown');
    key('KeyN', { ctrlKey: true });
    expect(pageShortcut).toHaveBeenCalledTimes(1);
    key('Escape');
    expect(pageEscape).toHaveBeenCalledTimes(1);
  });

  it('mouse hover moves the active option', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /Model B/ }));
    fireEvent.mouseEnter(screen.getByRole('option', { name: /Model D/ }));
    expect(activeOptionName()).toContain('Model D');
  });
});
