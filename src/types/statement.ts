export const INFLOW_CATEGORIES = [
  'Salary & Income',
  'Refunds & Cashback',
  'Transfers & Reimbursements',
  'Interest & Dividends',
  'Other Income',
] as const;

export const OUTFLOW_CATEGORIES = [
  'Subscriptions & Recurring',
  'Food & Dining',
  'Shopping & Retail',
  'Bills & Utilities',
  'Transport & Fuel',
  'Travel & Stays',
  'Health & Wellness',
  'Bank Fees & Charges',
  'Transfers & Family',
  'Other Expenses',
] as const;

export type InflowCategory = (typeof INFLOW_CATEGORIES)[number];
export type OutflowCategory = (typeof OUTFLOW_CATEGORIES)[number];
export type TransactionCategory = InflowCategory | OutflowCategory;

export type TransactionDirection = 'inflow' | 'outflow';
export type BillingCycle = 'monthly' | 'annual' | 'weekly' | 'quarterly' | 'none';
export type LeakageType =
  | 'bank_fee'
  | 'duplicate_subscription'
  | 'micro_spend'
  | 'price_hike'
  | 'discretionary_leak'
  | 'none';

export interface RawTransactionRow {
  id: string;
  date: string; // Normalized YYYY-MM-DD
  rawDescription: string;
  amount: number; // Always positive magnitude
  direction: TransactionDirection;
}

export interface AnalyzedTransaction extends RawTransactionRow {
  cleanMerchant: string;
  category: TransactionCategory;
  isSubscription: boolean;
  billingCycle: BillingCycle;
  estimatedAnnualCost: number;
  isLeakage: boolean;
  leakageType: LeakageType;
  leakageReason: string;
}

export interface ParsedStatementResult {
  fileName: string;
  rows: RawTransactionRow[];
  skippedHeaderRows: number;
  currencySymbol: string;
  minDate: string;
  maxDate: string;
}

export interface CategorySummaryRow {
  category: TransactionCategory;
  direction: TransactionDirection;
  count: number;
  totalAmount: number;
  percentage: number;
}

export interface SubscriptionSummary {
  merchant: string;
  category: TransactionCategory;
  billingCycle: BillingCycle;
  latestAmount: number;
  averageAmount: number;
  monthlyEquivalent: number;
  estimatedAnnualCost: number;
  occurrences: number;
  dates: string[];
  hasPriceHike: boolean;
  priceChangeDelta: number;
  transactionIds: string[];
}

export interface LeakageSummary {
  id: string;
  merchant: string;
  leakageType: LeakageType;
  reason: string;
  observedAmount: number;
  estimatedAnnualImpact: number;
  occurrences: number;
  transactionIds: string[];
}
