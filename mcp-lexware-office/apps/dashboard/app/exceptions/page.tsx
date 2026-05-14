import { getExceptions } from '@/app/lib/db';
import ExceptionTable from '@/components/ExceptionTable';
import StatusBadge from '@/components/StatusBadge';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'awaiting_approval', label: 'Awaiting Approval' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
] as const;

export default async function ExceptionListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? 'pending') as 'pending' | 'resolved' | 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const pageSize = 20;

  const tenantId = process.env.LEXWARE_TENANT_ID ?? 'default';
  const { rows, total } = await getExceptions(tenantId, status, page, pageSize).catch(() => ({
    rows: [],
    total: 0,
  }));

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Exception Tray</h1>
          {total > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800">
              {total}
            </span>
          )}
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((tab) => {
          const isActive = status === tab.key || (tab.key === 'pending' && !sp.status);
          return (
            <a
              key={tab.key}
              href={`/exceptions?status=${tab.key}`}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      <ExceptionTable rows={rows} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm text-gray-500">
          <span>
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/exceptions?status=${status}&page=${page - 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                ← Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/exceptions?status=${status}&page=${page + 1}`}
                className="rounded border px-3 py-1 hover:bg-gray-50"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
