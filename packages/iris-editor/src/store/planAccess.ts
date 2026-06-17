// Plan-access seam stub. In iris/web this fetches the user's plan/quota; the
// editor only calls `fetchPlanAccess()` on mount and does not gate on it
// (isPaidUser was hardcoded true). Local host is unmetered → no-op.
//
// ⚠️ Return a STABLE reference. `useWorkflowEditor` has
// `useEffect(() => { fetchPlanAccess(); fetchTokenCosts(); }, [fetchPlanAccess])`;
// a fresh function each render would re-run that effect every render and
// (via setTokenCosts) spin an infinite render loop that freezes the page.
const PLAN_ACCESS_STUB = { fetchPlanAccess: () => {} };
export function usePlanAccessStore() {
  return PLAN_ACCESS_STUB;
}
