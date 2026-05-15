'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ExceptionRow, ExceptionStatus } from '@/app/lib/db';

interface ExecutionPlanish {
  extractedVendorName?: string;
  extractedAmount?: number;
  extractedDate?: string;
}

function formatAmount(amount?: number): string {
  if (amount == null) return '—';
  return `€${amount.toFixed(2)}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('de-DE');
  } catch {
    return dateStr;
  }
}

const STATUS_LABELS: Record<ExceptionStatus, string> = {
  pending: 'Klärung nötig',
  awaiting_approval: 'Genehmigung',
  resolved: 'Erledigt',
  dismissed: 'Abgewiesen',
};

const STATUS_VARIANTS: Record<ExceptionStatus, 'destructive' | 'secondary' | 'outline'> = {
  pending: 'destructive',
  awaiting_approval: 'secondary',
  resolved: 'outline',
  dismissed: 'outline',
};

interface Props {
  data: ExceptionRow[];
}

export function ExceptionDataTable({ data }: Props) {
  const router = useRouter();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return data;
    return data.filter((row) => row.status === statusFilter);
  }, [data, statusFilter]);

  const columns = useMemo<ColumnDef<ExceptionRow>[]>(() => [
    {
      id: 'vendor',
      header: 'Vendor',
      accessorFn: (row) => {
        const plan = row.payload.executionPlan as ExecutionPlanish | null;
        return plan?.extractedVendorName ?? 'Unbekannt';
      },
      filterFn: 'includesString',
    },
    {
      id: 'amount',
      header: 'Betrag',
      accessorFn: (row) => {
        const plan = row.payload.executionPlan as ExecutionPlanish | null;
        return formatAmount(plan?.extractedAmount);
      },
    },
    {
      id: 'date',
      header: 'Datum',
      accessorFn: (row) => {
        const plan = row.payload.executionPlan as ExecutionPlanish | null;
        return formatDate(plan?.extractedDate);
      },
    },
    {
      id: 'source',
      header: 'Quelle',
      cell: ({ row }) => {
        const src = row.original.payload.source;
        return (
          <Badge variant={src === 'email' ? 'secondary' : 'outline'}>
            {src === 'email' ? 'E-Mail' : 'Upload'}
          </Badge>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const st = row.original.status;
        return (
          <Badge variant={STATUS_VARIANTS[st]}>
            {STATUS_LABELS[st]}
          </Badge>
        );
      },
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(`/exceptions/${row.original.id}`)}
        >
          Öffnen
        </Button>
      ),
    },
  ], [router]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  });

  const vendorFilter = (columnFilters.find((f) => f.id === 'vendor')?.value as string) ?? '';

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Vendor filtern…"
          value={vendorFilter}
          onChange={(e) =>
            setColumnFilters((prev) => [
              ...prev.filter((f) => f.id !== 'vendor'),
              ...(e.target.value ? [{ id: 'vendor', value: e.target.value }] : []),
            ])
          }
          className="w-56"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="pending">Klärung nötig</SelectItem>
            <SelectItem value="awaiting_approval">Genehmigung</SelectItem>
            <SelectItem value="resolved">Erledigt</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/40">
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium text-muted-foreground">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  Keine Einträge
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b transition-colors hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Seite {table.getState().pagination.pageIndex + 1} von{' '}
          {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ← Zurück
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Weiter →
          </Button>
        </div>
      </div>
    </div>
  );
}
