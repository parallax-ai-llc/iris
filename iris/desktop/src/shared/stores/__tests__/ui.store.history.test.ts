/**
 * App-shell page history: back / forward stacks on top of `currentPage`.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { PAGE_HISTORY_LIMIT, useUIStore } from '../ui.store';

function ui() {
  return useUIStore.getState();
}

beforeEach(() => {
  useUIStore.setState({
    currentPage: 'home',
    backStack: [],
    forwardStack: [],
    pendingToolMode: null,
  });
});

describe('page history', () => {
  it('starts with nothing to go back or forward to', () => {
    expect(ui().canGoBack()).toBe(false);
    expect(ui().canGoForward()).toBe(false);
    ui().goBack();
    ui().goForward();
    expect(ui().currentPage).toBe('home');
  });

  it('records each page change and walks back and forward', () => {
    ui().setCurrentPage('images');
    ui().setCurrentPage('videos');
    ui().setCurrentPage('library');
    expect(ui().backStack).toEqual(['home', 'images', 'videos']);

    ui().goBack();
    expect(ui().currentPage).toBe('videos');
    ui().goBack();
    expect(ui().currentPage).toBe('images');
    expect(ui().forwardStack).toEqual(['library', 'videos']);
    expect(ui().canGoForward()).toBe(true);

    ui().goForward();
    expect(ui().currentPage).toBe('videos');
    ui().goForward();
    expect(ui().currentPage).toBe('library');
    expect(ui().canGoForward()).toBe(false);
    expect(ui().backStack).toEqual(['home', 'images', 'videos']);
  });

  it('does not record the same page twice in a row', () => {
    ui().setCurrentPage('images');
    ui().setCurrentPage('images');
    ui().setCurrentPage('images');
    expect(ui().backStack).toEqual(['home']);
    ui().goBack();
    expect(ui().currentPage).toBe('home');
    expect(ui().canGoBack()).toBe(false);
  });

  it('a new navigation after going back clears the forward stack', () => {
    ui().setCurrentPage('images');
    ui().setCurrentPage('videos');
    ui().goBack();
    expect(ui().canGoForward()).toBe(true);

    ui().setCurrentPage('settings');
    expect(ui().forwardStack).toEqual([]);
    expect(ui().backStack).toEqual(['home', 'images']);
  });

  it('re-selecting the current page keeps the forward stack', () => {
    ui().setCurrentPage('images');
    ui().goBack();
    ui().setCurrentPage('home');
    expect(ui().forwardStack).toEqual(['images']);
  });

  it(`keeps at most ${PAGE_HISTORY_LIMIT} entries, dropping the oldest`, () => {
    for (let i = 0; i < PAGE_HISTORY_LIMIT + 10; i++) {
      ui().setCurrentPage(i % 2 === 0 ? 'images' : 'videos');
    }
    expect(PAGE_HISTORY_LIMIT).toBe(50);
    expect(ui().backStack).toHaveLength(PAGE_HISTORY_LIMIT);

    for (let i = 0; i < PAGE_HISTORY_LIMIT + 10; i++) ui().goBack();
    expect(ui().forwardStack).toHaveLength(PAGE_HISTORY_LIMIT);
    expect(ui().canGoBack()).toBe(false);
  });

  it('going back drops a pending tool mode meant for another page', () => {
    ui().setCurrentPage('settings');
    ui().setCurrentPage('images');
    useUIStore.setState({
      pendingToolMode: { id: 'upscale', category: 'image' } as never,
    });
    ui().goBack();
    expect(ui().currentPage).toBe('settings');
    expect(ui().pendingToolMode).toBeNull();
  });
});
