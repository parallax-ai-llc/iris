/**
 * Parallax Iris — Web Scraper adapter (Phase 2).
 *
 * Converts an arbitrary URL into clean markdown + structured metadata.
 *
 * Three provider routes, picked by the user via the WEB_SCRAPER `provider`
 * config field (no auto-fallback — chained fallbacks make cost accounting
 * unpredictable and obscure which provider actually ran):
 *
 *  - **`readability`** — Server-side via @mozilla/readability + jsdom +
 *    turndown. Free, no external dependency. Only handles server-rendered
 *    pages.
 *  - **`jina`** — `https://r.jina.ai/<url>`. Free tier (anonymous calls);
 *    BYO `JINA_API_KEY` for higher rate limits. Handles JS-rendered pages.
 *  - **`firecrawl`** — `https://api.firecrawl.dev/v1/scrape`. Best for
 *    sites that need waitForSelector / anti-bot bypass. Requires
 *    `FIRECRAWL_API_KEY`.
 *
 * Cost (USD, surfaced via `estimatedCostUsd` — node-executor converts to
 * tokens at 1 USD ≈ 130 039 tokens):
 *   readability → $0
 *   jina        → $0.0003 (anonymous tier; users without a key still pay
 *                 nothing but we bill the standard rate to discourage
 *                 unbounded scraping)
 *   firecrawl   → $0.0015 (matches their entry pricing for /scrape v1)
 */

// jsdom / @mozilla/readability / turndown are heavyweight, ESM-only deps used
// only by the readability path. They are imported lazily inside
// scrapeWithReadability() so merely importing the engine barrel doesn't pull
// the whole DOM stack into memory (also keeps it out of CJS test runners that
// can't parse those packages' ESM).

export type WebScraperProvider = 'readability' | 'jina' | 'firecrawl';

export interface WebScraperInput {
  url: string;
  provider: WebScraperProvider;
  waitForSelector?: string;
  includeRawHtml?: boolean;
}

export interface WebScraperOutput {
  markdown: string;
  metadata: Record<string, unknown>;
  rawHtml: string;
  estimatedCostUsd: number;
}

const COST_PER_CALL: Record<WebScraperProvider, number> = {
  readability: 0,
  jina: 0.0003,
  firecrawl: 0.0015,
};

export async function webScrape(
  input: WebScraperInput
): Promise<WebScraperOutput> {
  switch (input.provider) {
    case 'firecrawl':
      return scrapeWithFirecrawl(input);
    case 'jina':
      return scrapeWithJina(input);
    case 'readability':
    default:
      return scrapeWithReadability(input);
  }
}

// ─── readability (server-side) ────────────────────────────────────────────
async function scrapeWithReadability(
  input: WebScraperInput
): Promise<WebScraperOutput> {
  const html = await fetchHtml(input.url);
  // Lazy-load the DOM stack only when the readability path actually runs.
  // jsdom is heavyweight per-call — we instantiate it inside the scope so
  // GC reclaims it as soon as the function returns. The `url` option matters
  // because Readability uses it to resolve relative links.
  const [{ JSDOM }, { Readability }, { default: TurndownService }] =
    await Promise.all([
      import('jsdom'),
      import('@mozilla/readability'),
      import('turndown'),
    ]);
  const dom = new JSDOM(html, { url: input.url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  const markdown = article?.content ? turndown.turndown(article.content) : '';
  const metadata: Record<string, unknown> = {
    title: article?.title ?? null,
    byline: article?.byline ?? null,
    excerpt: article?.excerpt ?? null,
    siteName: article?.siteName ?? null,
    publishedTime: article?.publishedTime ?? null,
    length: article?.length ?? 0,
  };

  return {
    markdown,
    metadata,
    rawHtml: input.includeRawHtml ? html : '',
    estimatedCostUsd: COST_PER_CALL.readability,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    // A friendly UA — many sites 403 default fetch UA.
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; ParallaxIris/1.0; +https://parallax.ai)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(
      `WEB_SCRAPER readability: ${response.status} ${response.statusText}`
    );
  }
  return response.text();
}

// ─── jina r.jina.ai ───────────────────────────────────────────────────────
async function scrapeWithJina(
  input: WebScraperInput
): Promise<WebScraperOutput> {
  const env = process.env;
  const apiKey = env.JINA_API_KEY;
  // r.jina.ai returns markdown directly; bare URL is the public path.
  const url = `https://r.jina.ai/${input.url}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headers: any = {
    Accept: 'application/json',
    'X-Return-Format': 'markdown',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(
      `WEB_SCRAPER jina: ${response.status} ${response.statusText}`
    );
  }
  const data = (await response.json()) as {
    code: number;
    data: {
      title?: string;
      description?: string;
      url?: string;
      content?: string;
      publishedTime?: string;
      siteName?: string;
    };
  };
  const d = data.data;
  return {
    markdown: d.content ?? '',
    metadata: {
      title: d.title ?? null,
      description: d.description ?? null,
      url: d.url ?? input.url,
      publishedTime: d.publishedTime ?? null,
      siteName: d.siteName ?? null,
    },
    rawHtml: '',
    estimatedCostUsd: COST_PER_CALL.jina,
  };
}

// ─── firecrawl /v1/scrape ─────────────────────────────────────────────────
async function scrapeWithFirecrawl(
  input: WebScraperInput
): Promise<WebScraperOutput> {
  const env = process.env;
  const apiKey = env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error('WEB_SCRAPER firecrawl: FIRECRAWL_API_KEY not configured');
  }

  const body: Record<string, unknown> = {
    url: input.url,
    formats: input.includeRawHtml ? ['markdown', 'html'] : ['markdown'],
  };
  if (input.waitForSelector) {
    body.waitFor = input.waitForSelector;
  }

  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `WEB_SCRAPER firecrawl: ${response.status} ${response.statusText}`
    );
  }
  const json = (await response.json()) as {
    success: boolean;
    data?: {
      markdown?: string;
      html?: string;
      metadata?: Record<string, unknown>;
    };
    error?: string;
  };
  if (!json.success) {
    throw new Error(`WEB_SCRAPER firecrawl: ${json.error ?? 'unknown error'}`);
  }
  return {
    markdown: json.data?.markdown ?? '',
    metadata: json.data?.metadata ?? {},
    rawHtml: input.includeRawHtml ? (json.data?.html ?? '') : '',
    estimatedCostUsd: COST_PER_CALL.firecrawl,
  };
}
