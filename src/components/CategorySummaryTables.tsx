import type { CategorySummaryRow, TransactionCategory } from '../types/statement';
import { formatCurrency } from '../utils/analytics';

interface CategorySummaryTablesProps {
  inflows: CategorySummaryRow[];
  outflows: CategorySummaryRow[];
  totalInflow: number;
  totalOutflow: number;
  currencySymbol: string;
  selectedCategory: TransactionCategory | null;
  onSelectCategory: (category: TransactionCategory | null) => void;
}

export function CategorySummaryTables({
  inflows,
  outflows,
  totalInflow,
  totalOutflow,
  currencySymbol,
  selectedCategory,
  onSelectCategory,
}: CategorySummaryTablesProps) {
  return (
    <section
      id="categories"
      aria-label="Category Summary Breakdown Tables"
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* Left: Where Money Came From */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Where Money Came From
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any inflow category to filter the ledger
            </p>
          </div>
          <span className="text-sm font-semibold text-emerald-700 font-mono-tabular shrink-0">
            {formatCurrency(totalInflow, currencySymbol)}
          </span>
        </div>

        {inflows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No inflow categories found for the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-5">Category</th>
                  <th className="py-2.5 px-3 text-right">Txns</th>
                  <th className="py-2.5 px-3 text-right">Share</th>
                  <th className="py-2.5 px-5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {inflows.map((row) => {
                  const isActive = selectedCategory === row.category;
                  return (
                    <tr
                      key={row.category}
                      onClick={() =>
                        onSelectCategory(isActive ? null : row.category)
                      }
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-emerald-50/80 text-slate-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <td className="py-3 px-5">
                        <div className="font-medium text-slate-900">{row.category}</div>
                        <div className="mt-1.5 h-1.5 w-full max-w-[180px] bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${Math.min(100, row.percentage)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-500">
                        {row.count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-600">
                        {row.percentage.toFixed(1)}%
                      </td>
                      <td className="py-3 px-5 text-right font-mono-tabular font-medium text-emerald-700">
                        {formatCurrency(row.totalAmount, currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Right: Where Money Went */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Where Money Went
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any expense category to filter the ledger
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-900 font-mono-tabular shrink-0">
            {formatCurrency(totalOutflow, currencySymbol)}
          </span>
        </div>

        {outflows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No outflow categories found for the selected date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-5">Category</th>
                  <th className="py-2.5 px-3 text-right">Txns</th>
                  <th className="py-2.5 px-3 text-right">Share</th>
                  <th className="py-2.5 px-5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {outflows.map((row) => {
                  const isActive = selectedCategory === row.category;
                  const isFee = row.category === 'Bank Fees & Charges';
                  return (
                    <tr
                      key={row.category}
                      onClick={() =>
                        onSelectCategory(isActive ? null : row.category)
                      }
                      className={`cursor-pointer transition-colors ${
                        isActive
                          ? 'bg-rose-50/70 text-slate-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <td className="py-3 px-5">
                        <div className="font-medium text-slate-900">{row.category}</div>
                        <div className="mt-1.5 h-1.5 w-full max-w-[180px] bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isFee ? 'bg-amber-500' : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(100, row.percentage)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-500">
                        {row.count}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-xs text-slate-600">
                        {row.percentage.toFixed(1)}%
                      </td>
                      <td className="py-3 px-5 text-right font-mono-tabular font-medium text-slate-900">
                        {formatCurrency(row.totalAmount, currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
