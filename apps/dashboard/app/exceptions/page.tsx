import { getExceptions } from '@/app/lib/db';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExceptionDataTable } from '@/components/exceptions/ExceptionDataTable';

export default async function ExceptionListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? 'all') as 'pending' | 'resolved' | 'all';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const pageSize = 100;

  const tenantId = process.env.LEXWARE_TENANT_ID ?? 'default';
  const { rows, total } = await getExceptions(tenantId, 'all', page, pageSize).catch(() => ({
    rows: [],
    total: 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Ausnahmen</h1>
        {total > 0 && (
          <Badge variant="secondary">{total}</Badge>
        )}
      </div>

      <Tabs defaultValue={status}>
        <TabsList>
          <TabsTrigger value="all" asChild>
            <a href="/exceptions?status=all">Alle</a>
          </TabsTrigger>
          <TabsTrigger value="pending" asChild>
            <a href="/exceptions?status=pending">Klärung nötig</a>
          </TabsTrigger>
          <TabsTrigger value="awaiting_approval" asChild>
            <a href="/exceptions?status=awaiting_approval">Genehmigung</a>
          </TabsTrigger>
          <TabsTrigger value="resolved" asChild>
            <a href="/exceptions?status=resolved">Erledigt</a>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <ExceptionDataTable data={rows} />
    </div>
  );
}
