import { AlertTriangle, ArrowDownRight, ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/analytics';

interface KpiSummaryBarProps {
  totalReceived: number;
  totalSpent: number;
  inflowCount: number;
  outflowCount: number;
  annualSubAndLeakageCost: number;
  subscriptionCount: number;
  leakageCount: number;
  currencySymbol: string;
  onInspectLeakages: () => void;
}

export function KpiSummaryBar({
  totalReceived,
  totalSpent,
  inflowCount,
  outflowCount,
  annualSubAndLeakageCost,
  subscriptionCount,
  leakageCount,
  currencySymbol,
  onInspectLeakages,
}: KpiSummaryBarProps) {
  const netCashflow = totalReceived - totalSpent;
  const isSurplus = netCashflow >= 0;
  const savingsRate =
    totalReceived > 0 ? Math.round((netCashflow / totalReceived) * 1000) / 10 : 0;

  return (
    <section
      id="overview"
      aria-label="Statement Key Performance Indicators"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {/* Total Money Received */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Total Money Received</span>
          <ArrowDownRight className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3">
          <p className="text-2xl font-semibold tracking-tight text-emerald-700 font-mono-tabular">
            {formatCurrency(totalReceived, currencySymbol)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {inflowCount} {inflowCount === 1 ? 'inflow transaction' : 'inflow transactions'}
          </p>
        </div>
      </div>

      {/* Total Money Spent */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Total Money Spent</span>
          <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3">
          <p className="text-2xl font-semibold tracking-tight text-slate-900 font-mono-tabular">
            {formatCurrency(totalSpent, currencySymbol)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {outflowCount} {outflowCount === 1 ? 'outflow transaction' : 'outflow transactions'}
          </p>
        </div>
      </div>

      {/* Net Cashflow */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Net Cashflow</span>
          {isSurplus ? (
            <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
          )}
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p
              className={`text-2xl font-semibold tracking-tight font-mono-tabular ${
                isSurplus ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {isSurplus ? '+' : ''}
              {formatCurrency(netCashflow, currencySymbol)}
            </p>
            <span
              className={`text-xs font-medium ${
                isSurplus ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {isSurplus ? 'Surplus' : 'Deficit'}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">
            {totalReceived > 0
              ? `${savingsRate >= 0 ? '+' : ''}${savingsRate}% of total inflows retained`
              : 'No inflows in selected range'}
          </p>
        </div>
      </div>

      {/* Estimated Annual Subscription & Leakage Cost */}
      <button
        type="button"
        onClick={onInspectLeakages}
        className="text-left bg-amber-50/90 hover:bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-col justify-between transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 cursor-pointer"
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <span className="text-xs font-semibold text-amber-900">
            Est. Annual Subscription &amp; Leakage Cost
          </span>
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
        </div>
        <div className="mt-3">
          <p className="text-2xl font-semibold tracking-tight text-amber-950 font-mono-tabular">
            {formatCurrency(annualSubAndLeakageCost, currencySymbol)}
            <span className="text-xs font-normal text-amber-800 ml-1">/yr</span>
          </p>
          <p className="mt-1.5 text-xs text-amber-800 tabular-nums">
            {subscriptionCount} {subscriptionCount === 1 ? 'subscription' : 'subscriptions'} ·{' '}
            {leakageCount} {leakageCount === 1 ? 'leakage alert' : 'leakage alerts'}
          </p>
        </div>
      </button>
    </section>
  );
}
