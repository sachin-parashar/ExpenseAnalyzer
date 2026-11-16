import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const INFLOW_CATEGORIES = [
  'Salary & Income',
  'Refunds & Cashback',
  'Transfers & Reimbursements',
  'Interest & Dividends',
  'Other Income',
];

const OUTFLOW_CATEGORIES = [
  'Subscriptions & Recurring',
  'Food & Dining',
  'Shopping & Retail',
  'Bills & Utilities',
  'Transport & Fuel',
  'Travel & Stays',
  'Health & Wellness',
  'Bank Fees & Charges',
  'Transfers & Family',
  'Other Expenses',
];

const ALL_CATEGORIES = [...INFLOW_CATEGORIES, ...OUTFLOW_CATEGORIES];

interface BatchRowInput {
  id: string;
  date: string;
  rawDescription: string;
  amount: number;
  direction: 'inflow' | 'outflow';
}

interface AnalyzedBatchItem {
  id: string;
  cleanMerchant: string;
  direction: 'inflow' | 'outflow';
  category: string;
  isSubscription: boolean;
  billingCycle: 'monthly' | 'annual' | 'weekly' | 'quarterly' | 'none';
  estimatedAnnualCost: number;
  isLeakage: boolean;
  leakageType:
    | 'bank_fee'
    | 'duplicate_subscription'
    | 'micro_spend'
    | 'price_hike'
    | 'discretionary_leak'
    | 'none';
  leakageReason: string;
}

const analysisResponseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: {
        type: Type.STRING,
        description: 'Exact transaction id from the input row.',
      },
      cleanMerchant: {
        type: Type.STRING,
        description:
          'Human-readable merchant or counterparty name (e.g., "Spotify", "Amazon Marketplace", "Netflix", "Acme Corp Payroll").',
      },
      direction: {
        type: Type.STRING,
        enum: ['inflow', 'outflow'],
        description: 'Money received (inflow) or money spent (outflow).',
      },
      category: {
        type: Type.STRING,
        enum: ALL_CATEGORIES,
        description: 'Strict classification category matching the transaction direction.',
      },
      isSubscription: {
        type: Type.BOOLEAN,
        description:
          'True if this is a recurring subscription, membership, SaaS plan, cloud storage, OTT streaming, or telecom/gym recurring plan.',
      },
      billingCycle: {
        type: Type.STRING,
        enum: ['monthly', 'annual', 'weekly', 'quarterly', 'none'],
        description: 'Detected billing cadence if isSubscription is true, otherwise none.',
      },
      estimatedAnnualCost: {
        type: Type.NUMBER,
        description:
          'Estimated annualized cost (amount * 12 for monthly, amount * 1 for annual, amount * 52 for weekly, amount * 4 for quarterly, 0 if not a subscription).',
      },
      isLeakage: {
        type: Type.BOOLEAN,
        description:
          'True for money leakages: bank maintenance/late/FX fees, duplicate/overlapping subscriptions (e.g. multiple music/OTT/AI tools), micro-spend delivery/coffee drains, or price hikes.',
      },
      leakageType: {
        type: Type.STRING,
        enum: [
          'bank_fee',
          'duplicate_subscription',
          'micro_spend',
          'price_hike',
          'discretionary_leak',
          'none',
        ],
        description: 'Type of leakage if isLeakage is true, otherwise none.',
      },
      leakageReason: {
        type: Type.STRING,
        description:
          'Short, specific explanation of why this transaction is flagged as a leakage (empty string if isLeakage is false).',
      },
    },
    required: [
      'id',
      'cleanMerchant',
      'direction',
      'category',
      'isSubscription',
      'billingCycle',
      'estimatedAnnualCost',
      'isLeakage',
      'leakageType',
      'leakageReason',
    ],
  },
};

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MODEL_FALLBACK_CHAIN = [
  'models/gemini-3.8-flash',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
];

function isTransientOrCapacityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|500|502|504|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timeout)\b/i.test(
    msg
  );
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : 'Failed to analyze statement batch with Gemini.';
  try {
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error?.message) {
        const code = parsed.error.code ?? 500;
        if (code === 503 || parsed.error.status === 'UNAVAILABLE') {
          return {
            status: 503,
            message:
              'Gemini models are temporarily experiencing high demand. Please retry in a few moments.',
          };
        }
        return { status: code >= 400 && code < 600 ? code : 500, message: parsed.error.message };
      }
    }
  } catch {
    // Fallback to raw error message
  }
  return { status: isTransientOrCapacityError(err) ? 503 : 500, message: raw };
}

async function analyzeBatchWithRetry(
  ai: GoogleGenAI,
  rows: BatchRowInput[],
  currencySymbol: string,
  retriesPerModel = 1
): Promise<{ results: AnalyzedBatchItem[]; modelUsed: string }> {
  const systemInstruction = `You are a financial forensics engine inside Statement Lens.
Analyze the provided bank/credit card transaction rows (in currency "${currencySymbol}") and return structured JSON matching the exact schema.
Rules:
1. Preserve every row's exact "id" and respect its "direction" ("inflow" vs "outflow") unless the description unambiguously indicates a refund/reversal.
2. Clean Merchant Names: Translate cryptic bank narrations (e.g., "UPI/DR/482910/SPOTIFY" -> "Spotify", "AMZN MKTP US*2K9" -> "Amazon Marketplace", "RAZORPAY*NETFLIX" -> "Netflix", "NEFT/CR/ACME_PAYROLL" -> "Acme Payroll") into crisp, title-cased human names.
3. Classify Category strictly:
   - For inflows ("inflow"): ONLY use one of: ${INFLOW_CATEGORIES.join(', ')}.
   - For outflows ("outflow"): ONLY use one of: ${OUTFLOW_CATEGORIES.join(', ')}.
4. Detect Subscriptions: Flag recurring SaaS, OTT streaming (Netflix, Spotify, YouTube Premium, Prime, Disney+), cloud storage (iCloud, Google One, Dropbox), memberships, AI subscriptions, etc. Set billingCycle ("monthly", "annual", "weekly", "quarterly", or "none") and estimatedAnnualCost (monthlyAmount * 12, annual * 1, weekly * 52, quarterly * 4, else 0).
5. Detect Money Leakages:
   - bank_fee: Bank maintenance fees, SMS alert fees, minimum balance penalties, late payment charges, overdrafts, ATM surcharges, or international FX markup fees.
   - duplicate_subscription: Overlapping services in the batch (e.g., paying for both Spotify and Apple Music/YouTube Music, or multiple cloud/video/AI subscriptions).
   - price_hike: Recurring merchant charged at a noticeably higher rate than an earlier charge in the batch.
   - micro_spend: Frequent small convenience/impulse charges (e.g. quick-commerce delivery fees, coffee runs, small in-app purchases) that add up silently.
   - discretionary_leak: Avoidable recurring convenience fees or surge charges.
   - Otherwise set isLeakage: false, leakageType: "none", leakageReason: "".
Return one JSON object per input row.`;

  const compactInput = rows.map((r) => ({
    id: r.id,
    date: r.date,
    desc: r.rawDescription,
    amt: r.amount,
    dir: r.direction,
  }));

  let lastError: unknown;

  for (const modelName of MODEL_FALLBACK_CHAIN) {
    for (let attempt = 0; attempt <= retriesPerModel; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: JSON.stringify(compactInput),
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: analysisResponseSchema,
          },
        });

        const rawText = (response.text ?? '[]').trim();
        const parsed = JSON.parse(rawText) as AnalyzedBatchItem[];
        if (!Array.isArray(parsed)) {
          throw new Error('Model response was not a JSON array.');
        }
        return { results: parsed, modelUsed: modelName };
      } catch (err) {
        lastError = err;
        const transient = isTransientOrCapacityError(err);
        if (transient && attempt < retriesPerModel) {
          const jitter = Math.floor(Math.random() * 350);
          const delayMs = 900 * Math.pow(2, attempt) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        if (transient) {
          console.warn(
            `Model ${modelName} unavailable/overloaded, falling back to next model...`
          );
          break;
        }
        throw err;
      }
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Stateless in-memory AI analysis proxy (no DB, no disk persistence)
  app.post('/api/analyze-batch', async (req, res) => {
    try {
      const { transactions, currencySymbol = '$' } = req.body as {
        transactions?: BatchRowInput[];
        currencySymbol?: string;
      };

      if (!Array.isArray(transactions) || transactions.length === 0) {
        res.status(400).json({ error: 'Request must include a non-empty transactions array.' });
        return;
      }

      if (transactions.length > 150) {
        res.status(400).json({ error: 'Batch size cannot exceed 150 transactions per request.' });
        return;
      }

      const ai = getAiClient();
      const { results, modelUsed } = await analyzeBatchWithRetry(ai, transactions, currencySymbol);
      res.json({ results, modelUsed });
    } catch (err: unknown) {
      const formatted = formatGeminiError(err);
      console.error('Gemini analysis error:', formatted.message);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Statement Lens server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
