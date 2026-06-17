import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ExternalLink, AlertCircle, Gift, Tag, CheckCircle, X } from 'lucide-react';
import { apiClient } from '@/shared/api/client';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { formatTokenCost } from '@/shared/hooks/useTokenCost';
import type { TokenUsage, BillingSummary, RedeemResponse } from './types';

export function ProfilePage() {
  const { t, i18n } = useTranslation('profile');
  const user = useAuthStore((s) => s.user);

  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promotion code state
  const [promoCode, setPromoCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tokenRes, billingRes] = await Promise.all([
        apiClient.get<TokenUsage>('/token-history/token-usage', { requireAuth: true }),
        apiClient.get<BillingSummary>('/payment/billing-summary', { requireAuth: true }),
      ]);
      if (tokenRes.success && tokenRes.data) setTokenUsage(tokenRes.data);
      if (billingRes.success && billingRes.data) setBillingSummary(billingRes.data);
      if (!tokenRes.success && !billingRes.success) {
        setError(t('error'));
      }
    } catch {
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getDateLocale = () => {
    const lang = i18n.language;
    if (lang === 'ko') return 'ko-KR';
    if (lang === 'ja') return 'ja-JP';
    return 'en-US';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(getDateLocale(), {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatBillingPeriod = (start: string, end: string) => {
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const handleRedeemPromoCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim() || isRedeeming) return;

    setIsRedeeming(true);
    setRedeemError(null);
    setRedeemSuccess(null);

    try {
      const result = await apiClient.post<RedeemResponse>(
        '/promotion-codes/redeem',
        { code: promoCode.trim() },
        { requireAuth: true },
      );

      if (result.success && result.data?.success) {
        const msg = t('promotionCode.success', {
          tokens: formatTokenCost(result.data.bonusTokens || 0),
        });
        setRedeemSuccess(msg);
        setPromoCode('');
        setTimeout(() => fetchData(), 1000);
      } else {
        const errorCode = result.data?.message || result.error || 'INTERNAL_ERROR';
        setRedeemError(
          t(`promotionCode.errors.${errorCode}`, t('promotionCode.errors.INTERNAL_ERROR')),
        );
      }
    } catch {
      setRedeemError(t('promotionCode.errors.INTERNAL_ERROR'));
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleChangePlan = () => {
    window.open('https://parallax.kr/plan', '_blank');
  };

  // Loading
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          <p className="text-sm text-zinc-500">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // Error
  if (error && !tokenUsage && !billingSummary) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-400" />
          <p className="text-sm text-zinc-400">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 text-sm text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  const { currentMonth, bonusTokens, effectiveRemaining } = tokenUsage || {};
  const usagePercentage =
    currentMonth && currentMonth.planLimit > 0
      ? (currentMonth.tokensUsed / currentMonth.planLimit) * 100
      : 0;

  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-emerald-900/50 text-emerald-400';
      case 'canceled':
        return 'bg-red-900/50 text-red-400';
      case 'past_due':
        return 'bg-yellow-900/50 text-yellow-400';
      default:
        return 'bg-zinc-700 text-zinc-300';
    }
  };

  const getStatusLabel = (status: string) => {
    const key = `plan.statuses.${status.toLowerCase()}`;
    const translated = t(key);
    return translated !== key ? translated : status;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {user?.profileImageThumbnail ? (
              <img
                src={user.profileImageThumbnail}
                alt={user.name || 'User'}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg text-zinc-300">
                {(user?.name || user?.email)?.[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{user?.name || 'User'}</h1>
            <p className="text-sm text-zinc-500">{user?.email}</p>
          </div>
        </div>

        {/* Current Plan */}
        {billingSummary && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-200">{t('plan.title')}</h2>
              <button
                onClick={handleChangePlan}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
              >
                {t('plan.changePlan')}
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">{t('plan.name')}</span>
                <span className="text-sm font-medium text-zinc-200">
                  {billingSummary.currentPlan.name}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-zinc-400">{t('plan.price')}</span>
                <span className="text-sm font-medium text-zinc-200">
                  ${billingSummary.currentPlan.price}/{t('plan.month')}
                </span>
              </div>
              {billingSummary.currentPlan.nextBillingDate && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-400">{t('plan.status')}</span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${getStatusStyle(billingSummary.currentPlan.status)}`}
                    >
                      {getStatusLabel(billingSummary.currentPlan.status)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-zinc-400">{t('plan.nextBilling')}</span>
                    <span className="text-sm font-medium text-zinc-200">
                      {formatDate(billingSummary.currentPlan.nextBillingDate)}
                    </span>
                  </div>
                </>
              )}
              {billingSummary.currentPlan.cancelAtPeriodEnd && (
                <p className="text-xs text-red-400 mt-2">{t('plan.cancelAtPeriodEnd')}</p>
              )}
            </div>
          </div>
        )}

        {/* Token Usage */}
        {currentMonth && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">{t('tokenUsage.title')}</h2>

            {/* Billing period */}
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-zinc-500">
                {t('tokenUsage.billingPeriod')}
                <br />
                <span className="text-xs">
                  {formatBillingPeriod(currentMonth.billingPeriodStart, currentMonth.billingPeriodEnd)}
                </span>
              </span>
              <span className="text-sm font-semibold text-zinc-300">
                {usagePercentage.toFixed(1)}% {t('tokenUsage.used')}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-zinc-700 rounded-full h-3 mb-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-slate-400 to-zinc-300 rounded-full h-3 transition-all duration-500 ease-out"
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">
                {formatTokenCost(currentMonth.tokensUsed)} {t('tokenUsage.tokensUsed')}
              </span>
              <span className="font-medium text-zinc-200">
                {formatTokenCost(currentMonth.remaining)} {t('tokenUsage.remaining')}
              </span>
            </div>

            {effectiveRemaining !== undefined && bonusTokens && bonusTokens.remaining > 0 && (
              <div className="mt-3 pt-3 border-t border-zinc-800 flex justify-between items-center">
                <span className="text-xs text-zinc-400">{t('tokenUsage.effectiveRemaining')}</span>
                <span className="text-sm font-bold text-zinc-200">
                  {formatTokenCost(effectiveRemaining)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Promotion Code */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Tag className="w-4 h-4 text-emerald-400" />
            <h2 className="text-lg font-semibold text-zinc-200">{t('promotionCode.title')}</h2>
          </div>

          <form onSubmit={handleRedeemPromoCode} className="flex gap-2">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder={t('promotionCode.placeholder')}
              className="flex-1 px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder-zinc-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-500"
              disabled={isRedeeming}
            />
            <button
              type="submit"
              disabled={!promoCode.trim() || isRedeeming}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRedeeming ? t('promotionCode.redeeming') : t('promotionCode.redeem')}
            </button>
          </form>

          {redeemSuccess && (
            <div className="mt-3 p-2.5 bg-emerald-900/30 border border-emerald-800 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="text-xs text-emerald-300">{redeemSuccess}</span>
            </div>
          )}

          {redeemError && (
            <div className="mt-3 p-2.5 bg-red-900/30 border border-red-800 rounded-lg flex items-center gap-2">
              <X className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-300">{redeemError}</span>
            </div>
          )}
        </div>

        {/* Bonus Tokens */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="w-4 h-4 text-amber-400" />
            <h2 className="text-lg font-semibold text-zinc-200">{t('bonusTokens.title')}</h2>
          </div>

          {bonusTokens && bonusTokens.total > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">{t('bonusTokens.total')}</div>
                  <div className="text-lg font-bold text-zinc-200">
                    {formatTokenCost(bonusTokens.total)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">{t('bonusTokens.remaining')}</div>
                  <div className="text-lg font-bold text-zinc-200">
                    {formatTokenCost(bonusTokens.remaining)}
                  </div>
                </div>
              </div>

              {bonusTokens.items && bonusTokens.items.length > 0 && (
                <div className="border-t border-zinc-800 pt-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left font-medium pb-2">{t('bonusTokens.source.label')}</th>
                        <th className="text-right font-medium pb-2">{t('bonusTokens.remaining')}</th>
                        <th className="text-right font-medium pb-2">{t('bonusTokens.expires')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusTokens.items
                        .filter((item) => item.remainingTokens > 0)
                        .map((item) => (
                          <tr key={item.id} className="border-b border-zinc-800/50">
                            <td className="py-2 text-zinc-300">
                              {t(`bonusTokens.source.${item.source}`, item.source)}
                            </td>
                            <td className="py-2 text-right">
                              <span className="text-zinc-200 font-medium">
                                {formatTokenCost(item.remainingTokens)}
                              </span>
                              <span className="text-zinc-500">
                                {' '}/ {formatTokenCost(item.totalTokens)}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <span
                                className={
                                  item.expiresAt ? 'text-amber-400' : 'text-zinc-500'
                                }
                              >
                                {item.expiresAt ? formatDate(item.expiresAt) : t('bonusTokens.noExpiry')}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">{t('bonusTokens.empty')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
