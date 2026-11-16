import { useMemo, useState } from 'react';
import { ArrowUpDown, Check, Pencil, Search, X } from 'lucide-react';
import {
  INFLOW_CATEGORIES,
  OUTFLOW_CATEGORIES,
  type AnalyzedTransaction,
  type TransactionCategory,
} from '../types/statement';
import { formatCurrency } from '../utils/analytics';

type LedgerFilterTab = 'all' | 'inflow' | 'outflow' | 'subscriptions' | 'leakages';
type SortField = 'date' | 'amount';

interface TransactionLedgerProps {
  transactions: AnalyzedTransaction[];
  currencySymbol: string;
  selectedCategory: TransactionCategory | null;
  selectedMerchant: string | null;
  onClearCategory: () => void;
  onClearMerchant: () => void;
  onUpdateTransaction: (
    id: string,
    patch: Partial<
      Pick<
        AnalyzedTransaction,
        'cleanMerchant' | 'category' | 'isSubscription' | 'isLeakage' | 'estimatedAnnualCost'
      >
    >
  ) => void;
}

export function TransactionLedger({
  transactions,
  currencySymbol,
  selectedCategory,
  selectedMerchant,
  onClearCategory,
  onClearMerchant,
  onUpdateTransaction,
}: TransactionLedgerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<LedgerFilterTab>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftMerchant, setDraftMerchant] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return transactions
      .filter((txn) => {
        if (selectedCategory && txn.category !== selectedCategory) return false;
        if (
          selectedMerchant &&
          txn.cleanMerchant.toLowerCase() !== selectedMerchant.toLowerCase()
        ) {
          return false;
        }
        if (activeTab === 'inflow' && txn.direction !== 'inflow') return false;
        if (activeTab === 'outflow' && txn.direction !== 'outflow') return false;
        if (activeTab === 'subscriptions' && !txn.isSubscription) return false;
        if (activeTab === 'leakages' && !txn.isLeakage) return false;

        if (q) {
          const hay = `${txn.cleanMerchant} ${txn.rawDescription} ${txn.category} ${txn.leakageReason}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const cmp =
          sortField === 'date'
            ? a.date.localeCompare(b.date)
            : a.amount - b.amount;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [
    transactions,
    selectedCategory,
    selectedMerchant,
    activeTab,
    searchQuery,
    sortField,
    sortDir,
  ]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const startEditing = (txn: AnalyzedTransaction) => {
    setEditingId(txn.id);
    setDraftMerchant(txn.cleanMerchant);
  };

  const commitMerchantEdit = (id: string) => {
    const trimmed = draftMerchant.trim();
    if (trimmed) {
      onUpdateTransaction(id, { cleanMerchant: trimmed });
    }
    setEditingId(null);
  };

  return (
    <section
      id="ledger"
      aria-label="Normalized Transaction Ledger"
      className="bg-white border border-slate-200 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Normalized Transaction Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Showing {filtered.length} of {transactions.length} transactions · Edit merchant
              names, categories, or flags directly in memory
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search merchant, narration, category..."
              aria-label="Search transactions"
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Transaction type filter"
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
          >
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'inflow', label: 'Money Received' },
                { id: 'outflow', label: 'Money Spent' },
                { id: 'subscriptions', label: 'Subscriptions' },
                { id: 'leakages', label: 'Leakages' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(selectedCategory || selectedMerchant) && (
            <div className="flex items-center gap-3 text-xs text-slate-700">
              {selectedCategory && (
                <button
                  type="button"
                  onClick={onClearCategory}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md font-medium cursor-pointer"
                >
                  <span>Category: {selectedCategory}</span>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              {selectedMerchant && (
                <button
                  type="button"
                  onClick={onClearMerchant}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-md font-medium cursor-pointer"
                >
                  <span>Merchant: {selectedMerchant}</span>
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            No transactions match the current filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveTab('all');
              onClearCategory();
              onClearMerchant();
            }}
            className="mt-3 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            Reset all ledger filters
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-5 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('date')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Date</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-4">Merchant &amp; Raw Narration</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Flags</th>
                <th className="py-2.5 px-5 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('amount')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer ml-auto"
                  >
                    <span>Amount</span>
                    <ArrowUpDown className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((txn) => {
                const isEditing = editingId === txn.id;
                const categoryOptions =
                  txn.direction === 'inflow' ? INFLOW_CATEGORIES : OUTFLOW_CATEGORIES;

                return (
                  <tr
                    key={txn.id}
                    className="hover:bg-slate-50/70 transition-colors align-top"
                  >
                    <td className="py-3 px-5 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                      {txn.date}
                    </td>

                    <td className="py-3 px-4 max-w-md">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={draftMerchant}
                            onChange={(e) => setDraftMerchant(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitMerchantEdit(txn.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-900 w-52 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                          />
                          <button
                            type="button"
                            onClick={() => commitMerchantEdit(txn.id)}
                            aria-label="Save merchant name"
                            className="p-1 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            aria-label="Cancel edit"
                            className="p-1 text-slate-500 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group">
                          <span className="font-medium text-slate-900">
                            {txn.cleanMerchant}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditing(txn)}
                            aria-label={`Edit merchant name for ${txn.cleanMerchant}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-slate-700 rounded transition-opacity cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <p className="text-xs font-mono text-slate-400 mt-0.5 truncate max-w-sm">
                        {txn.rawDescription}
                      </p>
                      {txn.isLeakage && txn.leakageReason && (
                        <p className="text-xs text-amber-800 mt-1">
                          {txn.leakageReason}
                        </p>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        value={txn.category}
                        aria-label={`Category for ${txn.cleanMerchant}`}
                        onChange={(e) =>
                          onUpdateTransaction(txn.id, {
                            category: e.target.value as TransactionCategory,
                          })
                        }
                        className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/15 cursor-pointer"
                      >
                        {categoryOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {txn.direction === 'outflow' ? (
                        <div className="flex items-center gap-3 text-xs">
                          <label className="inline-flex items-center gap-1.5 text-slate-600 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={txn.isSubscription}
                              onChange={(e) =>
                                onUpdateTransaction(txn.id, {
                                  isSubscription: e.target.checked,
                                  estimatedAnnualCost: e.target.checked
                                    ? txn.amount * 12
                                    : 0,
                                })
                              }
                              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900/20"
                            />
                            <span>Sub</span>
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-amber-800 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={txn.isLeakage}
                              onChange={(e) =>
                                onUpdateTransaction(txn.id, {
                                  isLeakage: e.target.checked,
                                })
                              }
                              className="rounded border-amber-400 text-amber-700 focus:ring-amber-600/20"
                            />
                            <span>Leakage</span>
                          </label>
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-700">Inflow</span>
                      )}
                    </td>

                    <td
                      className={`py-3 px-5 text-right font-mono-tabular font-medium whitespace-nowrap ${
                        txn.direction === 'inflow'
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {txn.direction === 'inflow' ? '+' : '-'}
                      {formatCurrency(txn.amount, currencySymbol)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
