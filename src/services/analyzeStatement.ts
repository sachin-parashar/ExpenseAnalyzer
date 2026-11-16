import {
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  type AnalyzedTransaction,
  type BillingCycle,
  type LeakageType,
  type RawTransactionRow,
  type TransactionCategory,
} from '../types/statement';

interface BatchApiResultItem {
  id: string;
  cleanMerchant: string;
  direction: 'inflow' | 'outflow';
  category: string;
  isSubscription: boolean;
  billingCycle: BillingCycle;
  estimatedAnnualCost: number;
  isLeakage: boolean;
  leakageType: LeakageType;
  leakageReason: string;
}

const BATCH_SIZE = 150;

function sanitizeCategory(
  rawCategory: string,
  direction: 'inflow' | 'outflow'
): TransactionCategory {
  if (direction === 'inflow') {
    const match = INFLOW_CATEGORIES.find((c) => c === rawCategory);
    return match ?? 'Other Income';
  }
  const match = OUTFLOW_CATEGORIES.find((c) => c === rawCategory);
  return match ?? 'Other Expenses';
}

function applyCrossBatchPriceHikeDetection(
  rows: AnalyzedTransaction[]
): AnalyzedTransaction[] {
  const byMerchant = new Map<string, AnalyzedTransaction[]>();
  for (const r of rows) {
    if (r.direction === 'outflow' && r.isSubscription) {
      const key = r.cleanMerchant.trim().toLowerCase();
      const arr = byMerchant.get(key) ?? [];
      arr.push(r);
      byMerchant.set(key, arr);
    }
  }

  const hikedIds = new Map<string, string>();
  for (const group of byMerchant.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const earliest = sorted[0];
    const latest = sorted[sorted.length - 1];
    if (latest.amount > earliest.amount * 1.02) {
      hikedIds.set(
        latest.id,
        `Recurring charge increased from ${earliest.amount} to ${latest.amount} (+${Math.round(
          ((latest.amount - earliest.amount) / earliest.amount) * 100
        )}%)`
      );
    }
  }

  return rows.map((r) => {
    const hikeMsg = hikedIds.get(r.id);
    if (hikeMsg && !r.isLeakage) {
      return {
        ...r,
        isLeakage: true,
        leakageType: 'price_hike',
        leakageReason: hikeMsg,
      };
    }
    return r;
  });
}

export async function analyzeTransactionsInBatches(
  rows: RawTransactionRow[],
  currencySymbol: string,
  onProgress?: (progress: {
    processedRows: number;
    totalRows: number;
    currentBatch: number;
    totalBatches: number;
  }) => void
): Promise<AnalyzedTransaction[]> {
  const totalRows = rows.length;
  const totalBatches = Math.ceil(totalRows / BATCH_SIZE);
  const analyzedMap = new Map<string, BatchApiResultItem>();

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const start = batchIdx * BATCH_SIZE;
    const batch = rows.slice(start, start + BATCH_SIZE);

    onProgress?.({
      processedRows: start,
      totalRows,
      currentBatch: batchIdx + 1,
      totalBatches,
    });

    const response = await fetch('/api/analyze-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: batch,
        currencySymbol,
      }),
    });

    if (!response.ok) {
      let errorMsg = `Analysis failed (HTTP ${response.status})`;
      try {
        const errPayload = (await response.json()) as { error?: string };
        if (errPayload.error) errorMsg = errPayload.error;
      } catch {
        // ignore JSON parse failure on error body
      }
      throw new Error(errorMsg);
    }

    const payload = (await response.json()) as { results?: BatchApiResultItem[] };
    for (const item of payload.results ?? []) {
      analyzedMap.set(item.id, item);
    }

    onProgress?.({
      processedRows: Math.min(start + batch.length, totalRows),
      totalRows,
      currentBatch: batchIdx + 1,
      totalBatches,
    });
  }

  const merged: AnalyzedTransaction[] = rows.map((row) => {
    const ai = analyzedMap.get(row.id);
    const direction = ai?.direction ?? row.direction;
    const isSubscription = Boolean(ai?.isSubscription && direction === 'outflow');
    const billingCycle: BillingCycle = isSubscription
      ? ai?.billingCycle && ai.billingCycle !== 'none'
        ? ai.billingCycle
        : 'monthly'
      : 'none';
    const estimatedAnnualCost = isSubscription
      ? ai?.estimatedAnnualCost && ai.estimatedAnnualCost > 0
        ? ai.estimatedAnnualCost
        : row.amount * 12
      : 0;

    return {
      ...row,
      direction,
      cleanMerchant: ai?.cleanMerchant?.trim() || row.rawDescription.slice(0, 32),
      category: sanitizeCategory(ai?.category ?? '', direction),
      isSubscription,
      billingCycle,
      estimatedAnnualCost,
      isLeakage: Boolean(ai?.isLeakage && direction === 'outflow'),
      leakageType: ai?.isLeakage ? ai.leakageType ?? 'discretionary_leak' : 'none',
      leakageReason: ai?.isLeakage ? ai.leakageReason ?? '' : '',
    };
  });

  return applyCrossBatchPriceHikeDetection(merged);
}
