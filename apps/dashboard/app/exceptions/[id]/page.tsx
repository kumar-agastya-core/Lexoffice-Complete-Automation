import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { getException } from '@/app/lib/db';
import StatusBadge from '@/components/StatusBadge';
import ClarificationCard from '@/components/ClarificationCard';
import ExecutionPlanPreview from '@/components/ExecutionPlanPreview';
import ApproveButton from '@/components/ApproveButton';
import BankReconciliationPanel from '@/components/BankReconciliationPanel';

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const exception = await getException(id).catch(() => null);
  if (!exception) notFound();

  const payload = exception.payload;
  const voucherId = payload.lexwareDraftVoucherId;
  const resolvedVoucherId = (payload as any).resolvedVoucherId as string | undefined;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <a href="/exceptions" className="text-sm text-blue-600 hover:underline">
        ← Back to Exception Tray
      </a>

      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {payload.triggerReasons.join(', ') || 'Unknown document'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Source: {payload.source} · Received: {relativeTime(payload.receivedAt)} ·
              Created: {relativeTime(exception.created_at)}
            </p>
          </div>
          <StatusBadge status={exception.status} />
        </div>

        {voucherId && payload.lexwareDeeplink && (
          <a
            href={payload.lexwareDeeplink}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            View Draft in Lexware →
          </a>
        )}
      </div>

      {/* Clarification questions */}
      {exception.sessions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Clarification Needed</h2>
          <div className="space-y-3">
            {exception.sessions.map((session) => (
              <ClarificationCard
                key={session.id}
                exceptionId={id}
                session={session}
                referenceDocs={
                  (session.context_json?.referenceDocs ?? []) as string[]
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Execution plan */}
      {payload.executionPlan != null && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Execution Plan</h2>
          <ExecutionPlanPreview plan={payload.executionPlan} />
        </section>
      )}

      {/* Approve button */}
      {exception.status === 'awaiting_approval' && (
        <ApproveButton exceptionId={id} plan={payload.executionPlan} />
      )}

      {/* Bank reconciliation */}
      {(resolvedVoucherId || voucherId) && exception.status === 'resolved' && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Bank Reconciliation</h2>
          <BankReconciliationPanel voucherId={resolvedVoucherId ?? voucherId!} />
        </section>
      )}
    </div>
  );
}
