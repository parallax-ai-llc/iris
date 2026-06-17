// Web data collection nodes (Phase 1+).
// Separated from utility.ts to keep the WEB category visually grouped in
// the node palette UI and to avoid bloating UTIL_* further.
//
// Backend adapters live in `server/src/modules/iris/providers/adapters/`
// — these definitions only declare the user-visible surface (ports,
// configs, tool-callability). Cost/cache policy is enforced server-side.

import type { NodeDefinition } from '../types.js';

/**
 * Web search via Perplexity Sonar Search API (`/search` endpoint).
 *
 * Provider choice rationale (see docs/plan/IRIS_NODES_EXPANSION_PLAN.md §4.3):
 * - Existing `perplexity-adapter.ts` already runs Sonar chat completions —
 *   zero new vendor onboarding, same API key / billing / monitoring.
 * - Flat pricing: $0.005 / query — predictable cost accounting.
 * - Raw search results (title/url/snippet) — appropriate for an agent
 *   tool where LLM synthesis happens downstream (in GEN_TEXT_TO_TEXT).
 *
 * Cache policy (server-enforced, NOT user-configurable):
 * - Cache key = sha256(query + maxResults)
 * - TTL = 60 minutes (hard-coded, no override)
 * - Hit → adapter.estimateCost() returns $0 → zero token charge
 * - Miss → estimateCost() returns $0.005 → standard CostCalculator pipeline
 *
 * Why no `provider` config field: kept deliberately minimal. Adding
 * Tavily/Brave later would require evaluating BYO-key UX and is deferred
 * past Phase 1.
 */
export const WEB_SEARCH: NodeDefinition = {
  type: 'WEB_SEARCH',
  category: 'WEB',
  label: 'Web Search',
  description:
    'Search the web via Perplexity Sonar. Identical queries within 60 minutes are served from cache (zero cost).',
  iconName: 'Search',
  color: 'indigo',
  canBeTool: true,
  inputs: [
    { name: 'query', type: 'text', label: 'Query', required: true },
  ],
  outputs: [
    // Shape: [{ title: string, url: string, snippet: string }, ...]
    // Server adapter normalizes Perplexity's response into this canonical form.
    { name: 'results', type: 'json', label: 'Results' },
    {
      name: 'fromCache',
      type: 'any',
      label: 'From Cache',
      hideHandle: true,
      // Boolean. Surfaced as a debug-only port so workflows can verify
      // cache behavior without wiring it into the main data path.
    },
  ],
  configFields: [
    {
      name: 'maxResults',
      label: 'Max Results',
      type: 'number',
      defaultValue: 5,
      min: 1,
      max: 20,
      description:
        'Number of results to return (1–20). Perplexity Search API enforces 20 as the hard upper bound.',
    },
  ],
};

// ─── Phase 2: WEB 카테고리 확장 ─────────────────────────────────────────────

/**
 * URL을 정제된 마크다운으로 변환. JavaScript 렌더링, 광고/네비 제거,
 * 본문 추출은 외부 서비스(Firecrawl / Jina Reader)에 위임. 자체 headless
 * 브라우저 운영을 피하는 게 의도 (Phase 1의 BYO-vendor 원칙과 동일).
 *
 * Server 트랙이 provider 어댑터 + BYO API key UX 결정.
 */
export const WEB_SCRAPER: NodeDefinition = {
  type: 'WEB_SCRAPER',
  category: 'WEB',
  label: 'Web Scraper',
  description: 'URL을 정제된 마크다운으로 변환 (Firecrawl / Jina Reader)',
  iconName: 'Globe',
  color: 'indigo',
  canBeTool: true,
  inputs: [
    { name: 'url', type: 'text', label: 'URL', required: true },
  ],
  outputs: [
    { name: 'markdown', type: 'text', label: 'Markdown' },
    { name: 'metadata', type: 'json', label: 'Metadata (title, description, ogImage 등)' },
    { name: 'links', type: 'json', label: 'Extracted Links' },
  ],
  configFields: [
    {
      name: 'provider',
      label: 'Provider',
      type: 'select',
      options: [
        { value: 'firecrawl', label: 'Firecrawl (JS rendering, structured)' },
        { value: 'jina', label: 'Jina Reader (free tier, lightweight)' },
        { value: 'readability', label: 'Readability (server-side, no external)' },
      ],
      defaultValue: 'jina',
      description: 'firecrawl/jina는 BYO API key 필요. readability는 무료지만 JS 렌더링 안 됨.',
    },
    {
      name: 'waitForSelector',
      label: 'Wait For Selector',
      type: 'text',
      placeholder: 'main, article, [data-loaded]',
      description: 'firecrawl 한정 — 이 selector가 나타날 때까지 대기 (SPA 페이지용).',
      dependsOn: { field: 'provider', value: 'firecrawl' },
    },
    {
      name: 'includeImages',
      label: 'Include Images',
      type: 'toggle',
      defaultValue: false,
      description: '이미지 URL을 마크다운에 포함.',
    },
    {
      name: 'maxTokens',
      label: 'Max Output Tokens',
      type: 'number',
      min: 500,
      max: 100000,
      defaultValue: 8000,
      description: '결과가 이 토큰을 넘으면 잘림 (LLM context 보호).',
    },
  ],
};

/**
 * YouTube URL → 자막 텍스트. 공식 자막이 있으면 그것을, 없으면 Whisper로
 * fallback. 시간 정보 포함 옵션은 비디오 인덱싱/요약 워크플로우에서 유용.
 *
 * Server 트랙이 yt-dlp + Whisper API 통합 결정.
 */
export const WEB_YOUTUBE_TRANSCRIPT: NodeDefinition = {
  type: 'WEB_YOUTUBE_TRANSCRIPT',
  category: 'WEB',
  label: 'YouTube Transcript',
  description: 'YouTube URL → 자막 텍스트 (공식 자막 → 없으면 Whisper)',
  iconName: 'Youtube',
  color: 'indigo',
  canBeTool: true,
  inputs: [
    { name: 'url', type: 'text', label: 'YouTube URL', required: true },
  ],
  outputs: [
    { name: 'transcript', type: 'text', label: 'Full Transcript' },
    { name: 'segments', type: 'json', label: 'Segments [{start, end, text}]' },
    { name: 'title', type: 'text', label: 'Video Title' },
    { name: 'duration', type: 'any', label: 'Duration (sec)', hideHandle: true },
  ],
  configFields: [
    {
      name: 'language',
      label: 'Language',
      type: 'select',
      options: [
        { value: 'auto', label: 'Auto (prefer original)' },
        { value: 'en', label: 'English' },
        { value: 'ko', label: 'Korean' },
        { value: 'ja', label: 'Japanese' },
        { value: 'zh', label: 'Chinese' },
        { value: 'es', label: 'Spanish' },
      ],
      defaultValue: 'auto',
    },
    {
      name: 'withTimestamps',
      label: 'Include Timestamps',
      type: 'toggle',
      defaultValue: false,
      description: 'true면 transcript에 [HH:MM:SS] 포함, segments도 항상 채워짐.',
    },
    {
      name: 'fallbackWhisper',
      label: 'Whisper Fallback',
      type: 'toggle',
      defaultValue: true,
      description: '공식 자막이 없을 때 OpenAI Whisper로 음성 인식 (비용 발생).',
    },
  ],
};
