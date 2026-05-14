type StatusValue =
  | 'pending'
  | 'awaiting_approval'
  | 'resolved'
  | 'dismissed'
  | 'balanced'
  | 'openRevenue'
  | 'openExpense';

const BADGE_MAP: Record<StatusValue, { label: string; className: string }> = {
  pending: { label: 'Needs Review', className: 'bg-amber-100 text-amber-800' },
  awaiting_approval: { label: 'Awaiting Approval', className: 'bg-blue-100 text-blue-800' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800' },
  dismissed: { label: 'Dismissed', className: 'bg-gray-100 text-gray-600' },
  balanced: { label: 'Reconciled ✓', className: 'bg-green-100 text-green-800' },
  openRevenue: { label: 'Awaiting Payment', className: 'bg-amber-100 text-amber-800' },
  openExpense: { label: 'Payment Due', className: 'bg-amber-100 text-amber-800' },
};

export default function StatusBadge({ status }: { status: string }) {
  const badge = BADGE_MAP[status as StatusValue] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
}
