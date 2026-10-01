import { formatCredits } from '@editor/lib/format-credits';
import type { RunCostEstimate } from '@editor/lib/run-cost-estimate';

type T = (key: string, params?: unknown) => string;

export function hasRunCost(estimate: RunCostEstimate): boolean {
  return (
    estimate.onceTokens > 0 || estimate.perItemTokens > 0 || estimate.usageBased
  );
}

/** Credits for the run button pill, e.g. "12.5" or "~12.5 + 3/item". */
export function formatRunCostShort(estimate: RunCostEstimate, t: T): string {
  const approx = estimate.inputDependent || estimate.usageBased ? '~' : '';
  const once = `${approx}${formatCredits(estimate.onceTokens)}`;
  if (estimate.perItemTokens <= 0) return once;
  const perItem = t('iris.runCost.perItemSuffix') || '/item';
  return `${once} + ${formatCredits(estimate.perItemTokens)}${perItem}`;
}

/**
 * Full sentence for the status bar and the run button tooltip, e.g.
 * "Est. cost ~12.5 credits + 3 credits per loop item · depends on input length".
 */
export function formatRunCostDetail(estimate: RunCostEstimate, t: T): string {
  const credits = t('iris.runCost.credits') || 'credits';
  const approx = estimate.inputDependent || estimate.usageBased ? '~' : '';
  const parts = [
    `${t('iris.runCost.estCost') || 'Est. cost'} ${approx}${formatCredits(
      estimate.onceTokens
    )} ${credits}`,
  ];
  if (estimate.perItemTokens > 0) {
    parts[0] += ` + ${formatCredits(estimate.perItemTokens)} ${credits} ${
      t('iris.runCost.perLoopItem') || 'per loop item'
    }`;
  }
  if (estimate.inputDependent) {
    parts.push(
      t('iris.runCost.inputDependent') ||
        'depends on input length (5 s / 500 chars assumed)'
    );
  }
  if (estimate.usageBased) {
    parts.push(
      t('iris.runCost.usageBased') || 'some nodes are billed on actual usage'
    );
  }
  return parts.join(' · ');
}
