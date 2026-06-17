export interface BonusTokenItem {
  id: string;
  totalTokens: number;
  remainingTokens: number;
  source: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface TokenUsage {
  currentMonth: {
    month: string;
    tokensUsed: number;
    planLimit: number;
    remaining: number;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  };
  bonusTokens?: {
    total: number;
    remaining: number;
    items?: BonusTokenItem[];
  };
  effectiveRemaining?: number;
  history: Array<{
    month: string;
    tokensUsed: number;
  }>;
  totalTokensUsed: number;
}

export interface BillingSummary {
  currentPlan: {
    name: string;
    price: string;
    status: string;
    nextBillingDate: string;
    cancelAtPeriodEnd: boolean;
  };
  paymentHistory: Array<{
    id: string;
    planName: string;
    amount: string;
    status: string;
    date: string;
  }>;
  totalSpent: string;
}

export interface RedeemResponse {
  success: boolean;
  message: string;
  bonusTokens?: number;
}
