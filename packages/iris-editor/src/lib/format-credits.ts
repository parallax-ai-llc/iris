/**
 * Display-only token → credit conversion.
 *
 * Server-side accounting (DB, APIs, quotas) stays in tokens.
 * Client-side surfaces user-facing amounts as "credits" at a 1/1000 ratio.
 * 1 credit = 1000 tokens. So a 2,000,000-token plan shows as "2K credits".
 */
export const TOKENS_PER_CREDIT = 1000;

export function tokensToCredits(tokens: number): number {
  return tokens / TOKENS_PER_CREDIT;
}

/**
 * Format a raw token amount as a compact credit string.
 *
 * Examples:
 *   100         → "0.1"   (sub-credit fractional)
 *   1_500       → "1.5"
 *   50_000      → "50"
 *   2_000_000   → "2K"
 *   200_000_000 → "200K"
 *   1_000_000_000 → "1M"
 */
export function formatCredits(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens === 0) return "0";
  const credits = tokensToCredits(tokens);
  const abs = Math.abs(credits);
  const sign = credits < 0 ? "-" : "";

  if (abs < 0.1) return `${sign}${trimTrail(abs.toFixed(2))}`;
  if (abs < 1) return `${sign}${trimTrail(abs.toFixed(1))}`;
  if (abs < 10) return `${sign}${trimTrail(abs.toFixed(1))}`;
  if (abs < 1000) return `${sign}${Math.round(abs).toLocaleString()}`;
  if (abs < 1_000_000) {
    const k = abs / 1000;
    return `${sign}${k < 10 ? trimTrail(k.toFixed(1)) : Math.round(k).toString()}K`;
  }
  const m = abs / 1_000_000;
  return `${sign}${m < 10 ? trimTrail(m.toFixed(1)) : Math.round(m).toString()}M`;
}

/**
 * Format a token amount given in millions as credits. Used by pricing-page
 * value guides where chat-token math is done in M-token units.
 *
 * Math: tokensInMillions × 1M tokens / 1000 = tokensInMillions × 1K credits.
 * So the numeric input also equals "thousands of credits".
 *
 * Examples:
 *   153    (M tokens) → "153K"  (= 153,000 credits)
 *   1538.5 (M tokens) → "1.5M"  (= 1,538,500 credits)
 *   76923  (M tokens) → "76.9M" (= 76.9M credits)
 */
export function formatCreditsFromMillionTokens(tokensInMillions: number): string {
  if (!Number.isFinite(tokensInMillions) || tokensInMillions === 0) return "0";
  const thousandsOfCredits = tokensInMillions;
  if (thousandsOfCredits < 1000) {
    return `${Math.round(thousandsOfCredits).toLocaleString()}K`;
  }
  const m = thousandsOfCredits / 1000;
  return `${m < 10 ? trimTrail(m.toFixed(1)) : Math.round(m).toLocaleString()}M`;
}

function trimTrail(s: string): string {
  return s.replace(/\.?0+$/, "") || "0";
}
