import { useRef, useState, type DragEvent } from 'react';
import { FileSpreadsheet, Loader2, Sparkles, Upload } from 'lucide-react';

interface StatementDropzoneProps {
  onFileSelected: (file: File) => void;
  onLoadSample: () => void;
  isAnalyzing: boolean;
  progress: {
    processedRows: number;
    totalRows: number;
    currentBatch: number;
    totalBatches: number;
  } | null;
  errorMessage: string | null;
}

export function StatementDropzone({
  onFileSelected,
  onLoadSample,
  isAnalyzing,
  progress,
  errorMessage,
}: StatementDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAnalyzing) setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isAnalyzing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
  };

  const pct =
    progress && progress.totalRows > 0
      ? Math.round((progress.processedRows / progress.totalRows) * 100)
      : 0;

  return (
    <section
      aria-label="Upload Bank Statement"
      className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10"
    >
      <div className="max-w-3xl mx-auto">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Uncover Hidden Subscriptions &amp; Money Leakages
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Drop any raw CSV or Excel bank statement. Statement Lens skips bank summary
            headers automatically, cleans cryptic merchant codes, and surfaces recurring
            drains in seconds.
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mt-7 border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragging
              ? 'border-emerald-600 bg-emerald-50/50'
              : 'border-slate-300 bg-slate-50/50 hover:border-slate-400'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
              e.target.value = '';
            }}
          />

          {isAnalyzing ? (
            <div className="py-4 max-w-md mx-auto">
              <Loader2
                className="w-8 h-8 text-slate-900 animate-spin mx-auto"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {progress
                  ? `Analyzing batch ${progress.currentBatch} of ${progress.totalBatches} (${progress.processedRows}/${progress.totalRows} rows)`
                  : 'Parsing statement rows...'}
              </p>
              <div className="mt-3 h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.max(8, pct)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Cleaning merchant names, classifying inflows/outflows, and detecting
                subscriptions.
              </p>
            </div>
          ) : (
            <>
              <div className="w-11 h-11 rounded-lg bg-white border border-slate-200 flex items-center justify-center mx-auto text-slate-700">
                <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="mt-3.5 text-sm font-semibold text-slate-900">
                Drag and drop your bank or credit card statement
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports .csv, .xlsx, and .xls · Automatically skips top account metadata rows
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  <span>Select Statement File</span>
                </button>

                <button
                  type="button"
                  onClick={onLoadSample}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                  <span>Load Sample Bank Statement</span>
                </button>
              </div>
            </>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800"
          >
            <strong className="font-semibold">Unable to process statement: </strong>
            {errorMessage}
          </div>
        )}
      </div>
    </section>
  );
}
