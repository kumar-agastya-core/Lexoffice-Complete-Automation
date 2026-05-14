'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const BUSINESS_TYPES = [
  { id: 'gastronomy', label: 'Restaurant / Café / Bar', desc: 'Food & beverage, Lieferando, delivery platforms' },
  { id: 'retail', label: 'Retail / Shop / E-Commerce', desc: 'Product sales, Amazon, eBay, inventory' },
  { id: 'it_consulting', label: 'IT / Software / Consulting', desc: 'Professional services, software subscriptions' },
  { id: 'construction', label: 'Construction / Trades / Handwerk', desc: 'Materials, §13b reverse charge, subcontractors' },
  { id: 'other', label: 'Other Business', desc: 'General business — all standard categories' },
] as const;

interface ValidationResult { valid: boolean; companyName?: string; vatId?: string; error?: string }
interface CreateResult { tenantId?: string; slug?: string; inboundEmail?: string; error?: string }
interface SyncProgress {
  status: 'pending' | 'running' | 'complete' | 'failed';
  contacts_synced: number;
  categories_cached: number;
  vouchers_learned: number;
  error_message?: string;
}

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [inboundEmail, setInboundEmail] = useState('');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [webhooksDone, setWebhooksDone] = useState(false);
  const [error, setError] = useState('');

  // ── Step 1: Validate API key ──────────────────────────────────────────────

  async function handleValidate(e: React.FormEvent) {
    e.preventDefault();
    setValidating(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json() as ValidationResult;
      setValidation(data);
      if (!data.valid) setError(data.error ?? 'Validation failed');
    } catch {
      setError('Network error — check your connection');
    } finally {
      setValidating(false);
    }
  }

  // ── Step 2: Select business type + create tenant ──────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/onboarding/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, businessTypeId }),
      });
      const data = await res.json() as CreateResult;
      if (!res.ok || !data.tenantId) { setError(data.error ?? 'Creation failed'); return; }
      setTenantId(data.tenantId);
      setInboundEmail(data.inboundEmail ?? '');
      setStep(3);
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }

  // ── Step 3: Sync progress polling ────────────────────────────────────────

  const pollProgress = useCallback(async () => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/onboarding/sync-progress?tenantId=${tenantId}`);
      if (res.ok) setProgress(await res.json() as SyncProgress);
    } catch { /* ignore */ }
  }, [tenantId]);

  const setupWebhooks = useCallback(async () => {
    if (!tenantId || webhooksDone) return;
    try {
      await fetch('/api/onboarding/setup-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      setWebhooksDone(true);
    } catch { /* non-fatal */ }
  }, [tenantId, webhooksDone]);

  useEffect(() => {
    if (step !== 3 || !tenantId) return;

    // Start sync
    void fetch('/api/onboarding/start-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId }),
    });

    const id = setInterval(async () => {
      await pollProgress();
    }, 2000);
    void pollProgress();
    return () => clearInterval(id);
  }, [step, tenantId, pollProgress]);

  useEffect(() => {
    if (progress?.status === 'complete' && !webhooksDone) {
      void setupWebhooks();
    }
  }, [progress, webhooksDone, setupWebhooks]);

  useEffect(() => {
    if (progress?.status === 'complete' && webhooksDone) {
      setTimeout(() => setStep(4), 800);
    }
  }, [progress, webhooksDone]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Set up your account</h1>
        <p className="mt-2 text-gray-500">Connect Lexware → 4 minutes to fully automated bookkeeping</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex justify-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-2 w-8 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold">Connect your Lexware account</h2>
          <p className="mb-5 text-sm text-gray-500">
            You can find your API key at{' '}
            <a href="https://app.lexware.de/addons/public-api" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              app.lexware.de/addons/public-api
            </a>
          </p>

          {validation?.valid ? (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800">
              <span>✓</span>
              <span>Connected: <strong>{validation.companyName}</strong>{validation.vatId ? ` (${validation.vatId})` : ''}</span>
            </div>
          ) : (
            <form onSubmit={handleValidate} className="space-y-4">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={validating || !apiKey.trim()}
                className="w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {validating ? 'Validating…' : 'Validate Key'}
              </button>
            </form>
          )}

          {validation?.valid && (
            <button
              onClick={() => setStep(2)}
              className="mt-3 w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Continue →
            </button>
          )}
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-xl font-semibold">What type of business do you run?</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            {BUSINESS_TYPES.map((bt) => (
              <label
                key={bt.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  businessTypeId === bt.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="businessType"
                  value={bt.id}
                  checked={businessTypeId === bt.id}
                  onChange={() => setBusinessTypeId(bt.id)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{bt.label}</p>
                  <p className="text-xs text-gray-500">{bt.desc}</p>
                </div>
              </label>
            ))}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={creating || !businessTypeId}
              className="mt-2 w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? 'Setting up…' : 'Continue →'}
            </button>
          </form>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-xl font-semibold">Syncing your Lexware account</h2>
          <p className="mb-6 text-sm text-gray-500">This takes about 30 seconds…</p>

          <div className="space-y-3">
            {[
              { label: 'Importing contacts', done: (progress?.contacts_synced ?? 0) > 0, count: progress?.contacts_synced, unit: 'contacts' },
              { label: 'Loading posting categories', done: (progress?.categories_cached ?? 0) > 0, count: progress?.categories_cached, unit: 'categories' },
              { label: 'Learning from invoice history', done: progress?.status === 'complete', count: progress?.vouchers_learned, unit: 'invoices' },
              { label: 'Setting up webhooks', done: webhooksDone, count: null, unit: '' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 text-sm">
                <span className={`text-lg ${item.done ? 'text-green-500' : 'text-gray-300 animate-pulse'}`}>
                  {item.done ? '✓' : '○'}
                </span>
                <span className={item.done ? 'text-gray-900' : 'text-gray-400'}>
                  {item.done && item.count != null
                    ? `${item.count} ${item.unit} ${item.unit === '' ? 'active' : 'imported'}`
                    : item.done ? 'Webhooks active' : item.label + '…'}
                </span>
              </div>
            ))}
          </div>

          {progress?.status === 'failed' && (
            <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              Sync error: {progress.error_message}
            </p>
          )}
        </div>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <div className="mb-4 text-5xl">🎉</div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">You're all set</h2>

          <div className="my-6 rounded-lg bg-blue-50 p-4">
            <p className="mb-2 text-sm font-medium text-blue-800">📧 Your invoice email address:</p>
            <div className="flex items-center justify-center gap-2">
              <code className="rounded bg-white px-3 py-1.5 text-sm font-mono text-blue-900 border border-blue-200">
                {inboundEmail}
              </code>
              <button
                onClick={() => void navigator.clipboard.writeText(inboundEmail)}
                className="rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
              >
                Copy
              </button>
            </div>
          </div>

          <ul className="mb-6 space-y-2 text-left text-sm text-gray-600">
            <li className="flex items-start gap-2"><span>•</span><span>Forward any invoice PDF to this address</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>Unclear documents appear in your Exception Tray</span></li>
            <li className="flex items-start gap-2"><span>•</span><span>Everything else is posted automatically</span></li>
          </ul>

          <button
            onClick={() => router.push('/exceptions')}
            className="w-full rounded-md bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            Open Exception Tray →
          </button>

          <p className="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-500">
            Your Lexware account is connected. Webhooks are active — payment updates will appear in real-time.
          </p>
        </div>
      )}
    </div>
  );
}
