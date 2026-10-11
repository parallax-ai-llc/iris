/**
 * Settings tabs: one section visible at a time, ARIA tablist semantics,
 * arrow-key navigation, and the last tab remembered (storage may throw).
 */
import '@/shared/lib/i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  SETTINGS_TAB_STORAGE_KEY,
  nextTabIndex,
  readLastSettingsTab,
  writeLastSettingsTab,
} from '../settingsTabs';
import { SettingsTabs } from '../components/SettingsTabs';

afterEach(() => {
  vi.restoreAllMocks();
  try {
    localStorage.removeItem(SETTINGS_TAB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
});

describe('nextTabIndex', () => {
  it('moves with arrows in both orientations and wraps', () => {
    expect(nextTabIndex('ArrowDown', 0, 4)).toBe(1);
    expect(nextTabIndex('ArrowRight', 3, 4)).toBe(0);
    expect(nextTabIndex('ArrowUp', 0, 4)).toBe(3);
    expect(nextTabIndex('ArrowLeft', 2, 4)).toBe(1);
    expect(nextTabIndex('Home', 2, 4)).toBe(0);
    expect(nextTabIndex('End', 0, 4)).toBe(3);
    expect(nextTabIndex('a', 1, 4)).toBeNull();
  });
});

describe('last tab memory', () => {
  it('round-trips a known tab id', () => {
    writeLastSettingsTab('appearance');
    expect(readLastSettingsTab(['account', 'appearance'])).toBe('appearance');
  });
  it('ignores unknown or stale ids', () => {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, 'removed-tab');
    expect(readLastSettingsTab(['account', 'appearance'])).toBe('account');
  });
  it('falls back to the first tab when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeLastSettingsTab('about')).not.toThrow();
    expect(readLastSettingsTab(['account', 'about'])).toBe('account');
  });
});

describe('<SettingsTabs>', () => {
  const tabs = [
    { id: 'one', label: 'One', render: () => <p>first panel</p> },
    { id: 'two', label: 'Two', render: () => <p>second panel</p> },
    { id: 'three', label: 'Three', render: () => <p>third panel</p> },
  ];

  it('shows only the selected panel and wires ARIA', () => {
    render(<SettingsTabs tabs={tabs} label="Settings sections" />);
    const list = screen.getByRole('tablist');
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    const [one, two] = screen.getAllByRole('tab');
    expect(one.getAttribute('aria-selected')).toBe('true');
    expect(two.getAttribute('aria-selected')).toBe('false');
    expect(one.tabIndex).toBe(0);
    expect(two.tabIndex).toBe(-1);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(one.id);
    expect(screen.getByText('first panel')).toBeTruthy();
    expect(screen.queryByText('second panel')).toBeNull();
  });

  it('switches on click and remembers the tab', () => {
    render(<SettingsTabs tabs={tabs} label="Settings sections" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Two' }));
    expect(screen.getByText('second panel')).toBeTruthy();
    expect(screen.queryByText('first panel')).toBeNull();
    expect(localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)).toBe('two');
  });

  it('restores the remembered tab on mount', () => {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, 'three');
    render(<SettingsTabs tabs={tabs} label="Settings sections" />);
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('aria-selected')).toBe('true');
  });

  it('arrow keys move selection and focus', () => {
    render(<SettingsTabs tabs={tabs} label="Settings sections" />);
    const [one] = screen.getAllByRole('tab');
    one.focus();
    fireEvent.keyDown(one, { key: 'ArrowDown' });
    const two = screen.getByRole('tab', { name: 'Two' });
    expect(two.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(two, { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'One' }), { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'Three' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('third panel')).toBeTruthy();
  });
});
