import type {
  AnalyzedTransaction,
  BillingCycle,
  CategorySummaryRow,
  LeakageSummary,
  SubscriptionSummary,
  TransactionCategory,
} from '../types/statement';

export function formatCurrency(amount: number, currencySymbol: string, compact = false): string {
  const abs = Math.abs(amount);
  const locale = currencySymbol === '₹' ? 'en-IN' : 'en-US';
  const sign = amount < 0 ? '-' : '';

  if (compact && abs >= 100000 && currencySymbol === '₹') {
    return `${sign}${currencySymbol}${(abs / 100000).toFixed(1)}L`;
  }
  if (compact && abs >= 1000) {
    return `${sign}${currencySymbol}${(abs / 1000).toFixed(1)}k`;
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs);

  return `${sign}${currencySymbol}${formatted}`;
}

function billingMultiplier(cycle: BillingCycle): number {
  switch (cycle) {
    case 'monthly':
      return 12;
    case 'annual':
      return 1;
    case 'weekly':
      return 52;
    case 'quarterly':
      return 4;
    default:
      return 12;
  }
}

export function buildCategorySummaries(
  transactions: AnalyzedTransaction[]
): {
  inflows: CategorySummaryRow[];
  outflows: CategorySummaryRow[];
  totalInflow: number;
  totalOutflow: number;
} {
  const inflowMap = new Map<TransactionCategory, { count: number; total: number }>();
  const outflowMap = new Map<TransactionCategory, { count: number; total: number }>();

  let totalInflow = 0;
  let totalOutflow = 0;

  for (const txn of transactions) {
    if (txn.direction === 'inflow') {
      totalInflow += txn.amount;
      const prev = inflowMap.get(txn.category) ?? { count: 0, total: 0 };
      inflowMap.set(txn.category, { count: prev.count + 1, total: prev.total + txn.amount });
    } else {
      totalOutflow += txn.amount;
      const prev = outflowMap.get(txn.category) ?? { count: 0, total: 0 };
      outflowMap.set(txn.category, { count: prev.count + 1, total: prev.total + txn.amount });
    }
  }

  const inflows: CategorySummaryRow[] = Array.from(inflowMap.entries())
    .map(([category, data]) => ({
      category,
      direction: 'inflow' as const,
      count: data.count,
      totalAmount: data.total,
      percentage: totalInflow > 0 ? (data.total / totalInflow) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const outflows: CategorySummaryRow[] = Array.from(outflowMap.entries())
    .map(([category, data]) => ({
      category,
      direction: 'outflow' as const,
      count: data.count,
      totalAmount: data.total,
      percentage: totalOutflow > 0 ? (data.total / totalOutflow) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return { inflows, outflows, totalInflow, totalOutflow };
}

export function buildCashflowSeries(
  transactions: AnalyzedTransaction[],
  grouping: 'daily' | 'weekly'
): Array<{ label: string; sortKey: string; received: number; spent: number; net: number }> {
  const buckets = new Map<string, { label: string; received: number; spent: number }>();

  for (const txn of transactions) {
    let sortKey = txn.date;
    let label = txn.date;

    const dt = new Date(`${txn.date}T00:00:00Z`);
    if (grouping === 'weekly') {
      const day = dt.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(dt);
      monday.setUTCDate(dt.getUTCDate() + diff);
      sortKey = monday.toISOString().slice(0, 10);
      label = `Wk ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
    } else {
      label = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }

    const entry = buckets.get(sortKey) ?? { label, received: 0, spent: 0 };
    if (txn.direction === 'inflow') {
      entry.received += txn.amount;
    } else {
      entry.spent += txn.amount;
    }
    buckets.set(sortKey, entry);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([sortKey, val]) => ({
      sortKey,
      label: val.label,
      received: Math.round(val.received * 100) / 100,
      spent: Math.round(val.spent * 100) / 100,
      net: Math.round((val.received - val.spent) * 100) / 100,
    }));
}

export function buildSubscriptionAndLeakageSummary(transactions: AnalyzedTransaction[]): {
  subscriptions: SubscriptionSummary[];
  leakages: LeakageSummary[];
  totalAnnualSubscriptionCost: number;
  totalAnnualLeakageImpact: number;
  combinedAnnualCost: number;
} {
  // Deduplicate subscriptions by normalized merchant name so multi-month statements
  // do not double-count the same monthly plan into 24x or 36x annual cost.
  const subGroups = new Map<string, AnalyzedTransaction[]>();
  for (const txn of transactions) {
    if (txn.direction === 'outflow' && txn.isSubscription) {
      const key = txn.cleanMerchant.trim().toLowerCase();
      const list = subGroups.get(key) ?? [];
      list.push(txn);
      subGroups.set(key, list);
    }
  }

  const subscriptions: SubscriptionSummary[] = [];
  for (const group of subGroups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const earliest = sorted[0];
    const cycle: BillingCycle = latest.billingCycle === 'none' ? 'monthly' : latest.billingCycle;
    const total = sorted.reduce((acc, t) => acc + t.amount, 0);
    const averageAmount = total / sorted.length;
    const multiplier = billingMultiplier(cycle);
    const estimatedAnnualCost =
      latest.estimatedAnnualCost > 0
        ? Math.max(latest.estimatedAnnualCost, latest.amount * multiplier)
        : latest.amount * multiplier;
    const monthlyEquivalent = estimatedAnnualCost / 12;
    const priceChangeDelta = latest.amount - earliest.amount;
    const hasPriceHike = sorted.length >= 2 && priceChangeDelta > 0.01;

    subscriptions.push({
      merchant: latest.cleanMerchant,
      category: latest.category,
      billingCycle: cycle,
      latestAmount: latest.amount,
      averageAmount,
      monthlyEquivalent,
      estimatedAnnualCost,
      occurrences: sorted.length,
      dates: sorted.map((s) => s.date),
      hasPriceHike,
      priceChangeDelta,
      transactionIds: sorted.map((s) => s.id),
    });
  }

  subscriptions.sort((a, b) => b.estimatedAnnualCost - a.estimatedAnnualCost);

  // Estimate statement span in months for annualizing non-subscription leakages
  const allDates = transactions.map((t) => t.date).sort();
  let spanMonths = 1;
  if (allDates.length >= 2) {
    const start = new Date(`${allDates[0]}T00:00:00Z`).getTime();
    const end = new Date(`${allDates[allDates.length - 1]}T00:00:00Z`).getTime();
    const days = Math.max(1, (end - start) / (1000 * 60 * 60 * 24) + 1);
    spanMonths = Math.max(1, days / 30.4);
  }

  const leakageGroups = new Map<string, AnalyzedTransaction[]>();
  for (const txn of transactions) {
    if (txn.direction === 'outflow' && txn.isLeakage) {
      const key = `${txn.cleanMerchant.trim().toLowerCase()}::${txn.leakageType}`;
      const list = leakageGroups.get(key) ?? [];
      list.push(txn);
      leakageGroups.set(key, list);
    }
  }

  const leakages: LeakageSummary[] = [];
  for (const group of leakageGroups.values()) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];
    const observedAmount = sorted.reduce((acc, t) => acc + t.amount, 0);

    // If this leakage is also a subscription (e.g., duplicate subscription or price hike),
    // avoid double-counting its base subscription cost in the combined total later.
    const estimatedAnnualImpact = latest.isSubscription
      ? latest.amount * billingMultiplier(latest.billingCycle === 'none' ? 'monthly' : latest.billingCycle)
      : Math.round(((observedAmount / spanMonths) * 12) * 100) / 100;

    leakages.push({
      id: `leak-${sorted[0].id}`,
      merchant: latest.cleanMerchant,
      leakageType: latest.leakageType === 'none' ? 'discretionary_leak' : latest.leakageType,
      reason:
        latest.leakageReason ||
        (latest.leakageType === 'bank_fee'
          ? 'Avoidable bank fee or penalty charge'
          : 'Recurring discretionary drain'),
      observedAmount,
      estimatedAnnualImpact,
      occurrences: sorted.length,
      transactionIds: sorted.map((s) => s.id),
    });
  }

  leakages.sort((a, b) => b.estimatedAnnualImpact - a.estimatedAnnualImpact);

  const totalAnnualSubscriptionCost = subscriptions.reduce(
    (acc, s) => acc + s.estimatedAnnualCost,
    0
  );

  // Only add non-subscription leakage impacts to avoid double-counting duplicate subscriptions
  const subTxnIds = new Set(subscriptions.flatMap((s) => s.transactionIds));
  const nonSubLeakageAnnual = leakages
    .filter((l) => !l.transactionIds.some((id) => subTxnIds.has(id)))
    .reduce((acc, l) => acc + l.estimatedAnnualImpact, 0);

  const totalAnnualLeakageImpact = leakages.reduce(
    (acc, l) => acc + l.estimatedAnnualImpact,
    0
  );

  return {
    subscriptions,
    leakages,
    totalAnnualSubscriptionCost,
    totalAnnualLeakageImpact,
    combinedAnnualCost: totalAnnualSubscriptionCost + nonSubLeakageAnnual,
  };
}
