import { describe, expect, it } from 'vitest';
import { filterLibraryItems, matchesLibraryQuery } from '../publicLibrarySearch';

const item = (prompt?: string, modelId?: string) => ({ prompt, modelId });

describe('matchesLibraryQuery', () => {
  it('an empty or blank query matches everything', () => {
    expect(matchesLibraryQuery(item('a cat'), '')).toBe(true);
    expect(matchesLibraryQuery(item(undefined, undefined), '   ')).toBe(true);
  });

  it('matches the prompt case-insensitively', () => {
    expect(matchesLibraryQuery(item('A Red Fox at dawn'), 'red fox')).toBe(true);
    expect(matchesLibraryQuery(item('A Red Fox at dawn'), 'wolf')).toBe(false);
  });

  it('matches the model id', () => {
    expect(matchesLibraryQuery(item('portrait', 'flux-pro-1.1'), 'FLUX')).toBe(true);
  });

  it('every term must match, in the prompt or the model', () => {
    expect(matchesLibraryQuery(item('neon city skyline', 'seedance-2.5'), 'city seedance')).toBe(true);
    expect(matchesLibraryQuery(item('neon city skyline', 'seedance-2.5'), 'city kling')).toBe(false);
  });

  it('terms do not match across the prompt / model boundary', () => {
    expect(matchesLibraryQuery(item('blue', 'sky'), 'bluesky')).toBe(false);
  });

  it('items without prompt and model only match an empty query', () => {
    expect(matchesLibraryQuery(item(), 'x')).toBe(false);
  });
});

describe('filterLibraryItems', () => {
  it('keeps the order and returns the same array for an empty query', () => {
    const items = [item('one'), item('two'), item('three')];
    expect(filterLibraryItems(items, '')).toBe(items);
    expect(filterLibraryItems(items, 't').map((i) => i.prompt)).toEqual(['two', 'three']);
  });
});
