import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { ParsedStatementResult, RawTransactionRow, TransactionDirection } from '../types/statement';

const DATE_HEADER_KEYWORDS = [
  'date',
  'txn date',
  'transaction date',
  'trans date',
  'value date',
  'posting date',
  'post date',
  'booked date',
];

const DESC_HEADER_KEYWORDS = [
  'description',
  'narration',
  'particulars',
  'transaction details',
  'details',
  'merchant',
  'memo',
  'remarks',
  'payee',
];

const DEBIT_HEADER_KEYWORDS = [
  'debit',
  'withdrawal',
  'withdrawals',
  'dr',
  'paid out',
  'debit amount',
  'withdrawal amt',
  'outflow',
];

const CREDIT_HEADER_KEYWORDS = [
  'credit',
  'deposit',
  'deposits',
  'cr',
  'paid in',
  'credit amount',
  'deposit amt',
  'inflow',
];

const AMOUNT_HEADER_KEYWORDS = ['amount', 'amt', 'txn amount', 'transaction amount', 'value'];
const TYPE_HEADER_KEYWORDS = ['type', 'dr/cr', 'cr/dr', 'd/c', 'transaction type', 'indicator'];

const SKIP_SUMMARY_PATTERNS = [
  'opening balance',
  'closing balance',
  'brought forward',
  'carried forward',
  'total debits',
  'total credits',
  'statement summary',
  'page total',
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function normalizeCell(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  return String(cell).trim();
}

function headerMatches(header: string, keywords: string[]): boolean {
  const lower = header
    .toLowerCase()
    .replace(/[^a-z0-9/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!lower) return false;
  return keywords.some((kw) => {
    if (lower === kw) return true;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s|/)${escaped}(?:$|\\s|/)`).test(lower);
  });
}

function detectCurrencySymbol(matrix: string[][], headerRowIdx: number): string {
  const counts: Record<string, number> = { '₹': 0, $: 0, '€': 0, '£': 0 };
  const sampleLimit = Math.min(matrix.length, headerRowIdx + 80);

  for (let r = 0; r < sampleLimit; r++) {
    const line = matrix[r].join(' ');
    if (line.includes('₹') || /\b(INR|RS\.?)\b/i.test(line)) counts['₹'] += 2;
    if (/\b(UPI|NEFT|IMPS|RTGS|BBPS|RAZORPAY)\b/i.test(line)) counts['₹'] += 1;
    if (line.includes('$') || /\bUSD\b/i.test(line)) counts['$'] += 2;
    if (/\b(ACH|VENMO|ZELLE|401K)\b/i.test(line)) counts['$'] += 1;
    if (line.includes('€') || /\bEUR\b/i.test(line)) counts['€'] += 2;
    if (line.includes('£') || /\bGBP\b/i.test(line)) counts['£'] += 2;
  }

  let best = '$';
  let bestScore = 0;
  for (const [sym, score] of Object.entries(counts)) {
    if (score > bestScore) {
      bestScore = score;
      best = sym;
    }
  }
  return best;
}

function parseNumericAmount(raw: string): { value: number | null; isNegative: boolean; tag?: 'CR' | 'DR' } {
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '-' || cleaned === '--' || cleaned.toLowerCase() === 'null') {
    return { value: null, isNegative: false };
  }

  let tag: 'CR' | 'DR' | undefined;
  if (/\bCR\b/i.test(cleaned)) tag = 'CR';
  if (/\bDR\b/i.test(cleaned)) tag = 'DR';

  const hasParens = /^\(.*\)$/.test(cleaned);
  const hasMinus = cleaned.startsWith('-') || cleaned.includes(' -') || tag === 'DR';

  const numericStr = cleaned
    .replace(/[₹$€£,\s]/g, '')
    .replace(/\b(INR|USD|EUR|GBP|RS\.?|CR|DR)\b/gi, '')
    .replace(/[()]/g, '')
    .replace(/^\+/, '');

  const parsed = Number(numericStr);
  if (!Number.isFinite(parsed)) {
    return { value: null, isNegative: false };
  }

  const isNegative = hasParens || hasMinus || parsed < 0;
  return {
    value: Math.abs(parsed),
    isNegative,
    tag,
  };
}

function inferSlashDateOrder(rawDates: string[]): 'DMY' | 'MDY' {
  let dmyEvidence = 0;
  let mdyEvidence = 0;
  for (const raw of rawDates) {
    const m = raw.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!m) continue;
    const first = Number(m[1]);
    const second = Number(m[2]);
    if (first > 12) dmyEvidence++;
    if (second > 12) mdyEvidence++;
  }
  if (mdyEvidence > dmyEvidence) return 'MDY';
  return 'DMY';
}

function formatIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1970 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function normalizeDate(raw: unknown, slashOrder: 'DMY' | 'MDY'): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return formatIsoDate(raw.getFullYear(), raw.getMonth() + 1, raw.getDate());
  }

  if (typeof raw === 'number' && raw > 25000 && raw < 75000) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      return formatIsoDate(parsed.y, parsed.m, parsed.d);
    }
  }

  const s = normalizeCell(raw);
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s.*|T.*)?$/);
  if (isoMatch) {
    return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // DD-MMM-YYYY or DD MMM YY (e.g., 14-Oct-2026, 03 Nov 26)
  const textMonthMatch = s.match(/^(\d{1,2})[\s/-]+([A-Za-z]{3,9})[\s/-]+(\d{2,4})/);
  if (textMonthMatch) {
    const day = Number(textMonthMatch[1]);
    const month = MONTHS[textMonthMatch[2].toLowerCase()];
    let year = Number(textMonthMatch[3]);
    if (year < 100) year += 2000;
    if (month) return formatIsoDate(year, month, day);
  }

  // MMM DD, YYYY (e.g., Oct 14, 2026)
  const usTextMatch = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})/);
  if (usTextMatch) {
    const month = MONTHS[usTextMatch[1].toLowerCase()];
    const day = Number(usTextMatch[2]);
    let year = Number(usTextMatch[3]);
    if (year < 100) year += 2000;
    if (month) return formatIsoDate(year, month, day);
  }

  // DD/MM/YYYY or MM/DD/YYYY
  const numericMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s.*)?$/);
  if (numericMatch) {
    const a = Number(numericMatch[1]);
    const b = Number(numericMatch[2]);
    let year = Number(numericMatch[3]);
    if (year < 100) year += 2000;

    if (a > 12) return formatIsoDate(year, b, a);
    if (b > 12) return formatIsoDate(year, a, b);
    return slashOrder === 'MDY'
      ? formatIsoDate(year, a, b)
      : formatIsoDate(year, b, a);
  }

  // Fallback native Date parse
  const fallback = new Date(s);
  if (!Number.isNaN(fallback.getTime())) {
    return formatIsoDate(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
  }

  return null;
}

function findHeaderRowIndex(matrix: string[][]): number {
  let fallbackIdx = -1;

  for (let i = 0; i < matrix.length; i++) {
    const nonEmptyCells = matrix[i].map((c) => c.trim()).filter(Boolean);
    if (nonEmptyCells.length < 2) continue;

    const hasDate = matrix[i].some((c) => headerMatches(c, DATE_HEADER_KEYWORDS));
    const hasNarrationOrDesc = matrix[i].some((c) =>
      headerMatches(c, DESC_HEADER_KEYWORDS)
    );

    if (!hasDate || !hasNarrationOrDesc) continue;

    const hasAmountCol = matrix[i].some(
      (c) =>
        headerMatches(c, DEBIT_HEADER_KEYWORDS) ||
        headerMatches(c, CREDIT_HEADER_KEYWORDS) ||
        headerMatches(c, AMOUNT_HEADER_KEYWORDS)
    );

    // Prefer a row that explicitly has Date + Narration/Description + Debit/Credit/Amount
    if (hasAmountCol) {
      return i;
    }

    if (fallbackIdx === -1 && nonEmptyCells.length >= 3) {
      fallbackIdx = i;
    }
  }

  return fallbackIdx;
}

function parseMatrixToStatement(matrix: unknown[][], fileName: string): ParsedStatementResult {
  const stringMatrix = matrix.map((row) => (Array.isArray(row) ? row.map(normalizeCell) : []));
  const headerIdx = findHeaderRowIndex(stringMatrix);

  if (headerIdx === -1) {
    throw new Error(
      'Could not locate a valid statement header row containing Date and Description/Narration/Particulars.'
    );
  }

  const headers = stringMatrix[headerIdx];

  // Prefer Txn Date / Transaction Date / Date over Value Date
  let dateCol = headers.findIndex((h) => {
    const lower = h.toLowerCase();
    return (
      headerMatches(h, DATE_HEADER_KEYWORDS) &&
      !lower.includes('value') &&
      !lower.includes('post')
    );
  });
  if (dateCol === -1) {
    dateCol = headers.findIndex((h) => headerMatches(h, DATE_HEADER_KEYWORDS));
  }

  const descCol = headers.findIndex((h) => headerMatches(h, DESC_HEADER_KEYWORDS));
  const debitCol = headers.findIndex((h) => headerMatches(h, DEBIT_HEADER_KEYWORDS));
  const creditCol = headers.findIndex((h) => headerMatches(h, CREDIT_HEADER_KEYWORDS));
  const amountCol = headers.findIndex((h) => headerMatches(h, AMOUNT_HEADER_KEYWORDS));
  const typeCol = headers.findIndex((h) => headerMatches(h, TYPE_HEADER_KEYWORDS));

  if (dateCol === -1 || descCol === -1) {
    throw new Error('Statement must contain recognizable Date and Description columns.');
  }

  if (debitCol === -1 && creditCol === -1 && amountCol === -1) {
    throw new Error(
      'Statement must contain Debit/Credit columns or an Amount column.'
    );
  }

  const rawDateSamples = stringMatrix
    .slice(headerIdx + 1)
    .map((r) => r[dateCol] ?? '')
    .filter(Boolean);
  const slashOrder = inferSlashDateOrder(rawDateSamples);
  const currencySymbol = detectCurrencySymbol(stringMatrix, headerIdx);

  const parsedRows: RawTransactionRow[] = [];

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const rawRow = matrix[r];
    const strRow = stringMatrix[r];
    if (!strRow || strRow.every((c) => !c)) continue;

    const rawDesc = strRow[descCol] ?? '';
    const lowerDesc = rawDesc.toLowerCase();
    if (!rawDesc || SKIP_SUMMARY_PATTERNS.some((p) => lowerDesc.includes(p))) {
      continue;
    }

    const isoDate = normalizeDate(rawRow[dateCol], slashOrder);
    if (!isoDate) continue;

    let amount = 0;
    let direction: TransactionDirection | null = null;

    if (debitCol !== -1 || creditCol !== -1) {
      const debitParsed = debitCol !== -1 ? parseNumericAmount(strRow[debitCol] ?? '') : { value: null, isNegative: false };
      const creditParsed = creditCol !== -1 ? parseNumericAmount(strRow[creditCol] ?? '') : { value: null, isNegative: false };

      if (creditParsed.value !== null && creditParsed.value > 0) {
        amount = creditParsed.value;
        direction = 'inflow';
      } else if (debitParsed.value !== null && debitParsed.value > 0) {
        amount = debitParsed.value;
        direction = 'outflow';
      }
    }

    if (direction === null && amountCol !== -1) {
      const amtParsed = parseNumericAmount(strRow[amountCol] ?? '');
      if (amtParsed.value !== null && amtParsed.value > 0) {
        amount = amtParsed.value;
        const typeCell = typeCol !== -1 ? (strRow[typeCol] ?? '').toLowerCase() : '';
        if (typeCell) {
          if (/\b(cr|credit|in|inflow|dep|deposit)\b/.test(typeCell)) {
            direction = 'inflow';
          } else if (/\b(dr|debit|out|outflow|wd|withdrawal)\b/.test(typeCell)) {
            direction = 'outflow';
          }
        }
        if (direction === null) {
          if (amtParsed.tag === 'CR') direction = 'inflow';
          else if (amtParsed.tag === 'DR') direction = 'outflow';
          else direction = amtParsed.isNegative ? 'outflow' : 'inflow';
        }
      }
    }

    if (!direction || amount <= 0) continue;

    parsedRows.push({
      id: `txn-${r}-${parsedRows.length + 1}`,
      date: isoDate,
      rawDescription: rawDesc.replace(/\s+/g, ' ').trim(),
      amount: Math.round(amount * 100) / 100,
      direction,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'No valid transaction rows were found after the header row. Check date and amount formatting.'
    );
  }

  parsedRows.sort((a, b) => a.date.localeCompare(b.date));

  return {
    fileName,
    rows: parsedRows,
    skippedHeaderRows: headerIdx,
    currencySymbol,
    minDate: parsedRows[0].date,
    maxDate: parsedRows[parsedRows.length - 1].date,
  };
}

function detectDelimiterFromHeaderLine(csvText: string): string | undefined {
  const lines = csvText.split(/\r?\n/);
  const candidateLine = lines.find((line) => {
    const lower = line.toLowerCase();
    return (
      /\bdate\b/.test(lower) &&
      (/\bnarration\b/.test(lower) ||
        /\bdescription\b/.test(lower) ||
        /\bparticulars\b/.test(lower))
    );
  });

  if (!candidateLine) return undefined;

  const delimiters = [',', ';', '\t', '|'];
  let bestDelimiter = ',';
  let bestCount = 0;
  for (const d of delimiters) {
    const count = candidateLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = d;
    }
  }
  return bestCount > 0 ? bestDelimiter : undefined;
}

export function parseCsvText(csvText: string, fileName: string): ParsedStatementResult {
  const cleanedText = csvText.replace(/^\uFEFF/, '');
  const inferredDelimiter = detectDelimiterFromHeaderLine(cleanedText);

  const result = Papa.parse<string[]>(cleanedText, {
    header: false,
    skipEmptyLines: false,
    delimiter: inferredDelimiter ?? '',
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  return parseMatrixToStatement(result.data, fileName);
}

export async function parseStatementFile(file: File): Promise<ParsedStatementResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    return parseCsvText(text, file.name);
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('The Excel workbook contains no sheets.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    return parseMatrixToStatement(matrix, file.name);
  }

  throw new Error('Unsupported file format. Please upload a .csv, .xlsx, or .xls bank statement.');
}
