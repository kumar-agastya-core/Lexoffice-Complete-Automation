import { getExceptions } from '@/app/lib/db';
import type { ExceptionRow } from '@/app/lib/db';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExceptionDataTable } from '@/components/exceptions/ExceptionDataTable';

export default async function ExceptionListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status = 'open', page: pageStr = '1' } = await searchParams;
  const page = Math.max(1, Number(pageStr) || 1);
  const pageSize = 20;

  const { rows, total } = await getExceptions('default', status, page, pageSize).catch(() => ({
    rows: [],
    total: 0,
  }));

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ausnahmen</h1>
        <Badge variant="secondary">{total} gesamt</Badge>
      </div>

      <Tabs value={status}>
        <TabsList>
          <TabsTrigger value="open" asChild>
            <a href="/exceptions?status=open">Offen</a>
          </TabsTrigger>
          <TabsTrigger value="resolved" asChild>
            <a href="/exceptions?status=resolved">Erledigt</a>
          </TabsTrigger>
          <TabsTrigger value="all" asChild>
            <a href="/exceptions?status=all">Alle</a>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div>
        <ExceptionDataTable data={rows as unknown as ExceptionRow[]} />
      </div>
    </div>
  );
}
