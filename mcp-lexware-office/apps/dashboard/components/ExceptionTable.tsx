'use client';

import StatusBadge from './StatusBadge';
import type { ExceptionRow } from '@/app/lib/db';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function TriggerPill({ id, severity }: { id: string; severity: string }) {
  const isBlocking = severity === 'blocking';
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        isBlocking ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {id.replace(/_/g, ' ')}
    </span>
  );
}

export default function ExceptionTable({ rows }: { rows: ExceptionRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white py-16 text-center">
        <p className="text-lg font-medium text-gray-500">
          No exceptions — all documents processed automatically ✓
        </p>
        <p className="mt-1 text-sm text-gray-400">
          Healthy documents never appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Source', 'Triggers', 'Amount', 'Age', 'Status', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const questions = row.payload.clarificationQuestions ?? [];
            const amount = row.payload.executionPlan as any;

            return (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 capitalize">
                    {row.payload.source ?? 'unknown'}
                  </div>
                  <div className="text-xs text-gray-400 font-mono truncate max-w-[120px]">
                    {row.id.slice(0, 8)}…
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {questions.map((q) => (
                      <TriggerPill key={q.triggerId} id={q.triggerId} severity={q.severity} />
                    ))}
                    {questions.length === 0 && row.payload.triggerReasons.map((r) => (
                      <TriggerPill key={r} id={r} severity="warning" />
                    ))}
                  </div>
                </td>

                <td className="px-4 py-3 text-gray-700">
                  {amount?.extractedAmount != null
                    ? `€${Number(amount.extractedAmount).toFixed(2)}`
                    : '—'}
                </td>

                <td className="px-4 py-3 text-gray-500">
                  {relativeTime(row.created_at)}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>

                <td className="px-4 py-3 text-right">
                  <a
                    href={`/exceptions/${row.id}`}
                    className="text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Review →
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
