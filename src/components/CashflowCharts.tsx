import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategorySummaryRow, TransactionCategory } from '../types/statement';
import { formatCurrency } from '../utils/analytics';

interface CashflowPoint {
  sortKey: string;
  label: string;
  received: number;
  spent: number;
  net: number;
}

interface CashflowChartsProps {
  dailySeries: CashflowPoint[];
  weeklySeries: CashflowPoint[];
  inflowCategories: CategorySummaryRow[];
  outflowCategories: CategorySummaryRow[];
  currencySymbol: string;
  selectedCategory: TransactionCategory | null;
  onSelectCategory: (category: TransactionCategory | null) => void;
}

const EXPENSE_PALETTE = [
  '#0F172A',
  '#E11D48',
  '#D97706',
  '#2563EB',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#4F46E5',
  '#64748B',
  '#94A3B8',
];

const INCOME_PALETTE = [
  '#059669',
  '#10B981',
  '#0D9488',
  '#0284C7',
  '#65A30D',
];

interface PieSliceDatum {
  name: TransactionCategory;
  value: number;
  percentage: number;
  count: number;
  color: string;
}

export function CashflowCharts({
  dailySeries,
  weeklySeries,
  inflowCategories,
  outflowCategories,
  currencySymbol,
  selectedCategory,
  onSelectCategory,
}: CashflowChartsProps) {
  const [cashflowGrouping, setCashflowGrouping] = useState<'daily' | 'weekly'>(() =>
    dailySeries.length > 18 ? 'weekly' : 'daily'
  );
  const [pieMode, setPieMode] = useState<'expenses' | 'received'>('expenses');

  const activeSeries = cashflowGrouping === 'weekly' ? weeklySeries : dailySeries;

  const pieData: PieSliceDatum[] = useMemo(() => {
    const source = pieMode === 'expenses' ? outflowCategories : inflowCategories;
    const palette = pieMode === 'expenses' ? EXPENSE_PALETTE : INCOME_PALETTE;
    return source.map((item, idx) => ({
      name: item.category,
      value: Math.round(item.totalAmount * 100) / 100,
      percentage: item.percentage,
      count: item.count,
      color: palette[idx % palette.length],
    }));
  }, [pieMode, outflowCategories, inflowCategories]);

  return (
    <section
      id="charts"
      aria-label="Visual Cashflow and Category Distribution Charts"
      className="grid grid-cols-1 lg:grid-cols-12 gap-6"
    >
      {/* Left Chart — Money In vs. Money Out Cashflow Trend */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Money In vs. Money Out Cashflow Trend
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Emerald inflows compared against rose outflows across the period
            </p>
          </div>
          <div
            role="group"
            aria-label="Cashflow grouping"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
          >
            <button
              type="button"
              onClick={() => setCashflowGrouping('daily')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                cashflowGrouping === 'daily'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setCashflowGrouping('weekly')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                cashflowGrouping === 'weekly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Weekly
            </button>
          </div>
        </div>

        <div className="w-full h-[300px]">
          {activeSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              No cashflow data in the selected date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={activeSeries}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  width={68}
                  tickFormatter={(v: number) => formatCurrency(v, currencySymbol, true)}
                />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const row = payload[0].payload as CashflowPoint;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs">
                        <p className="font-semibold text-slate-900 mb-1.5">{label}</p>
                        <div className="space-y-1 font-mono-tabular">
                          <div className="flex items-center justify-between gap-5">
                            <span className="text-emerald-700">Money Received</span>
                            <span className="font-medium text-emerald-700">
                              {formatCurrency(row.received, currencySymbol)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-5">
                            <span className="text-rose-600">Money Spent</span>
                            <span className="font-medium text-rose-600">
                              {formatCurrency(row.spent, currencySymbol)}
                            </span>
                          </div>
                          <div className="border-t border-slate-100 pt-1 flex items-center justify-between gap-5">
                            <span className="text-slate-500">Net</span>
                            <span
                              className={`font-semibold ${
                                row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {row.net >= 0 ? '+' : ''}
                              {formatCurrency(row.net, currencySymbol)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="received"
                  name="Money Received"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  dataKey="spent"
                  name="Money Spent"
                  fill="#F43F5E"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Right Chart — Spending & Income Distribution Donut */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
        <div className="flex flex-col gap-3 mb-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              Spending &amp; Income Distribution
            </h2>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Clear slice filter
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Distribution mode"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start"
          >
            <button
              type="button"
              onClick={() => setPieMode('expenses')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pieMode === 'expenses'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Where Money Went (Expenses)
            </button>
            <button
              type="button"
              onClick={() => setPieMode('received')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pieMode === 'received'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Where Money Came From (Received)
            </button>
          </div>
        </div>

        <div className="w-full h-[300px] flex flex-col sm:flex-row items-center">
          {pieData.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-sm text-slate-500">
              No {pieMode === 'expenses' ? 'expense' : 'income'} categories in selected range.
            </div>
          ) : (
            <>
              <div className="w-full sm:w-3/5 h-[220px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                      label={({ percent }) => {
                        const pct = Math.round((percent ?? 0) * 100);
                        return pct >= 5 ? `${pct}%` : '';
                      }}
                      labelLine={false}
                      onClick={(_data, index) => {
                        const entry = pieData[index];
                        if (!entry) return;
                        onSelectCategory(
                          selectedCategory === entry.name ? null : entry.name
                        );
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      {pieData.map((entry) => {
                        const isDimmed =
                          selectedCategory !== null && selectedCategory !== entry.name;
                        return (
                          <Cell
                            key={entry.name}
                            fill={entry.color}
                            fillOpacity={isDimmed ? 0.28 : 1}
                            stroke={selectedCategory === entry.name ? '#0F172A' : '#FFFFFF'}
                            strokeWidth={selectedCategory === entry.name ? 2 : 1}
                          />
                        );
                      })}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const d = payload[0].payload as PieSliceDatum;
                        return (
                          <div className="bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm text-xs">
                            <p className="font-semibold text-slate-900">{d.name}</p>
                            <p className="mt-1 font-mono-tabular text-slate-800 font-medium">
                              {formatCurrency(d.value, currencySymbol)} ({d.percentage.toFixed(1)}%)
                            </p>
                            <p className="text-slate-500 mt-0.5">
                              {d.count} {d.count === 1 ? 'transaction' : 'transactions'} · Click to filter
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Compact interactive category legend */}
              <div className="w-full sm:w-2/5 max-h-[260px] overflow-y-auto pr-1 space-y-1.5 text-xs">
                {pieData.map((item) => {
                  const isSelected = selectedCategory === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() =>
                        onSelectCategory(isSelected ? null : item.name)
                      }
                      className={`w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span
                        className={`font-mono-tabular shrink-0 ${
                          isSelected ? 'text-slate-200' : 'text-slate-500'
                        }`}
                      >
                        {item.percentage.toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
