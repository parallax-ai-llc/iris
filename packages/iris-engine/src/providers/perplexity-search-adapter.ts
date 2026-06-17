/**
 * Parallax Iris — Perplexity Sonar Search API client (for WEB_SEARCH).
 *
 * This is a thin call+cache wrapper around Perplexity's `/search` endpoint —
 * deliberately NOT a full BaseProviderAdapter implementation, because:
 *  - WEB_SEARCH returns raw search results (title/url/snippet), not the
 *    LLM-style chat completions that BaseProviderAdapter is shaped around.
 *  - The capability matrix / AICapability union doesn't include "web-search",
 *    and adding it would ripple changes across every other adapter for a
 *    feature only one node consumes.
 *
 * Cost & cache policy (server-enforced; users have no override knob):
 *  - Cache key = sha256(query.trim().toLowerCase() + maxResults)
 *  - TTL = 60 minutes, hard-coded
 *  - Cache hit → cost USD 0 (returned from cache, no vendor call)
 *  - Cache miss → cost USD 0.005 (Perplexity flat per-query pricing)
 *
 * The cache lives in-process — Map<key, { value, expiresAt }>. That's
 * intentional: a Redis layer would be nice but adds infra surface area for
 * a feature where 60min in-memory dedup already cuts the dominant repeat
 * cost (LLM-driven retry storms inside agent loops).
 */

import { createHash } from 'crypto';

export interface PerplexitySearchInput {
  query: string;
  maxResults: number;
}

export interface PerplexitySearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface PerplexitySearchOutput {
  results: PerplexitySearchResult[];
  fromCache: boolean;
  estimatedCostUsd: number;
}

const PERPLEXITY_BASE_URL = 'https://api.perplexity.ai';
const SEARCH_ENDPOINT = '/search';
const CACHE_TTL_MS = 60 * 60 * 1000;
const COST_PER_QUERY_USD = 0.005;

/**
 * Per-key cache entry. Stored alongside `expiresAt` so we can do
 * lazy expiration on read without needing a sweeper.
 */
interface CacheEntry {
  value: PerplexitySearchResult[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Exposed for tests — drop everything from the in-process cache. */
export function __clearPerplexitySearchCache(): void {
  cache.clear();
}

/** Build the cache key. Normalizes whitespace + case so trivial variants hit. */
export function buildCacheKey(query: string, maxResults: number): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  return createHash('sha256')
    .update(`${normalized}|${maxResults}`)
    .digest('hex');
}

/**
 * Pluggable HTTP transport — defaults to global fetch but tests can override
 * to avoid hitting the live API.
 */
export type FetchFn = typeof fetch;
let fetchImpl: FetchFn = (...args) => fetch(...args);

/** Test-only: swap the fetch implementation. */
export function __setPerplexityFetchImpl(impl: FetchFn): void {
  fetchImpl = impl;
}

/** Test-only: restore the default fetch implementation. */
export function __resetPerplexityFetchImpl(): void {
  fetchImpl = (...args) => fetch(...args);
}

/**
 * Look up a cached entry, evicting if expired.
 * Returns undefined when there's no live hit.
 */
function readCache(key: string): PerplexitySearchResult[] | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function writeCache(key: string, value: PerplexitySearchResult[]): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Normalize Perplexity's response into the canonical `{ title, url, snippet }`
 * shape. Field names have varied across releases (e.g. `link` vs `url`,
 * `description` vs `snippet`), so we accept the union and prefer the
 * documented field if present.
 */
function normalizeResults(raw: unknown): PerplexitySearchResult[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;
  const items =
    (data.results as unknown[] | undefined) ??
    (data.web_results as unknown[] | undefined) ??
    (data.data as unknown[] | undefined) ??
    [];
  return items
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const it = item as Record<string, unknown>;
      const title =
        (it.title as string | undefined) ??
        (it.name as string | undefined) ??
        '';
      const url =
        (it.url as string | undefined) ??
        (it.link as string | undefined) ??
        (it.source as string | undefined) ??
        '';
      const snippet =
        (it.snippet as string | undefined) ??
        (it.description as string | undefined) ??
        (it.text as string | undefined) ??
        (it.content as string | undefined) ??
        '';
      if (!url) return null;
      return {
        title: String(title),
        url: String(url),
        snippet: String(snippet),
      };
    })
    .filter((x): x is PerplexitySearchResult => x !== null);
}

/**
 * Perform a Perplexity Sonar Search API call (or return cached results).
 *
 * Failure semantics: on any error (network, non-2xx, bad shape) returns
 * `{ results: [], fromCache: false, estimatedCostUsd: 0 }`. Callers that
 * want the error visible should look at the `error` field on the surrounding
 * node output — the WEB_SEARCH executor sets that.
 */
export async function perplexitySearch(
  input: PerplexitySearchInput
): Promise<PerplexitySearchOutput> {
  const { query, maxResults } = input;
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], fromCache: false, estimatedCostUsd: 0 };
  }

  const key = buildCacheKey(trimmed, maxResults);
  const cached = readCache(key);
  if (cached) {
    return { results: cached, fromCache: true, estimatedCostUsd: 0 };
  }

  const env = process.env;
  const apiKey = env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return { results: [], fromCache: false, estimatedCostUsd: 0 };
  }

  try {
    const response = await fetchImpl(
      `${PERPLEXITY_BASE_URL}${SEARCH_ENDPOINT}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: trimmed,
          max_results: maxResults,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `[perplexity-search] ${response.status} ${response.statusText}`
      );
      return { results: [], fromCache: false, estimatedCostUsd: 0 };
    }

    const data = (await response.json()) as unknown;
    const results = normalizeResults(data).slice(0, maxResults);

    writeCache(key, results);
    return { results, fromCache: false, estimatedCostUsd: COST_PER_QUERY_USD };
  } catch (err) {
    console.error(
      '[perplexity-search] request failed:',
      (err as Error).message
    );
    return { results: [], fromCache: false, estimatedCostUsd: 0 };
  }
}
