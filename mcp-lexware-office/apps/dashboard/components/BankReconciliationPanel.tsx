'use client';

import { useState, useEffect, useCallback } from 'react';
import StatusBadge from './StatusBadge';

interface PaymentStatus {
  paymentStatus: string;
  openAmount: string;
  voucherStatus: string;
  deeplink: string;
}

const POLL_INTERVAL = 30_000;

export default function BankReconciliationPanel({ voucherId }: { voucherId: string }) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/payments/${voucherId}`, {
        headers: { Authorization: `Bearer ${(window as any).__DASHBOARD_SECRET__ ?? ''}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setStatus(await res.json());
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [voucherId]);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchStatus]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {error && <p className="text-sm text-red-600">Could not fetch payment status: {error}</p>}

      {status && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge status={status.paymentStatus} />
            <span className="text-sm text-gray-600">
              Open: <span className="font-medium">€{status.openAmount}</span>
            </span>
          </div>
          <a
            href={status.deeplink}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open in Lexware Banking →
          </a>
        </div>
      )}

      {!status && !error && (
        <p className="text-sm text-gray-500">Loading payment status…</p>
      )}

      <p className="mt-3 text-xs text-gray-400">
        When the bank deposit arrives, assign this voucher to the transaction in Lexware banking.
        Status refreshes every 30 seconds.
      </p>
    </div>
  );
}
