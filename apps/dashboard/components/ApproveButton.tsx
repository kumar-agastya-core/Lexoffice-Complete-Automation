'use client';

import { useState } from 'react';
import ExecutionPlanPreview from './ExecutionPlanPreview';

interface Props {
  exceptionId: string;
  plan: unknown;
}

export default function ApproveButton({ exceptionId, plan }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ voucherId: string; deeplink: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/exceptions/${exceptionId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `${res.status}`);
      setResult(data);
      // Refresh page after 2s to show resolved state
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <p className="text-sm font-medium text-green-800">
          ✓ Voucher posted successfully
        </p>
        <a
          href={result.deeplink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-green-700 hover:underline"
        >
          View in Lexware →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ExecutionPlanPreview plan={plan} />
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        onClick={handleApprove}
        disabled={loading}
        className="w-full rounded-lg bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto"
      >
        {loading ? 'Posting to Lexware…' : 'Approve and Post to Lexware'}
      </button>
    </div>
  );
}
