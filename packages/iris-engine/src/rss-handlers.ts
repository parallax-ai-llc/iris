/**
 * Parallax Iris — RSS/Atom feed parsing (WEB_RSS_READ, pure parts).
 *
 * Parses RSS 2.0 / RSS 1.0 (RDF) / Atom feeds into a canonical item shape
 * using lazily-imported cheerio in xmlMode (same dependency the HTML
 * extractor uses — no XML-parser dependency added). Fetching is NOT done
 * here: the executor fetches through the engine's guarded media fetch so
 * the host's SSRF policy applies, then hands the XML string in.
 */

export interface RssItem {
  title: string;
  link: string;
  description: string;
  /** ISO 8601 when the feed carried a parseable date, otherwise null. */
  publishedAt: string | null;
  /** guid (RSS) / id (Atom) / link fallback. */
  id: string;
  author: string;
  /** Full body (content:encoded / Atom content) — only when requested. */
  content?: string;
}

export interface RssFeed {
  feedTitle: string;
  items: RssItem[];
}

/** Structural view of the cheerio surface this module touches. */
interface XmlSelectionLike {
  length: number;
  each(cb: (index: number, el: unknown) => void): unknown;
  first(): XmlSelectionLike;
  find(selector: string): XmlSelectionLike;
  children(): XmlSelectionLike;
  text(): string;
  attr(name: string): string | undefined;
  prop(name: string): unknown;
}
type XmlRootLike = (target: unknown) => XmlSelectionLike;

async function loadXml(xml: string): Promise<XmlRootLike> {
  const mod = (await import('cheerio')) as unknown as {
    load?: (content: string, options?: Record<string, unknown>) => XmlRootLike;
    default?: {
      load?: (content: string, options?: Record<string, unknown>) => XmlRootLike;
    };
  };
  const load = mod.load ?? mod.default?.load;
  if (!load) throw new Error('cheerio: load() not found');
  return load(xml, { xmlMode: true });
}

/** First non-empty text among the given child selectors of `scope`. */
function pickText(scope: XmlSelectionLike, selectors: string[]): string {
  for (const selector of selectors) {
    const found = scope.find(selector).first();
    if (found.length > 0) {
      const text = found.text().trim();
      if (text) return text;
    }
  }
  return '';
}

function toIsoOrNull(raw: string): string | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Parse a feed XML string. Throws when the document contains neither RSS
 * items nor Atom entries so the node fails loudly on non-feed responses
 * (HTML error pages etc.).
 */
export async function parseRssFeed(
  xml: string,
  opts: { includeContent?: boolean } = {}
): Promise<RssFeed> {
  const $ = await loadXml(xml);

  const rssItems = $('item');
  const atomEntries = $('entry');
  const isAtom = rssItems.length === 0 && atomEntries.length > 0;
  if (rssItems.length === 0 && atomEntries.length === 0) {
    // Distinguish "valid feed with no items" from "not a feed at all".
    const hasFeedRoot =
      $('channel').length > 0 || $('feed').length > 0 || $('rss').length > 0;
    if (hasFeedRoot) return { feedTitle: pickFeedTitle($, false), items: [] };
    throw new Error(
      'RSS Read: response is not an RSS/Atom feed (no <item>/<entry> and no feed root)'
    );
  }

  const feedTitle = pickFeedTitle($, isAtom);
  const items: RssItem[] = [];

  const readRssItem = (el: unknown): RssItem => {
    const item = $(el);
    const link = pickText(item, ['link']) || item.find('link').first().attr('href') || '';
    const rss: RssItem = {
      title: pickText(item, ['title']),
      link,
      description: pickText(item, ['description', 'summary']),
      publishedAt: toIsoOrNull(
        pickText(item, ['pubDate', 'dc\\:date', 'date'])
      ),
      id: pickText(item, ['guid']) || link,
      author: pickText(item, ['author', 'dc\\:creator', 'creator']),
    };
    if (opts.includeContent) {
      rss.content =
        pickText(item, ['content\\:encoded', 'encoded']) || rss.description;
    }
    return rss;
  };

  const readAtomEntry = (el: unknown): RssItem => {
    const entry = $(el);
    // Prefer rel=alternate; fall back to the first link's href.
    let link = '';
    const alternate = entry.find('link[rel="alternate"]').first();
    if (alternate.length > 0) link = alternate.attr('href') ?? '';
    if (!link) link = entry.find('link').first().attr('href') ?? '';
    const atom: RssItem = {
      title: pickText(entry, ['title']),
      link,
      description: pickText(entry, ['summary']),
      publishedAt: toIsoOrNull(pickText(entry, ['published', 'updated'])),
      id: pickText(entry, ['id']) || link,
      author: pickText(entry, ['author > name', 'author']),
    };
    if (opts.includeContent) {
      atom.content = pickText(entry, ['content']) || atom.description;
    }
    return atom;
  };

  (isAtom ? atomEntries : rssItems).each((_idx, el) => {
    items.push(isAtom ? readAtomEntry(el) : readRssItem(el));
  });

  return { feedTitle, items };
}

function pickFeedTitle($: XmlRootLike, isAtom: boolean): string {
  if (isAtom) {
    // Atom: the feed's own <title>, not an entry's — direct-child selector
    // keeps entry titles out.
    const feed = $('feed').first();
    if (feed.length > 0) {
      const title = feed.find('> title').first();
      if (title.length > 0) return title.text().trim();
    }
    return '';
  }
  const channelTitle = $('channel').first().find('> title').first();
  return channelTitle.length > 0 ? channelTitle.text().trim() : '';
}

/**
 * Post-parse filtering — pure and time-injected so it stays unit-testable.
 * `sinceHours: 0` disables the window. Items without a parseable date pass
 * the window filter (dropping them silently would hide feed quirks).
 */
export function filterRssItems(
  items: RssItem[],
  opts: { limit: number; sinceHours: number; now?: Date }
): RssItem[] {
  const { limit, sinceHours } = opts;
  const now = opts.now ?? new Date();
  let filtered = items;
  if (sinceHours > 0) {
    const cutoff = now.getTime() - sinceHours * 3600 * 1000;
    filtered = items.filter(item => {
      if (!item.publishedAt) return true;
      const t = new Date(item.publishedAt).getTime();
      return Number.isNaN(t) ? true : t >= cutoff;
    });
  }
  return filtered.slice(0, Math.max(1, limit));
}
