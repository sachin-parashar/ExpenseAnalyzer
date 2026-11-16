import { useMemo, useRef, useState } from 'react';
import { Download, Loader2, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { CashflowCharts } from './components/CashflowCharts';
import { CategorySummaryTables } from './components/CategorySummaryTables';
import { KpiSummaryBar } from './components/KpiSummaryBar';
import { StatementDropzone } from './components/StatementDropzone';
import { SubscriptionsAndLeakages } from './components/SubscriptionsAndLeakages';
import { TransactionLedger } from './components/TransactionLedger';
import { SAMPLE_BANK_STATEMENT_CSV, SAMPLE_STATEMENT_FILENAME } from './data/sampleStatement';
import { analyzeTransactionsInBatches } from './services/analyzeStatement';
import type {
  AnalyzedTransaction,
  ParsedStatementResult,
  TransactionCategory,
} from './types/statement';
import {
  buildCashflowSeries,
  buildCategorySummaries,
  buildSubscriptionAndLeakageSummary,
} from './utils/analytics';
import { parseCsvText, parseStatementFile } from './utils/statementParser';

export default function App() {
  const hiddenFileInputRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<AnalyzedTransaction[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [skippedRows, setSkippedRows] = useState<number>(0);
  const [currencySymbol, setCurrencySymbol] = useState<string>('₹');

  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [minAvailableDate, setMinAvailableDate] = useState<string>('');
  const [maxAvailableDate, setMaxAvailableDate] = useState<string>('');

  const [selectedCategory, setSelectedCategory] = useState<TransactionCategory | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    processedRows: number;
    totalRows: number;
    currentBatch: number;
    totalBatches: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runAnalysisPipeline = async (parsed: ParsedStatementResult) => {
    setIsAnalyzing(true);
    setErrorMessage(null);
    setProgress({
      processedRows: 0,
      totalRows: parsed.rows.length,
      currentBatch: 1,
      totalBatches: Math.ceil(parsed.rows.length / 150),
    });

    try {
      const analyzed = await analyzeTransactionsInBatches(
        parsed.rows,
        parsed.currencySymbol,
        (p) => setProgress(p)
      );

      setTransactions(analyzed);
      setFileName(parsed.fileName);
      setSkippedRows(parsed.skippedHeaderRows);
      setCurrencySymbol(parsed.currencySymbol);
      setMinAvailableDate(parsed.minDate);
      setMaxAvailableDate(parsed.maxDate);
      setDateFrom(parsed.minDate);
      setDateTo(parsed.maxDate);
      setSelectedCategory(null);
      setSelectedMerchant(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while analyzing your statement.';
      setErrorMessage(msg);
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  };

  const handleFileSelected = async (file: File) => {
    setErrorMessage(null);
    try {
      const parsed = await parseStatementFile(file);
      await runAnalysisPipeline(parsed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to parse the selected file.';
      setErrorMessage(msg);
    }
  };

  const handleLoadSample = async () => {
    setErrorMessage(null);
    try {
      const parsed = parseCsvText(SAMPLE_BANK_STATEMENT_CSV, SAMPLE_STATEMENT_FILENAME);
      await runAnalysisPipeline(parsed);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to load the sample statement.';
      setErrorMessage(msg);
    }
  };

  const handleReset = () => {
    setTransactions([]);
    setFileName('');
    setSkippedRows(0);
    setDateFrom('');
    setDateTo('');
    setMinAvailableDate('');
    setMaxAvailableDate('');
    setSelectedCategory(null);
    setSelectedMerchant(null);
    setErrorMessage(null);
  };

  const handleUpdateTransaction = (
    id: string,
    patch: Partial<
      Pick<
        AnalyzedTransaction,
        'cleanMerchant' | 'category' | 'isSubscription' | 'isLeakage' | 'estimatedAnnualCost'
      >
    >
  ) => {
    setTransactions((prev) =>
      prev.map((txn) => (txn.id === id ? { ...txn, ...patch } : txn))
    );
  };

  const dateFilteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      if (dateFrom && txn.date < dateFrom) return false;
      if (dateTo && txn.date > dateTo) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo]);

  const categorySummary = useMemo(
    () => buildCategorySummaries(dateFilteredTransactions),
    [dateFilteredTransactions]
  );

  const dailySeries = useMemo(
    () => buildCashflowSeries(dateFilteredTransactions, 'daily'),
    [dateFilteredTransactions]
  );

  const weeklySeries = useMemo(
    () => buildCashflowSeries(dateFilteredTransactions, 'weekly'),
    [dateFilteredTransactions]
  );

  const subAndLeakSummary = useMemo(
    () => buildSubscriptionAndLeakageSummary(dateFilteredTransactions),
    [dateFilteredTransactions]
  );

  const inflowCount = useMemo(
    () => dateFilteredTransactions.filter((t) => t.direction === 'inflow').length,
    [dateFilteredTransactions]
  );
  const outflowCount = dateFilteredTransactions.length - inflowCount;

  const handleExportCleanedCsv = () => {
    const header = [
      'Date',
      'Clean Merchant',
      'Raw Narration',
      'Direction',
      'Category',
      'Amount',
      'Is Subscription',
      'Billing Cycle',
      'Est. Annual Cost',
      'Is Leakage',
      'Leakage Type',
      'Leakage Reason',
    ];

    const escapeCsv = (val: string | number | boolean) => {
      const s = String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      header.join(','),
      ...dateFilteredTransactions.map((t) =>
        [
          t.date,
          t.cleanMerchant,
          t.rawDescription,
          t.direction,
          t.category,
          t.amount,
          t.isSubscription,
          t.billingCycle,
          t.estimatedAnnualCost,
          t.isLeakage,
          t.leakageType,
          t.leakageReason,
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cleaned_${fileName.replace(/\.(xlsx?|csv)$/i, '') || 'statement'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasData = transactions.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#overview"
            onClick={(e) => {
              if (!hasData) e.preventDefault();
            }}
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            Statement Lens
          </a>

          <nav
            aria-label="Primary sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <a
              href="#overview"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#charts"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Charts
            </a>
            <a
              href="#categories"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Categories
            </a>
            <a
              href="#subscriptions"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Subscriptions
            </a>
            <a
              href="#ledger"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Ledger
            </a>
          </nav>

          <div className="shrink-0">
            <input
              ref={hiddenFileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
                e.target.value = '';
              }}
            />
            {hasData ? (
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={() => hiddenFileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>Upload Statement</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isAnalyzing}
                onClick={handleLoadSample}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isAnalyzing && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                )}
                <span>Load Sample Statement</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Visible Zero-DB Privacy Badge + Active Workspace Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs text-emerald-900">
            <ShieldCheck
              className="w-4 h-4 text-emerald-700 shrink-0"
              aria-hidden="true"
            />
            <span className="font-medium">
              Your bank data is processed in memory and never stored on a server.
            </span>
          </div>

          {hasData && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="font-mono-tabular text-slate-700">
                {fileName} · {transactions.length} rows
                {skippedRows > 0 ? ` · ${skippedRows} metadata rows skipped` : ''}
              </span>
            </div>
          )}
        </div>

        {!hasData ? (
          <StatementDropzone
            onFileSelected={handleFileSelected}
            onLoadSample={handleLoadSample}
            isAnalyzing={isAnalyzing}
            progress={progress}
            errorMessage={errorMessage}
          />
        ) : (
          <>
            {/* Error Banner if a subsequent upload failed */}
            {errorMessage && (
              <div
                role="alert"
                className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between gap-4"
              >
                <span>
                  <strong className="font-semibold">Error: </strong>
                  {errorMessage}
                </span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-rose-700 hover:text-rose-950 font-medium underline cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Analyzing Overlay Banner when replacing current statement */}
            {isAnalyzing && progress && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-slate-900 animate-spin" aria-hidden="true" />
                  <span className="text-xs font-medium text-slate-900">
                    Analyzing batch {progress.currentBatch} of {progress.totalBatches} (
                    {progress.processedRows}/{progress.totalRows} rows)...
                  </span>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500">
                  {Math.round((progress.processedRows / progress.totalRows) * 100)}%
                </span>
              </div>
            )}

            {/* Workspace Filter & Action Toolbar */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-2 text-slate-600">
                  <span className="font-medium">From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    min={minAvailableDate}
                    max={dateTo || maxAvailableDate}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono-tabular text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </label>

                <label className="flex items-center gap-2 text-slate-600">
                  <span className="font-medium">To</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || minAvailableDate}
                    max={maxAvailableDate}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono-tabular text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </label>

                {(dateFrom !== minAvailableDate || dateTo !== maxAvailableDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom(minAvailableDate);
                      setDateTo(maxAvailableDate);
                    }}
                    className="text-slate-600 hover:text-slate-900 underline underline-offset-2 cursor-pointer"
                  >
                    Reset dates
                  </button>
                )}

                <label className="flex items-center gap-2 text-slate-600 ml-1">
                  <span className="font-medium">Currency</span>
                  <select
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-mono-tabular text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 cursor-pointer"
                  >
                    <option value="₹">₹ INR</option>
                    <option value="$">$ USD</option>
                    <option value="€">€ EUR</option>
                    <option value="£">£ GBP</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExportCleanedCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Export Cleaned CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Clear Memory</span>
                </button>
              </div>
            </div>

            {/* 1. Top KPI Summary Bar */}
            <KpiSummaryBar
              totalReceived={categorySummary.totalInflow}
              totalSpent={categorySummary.totalOutflow}
              inflowCount={inflowCount}
              outflowCount={outflowCount}
              annualSubAndLeakageCost={subAndLeakSummary.combinedAnnualCost}
              subscriptionCount={subAndLeakSummary.subscriptions.length}
              leakageCount={subAndLeakSummary.leakages.length}
              currencySymbol={currencySymbol}
              onInspectLeakages={() => {
                document
                  .getElementById('subscriptions')
                  ?.scrollIntoView({ behavior: 'smooth' });
              }}
            />

            {/* 2. Visual Cashflow & Category Breakdown Charts (directly above summary tables) */}
            <CashflowCharts
              dailySeries={dailySeries}
              weeklySeries={weeklySeries}
              inflowCategories={categorySummary.inflows}
              outflowCategories={categorySummary.outflows}
              currencySymbol={currencySymbol}
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => {
                setSelectedCategory(cat);
                if (cat) {
                  setSelectedMerchant(null);
                }
              }}
            />

            {/* 3. Side-by-Side Category Summary Tables */}
            <CategorySummaryTables
              inflows={categorySummary.inflows}
              outflows={categorySummary.outflows}
              totalInflow={categorySummary.totalInflow}
              totalOutflow={categorySummary.totalOutflow}
              currencySymbol={currencySymbol}
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => {
                setSelectedCategory(cat);
                if (cat) {
                  setSelectedMerchant(null);
                  document
                    .getElementById('ledger')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            />

            {/* 4. Subscriptions & Money Leakages Inspector */}
            <SubscriptionsAndLeakages
              subscriptions={subAndLeakSummary.subscriptions}
              leakages={subAndLeakSummary.leakages}
              totalAnnualSubscriptionCost={subAndLeakSummary.totalAnnualSubscriptionCost}
              totalAnnualLeakageImpact={subAndLeakSummary.totalAnnualLeakageImpact}
              currencySymbol={currencySymbol}
              selectedMerchant={selectedMerchant}
              onSelectMerchant={(merchant) => {
                setSelectedMerchant(merchant);
                if (merchant) {
                  setSelectedCategory(null);
                  document
                    .getElementById('ledger')
                    ?.scrollIntoView({ behavior: 'smooth' });
                }
              }}
            />

            {/* 5. Interactive Transaction Ledger */}
            <TransactionLedger
              transactions={dateFilteredTransactions}
              currencySymbol={currencySymbol}
              selectedCategory={selectedCategory}
              selectedMerchant={selectedMerchant}
              onClearCategory={() => setSelectedCategory(null)}
              onClearMerchant={() => setSelectedMerchant(null)}
              onUpdateTransaction={handleUpdateTransaction}
            />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Statement Lens: Subscription &amp; Money Leakage Detector</span>
          <span>100% client-side memory · Zero server persistence</span>
        </div>
      </footer>
    </div>
  );
}
