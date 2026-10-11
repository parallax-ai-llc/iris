/**
 * Dropdown — same keyboard contract as ModelSelector; disabled options are skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dropdown } from '../Dropdown';
import { resetShortcutDispatcherForTests, setShortcutPlatform } from '@/shared/lib/shortcuts';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo', disabled: true },
  { value: 'c', label: 'Charlie' },
];

const key = (code: string) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: code, code });

const activeOptionName = () => {
  const id = screen.getByRole('listbox').getAttribute('aria-activedescendant');
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

describe('Dropdown keyboard', () => {
  it('skips disabled options, selects with Enter and closes with Escape', () => {
    const onChange = vi.fn();
    render(<Dropdown value="a" options={OPTIONS} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Alpha/ });
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('listbox'));
    expect(activeOptionName()).toContain('Alpha');

    key('ArrowDown');
    expect(activeOptionName()).toContain('Charlie');
    key('ArrowUp');
    expect(activeOptionName()).toContain('Alpha');
    key('End');
    key('Enter');
    expect(onChange).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
