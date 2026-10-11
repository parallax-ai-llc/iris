/**
 * Client-side search for the public community library.
 *
 * The server list endpoint (GET /api/iris/library) only takes assetType, sort
 * and paging, so the Library page filters the items it has already loaded.
 * Every whitespace-separated term must appear (case-insensitive) in the prompt
 * or in the model id.
 */

export interface LibrarySearchFields {
  prompt?: string | null;
  modelId?: string | null;
}

function terms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesTerms(item: LibrarySearchFields, queryTerms: readonly string[]): boolean {
  if (queryTerms.length === 0) return true;
  const fields = [item.prompt, item.modelId]
    .filter((f): f is string => typeof f === 'string' && f.length > 0)
    .map((f) => f.toLowerCase());
  return queryTerms.every((term) => fields.some((field) => field.includes(term)));
}

export function matchesLibraryQuery(item: LibrarySearchFields, query: string): boolean {
  return matchesTerms(item, terms(query));
}

/** Filter keeping order; returns the input array itself for an empty query. */
export function filterLibraryItems<T extends LibrarySearchFields>(items: T[], query: string): T[] {
  const queryTerms = terms(query);
  if (queryTerms.length === 0) return items;
  return items.filter((item) => matchesTerms(item, queryTerms));
}
