import { AlertTriangle, Repeat, TrendingUp } from 'lucide-react';
import type { LeakageSummary, LeakageType, SubscriptionSummary } from '../types/statement';
import { formatCurrency } from '../utils/analytics';

interface SubscriptionsAndLeakagesProps {
  subscriptions: SubscriptionSummary[];
  leakages: LeakageSummary[];
  totalAnnualSubscriptionCost: number;
  totalAnnualLeakageImpact: number;
  currencySymbol: string;
  selectedMerchant: string | null;
  onSelectMerchant: (merchant: string | null) => void;
}

const LEAKAGE_LABELS: Record<LeakageType, string> = {
  bank_fee: 'Bank Fee',
  duplicate_subscription: 'Overlapping Subscription',
  micro_spend: 'Micro-Spend Drain',
  price_hike: 'Price Increase',
  discretionary_leak: 'Discretionary Leak',
  none: 'Flagged Item',
};

export function SubscriptionsAndLeakages({
  subscriptions,
  leakages,
  totalAnnualSubscriptionCost,
  totalAnnualLeakageImpact,
  currencySymbol,
  selectedMerchant,
  onSelectMerchant,
}: SubscriptionsAndLeakagesProps) {
  return (
    <section
      id="subscriptions"
      aria-label="Detected Subscriptions and Money Leakages"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* Recurring Subscriptions */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Repeat className="w-4 h-4 text-slate-600 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                Detected Recurring Subscriptions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Annualized from active monthly, quarterly, or annual plans
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-slate-900 font-mono-tabular">
              {formatCurrency(totalAnnualSubscriptionCost, currencySymbol)}/yr
            </p>
            <p className="text-xs text-slate-500 tabular-nums">
              {subscriptions.length} active
            </p>
          </div>
        </div>

        {subscriptions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No recurring subscriptions detected in the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-5">Service</th>
                  <th className="py-2.5 px-3 text-right">Monthly Eq.</th>
                  <th className="py-2.5 px-5 text-right">Annualized</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {subscriptions.map((sub) => {
                  const isActive =
                    selectedMerchant?.toLowerCase() === sub.merchant.toLowerCase();
                  return (
                    <tr
                      key={sub.merchant}
                      onClick={() =>
                        onSelectMerchant(isActive ? null : sub.merchant)
                      }
                      className={`cursor-pointer transition-colors ${
                        isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900">
                            {sub.merchant}
                          </span>
                          {sub.hasPriceHike && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800">
                              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                              +{formatCurrency(sub.priceChangeDelta, currencySymbol)} hike
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {sub.billingCycle} · {sub.occurrences}{' '}
                          {sub.occurrences === 1 ? 'charge' : 'charges'} · latest{' '}
                          {formatCurrency(sub.latestAmount, currencySymbol)}
                        </p>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-600">
                        {formatCurrency(sub.monthlyEquivalent, currencySymbol)}/mo
                      </td>
                      <td className="py-3 px-5 text-right font-mono-tabular font-semibold text-slate-900">
                        {formatCurrency(sub.estimatedAnnualCost, currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Money Leakages */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 bg-amber-50/60 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-amber-950 truncate">
                Flagged Money Leakages
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                Bank fees, overlapping subscriptions, price hikes, and micro-drains
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-amber-950 font-mono-tabular">
              {formatCurrency(totalAnnualLeakageImpact, currencySymbol)}/yr
            </p>
            <p className="text-xs text-amber-800 tabular-nums">
              {leakages.length} {leakages.length === 1 ? 'finding' : 'findings'}
            </p>
          </div>
        </div>

        {leakages.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No money leakages flagged in the selected date range.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {leakages.map((leak) => {
              const isActive =
                selectedMerchant?.toLowerCase() === leak.merchant.toLowerCase();
              return (
                <button
                  key={leak.id}
                  type="button"
                  onClick={() =>
                    onSelectMerchant(isActive ? null : leak.merchant)
                  }
                  className={`w-full text-left px-5 py-3.5 transition-colors flex items-start justify-between gap-4 cursor-pointer ${
                    isActive ? 'bg-amber-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-amber-800 font-medium">
                      <span>{LEAKAGE_LABELS[leak.leakageType]}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-500 font-normal tabular-nums">
                        {leak.occurrences}{' '}
                        {leak.occurrences === 1 ? 'occurrence' : 'occurrences'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {leak.merchant}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {leak.reason}
                    </p>
                  </div>
                  <div className="text-right shrink-0 font-mono-tabular">
                    <p className="text-sm font-semibold text-amber-900">
                      {formatCurrency(leak.estimatedAnnualImpact, currencySymbol)}/yr
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatCurrency(leak.observedAmount, currencySymbol)} observed
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
