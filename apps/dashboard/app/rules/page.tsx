'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RuleRow {
  id: string;
  vendor_name: string;
  category_id: string | null;
  category_name: string | null;
  tax_type: string | null;
  always_unchecked: boolean;
  usage_count: number;
  last_used_at: string | null;
}

const TAX_TYPES = [
  { value: 'gross', label: 'Brutto (19%)' },
  { value: 'gross7', label: 'Brutto (7%)' },
  { value: 'vatfree', label: 'Steuerfrei' },
  { value: 'constructionService13b', label: '§13b Bauleistung' },
  { value: 'externalService13b', label: '§13b Fremdleistung' },
  { value: 'intraCommunitySupply', label: 'EU-Lieferung' },
];

const AUTH_HEADER = { Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}` };

export default function RulesPage() {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const [editTarget, setEditTarget] = useState<RuleRow | null>(null);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTaxType, setEditTaxType] = useState('');
  const [editAlwaysUnchecked, setEditAlwaysUnchecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RuleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/rules', { headers: AUTH_HEADER });
      if (res.ok) setRules(await res.json() as RuleRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openEdit(rule: RuleRow) {
    setEditTarget(rule);
    setEditCategoryId(rule.category_id ?? '');
    setEditTaxType(rule.tax_type ?? '');
    setEditAlwaysUnchecked(rule.always_unchecked);
  }

  async function handleSave() {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rules/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
        body: JSON.stringify({
          categoryId: editCategoryId || null,
          taxType: editTaxType || null,
          alwaysUnchecked: editAlwaysUnchecked,
        }),
      });
      if (res.ok) {
        toast.success('Regel gespeichert');
        setEditTarget(null);
        void load();
      } else {
        const d = await res.json() as { error?: string };
        toast.error(d.error ?? 'Fehler');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/rules/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: AUTH_HEADER,
      });
      if (res.ok) {
        toast.success('Regel gelöscht');
        setDeleteTarget(null);
        void load();
      } else {
        const d = await res.json() as { error?: string };
        toast.error(d.error ?? 'Fehler');
      }
    } finally {
      setDeleting(false);
    }
  }

  const columns: ColumnDef<RuleRow>[] = [
    {
      accessorKey: 'vendor_name',
      header: 'Lieferant',
      cell: ({ row }) => <span className="font-medium">{row.original.vendor_name}</span>,
    },
    {
      accessorKey: 'category_name',
      header: 'Kategorie',
      cell: ({ row }) =>
        row.original.category_name ? (
          <span className="text-sm">{row.original.category_name}</span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        ),
    },
    {
      accessorKey: 'tax_type',
      header: 'Steuertyp',
      cell: ({ row }) => {
        const t = row.original.tax_type;
        if (!t) return <span className="text-muted-foreground text-sm">—</span>;
        const found = TAX_TYPES.find((x) => x.value === t);
        return <Badge variant="outline">{found?.label ?? t}</Badge>;
      },
    },
    {
      accessorKey: 'always_unchecked',
      header: 'Immer prüfen',
      cell: ({ row }) =>
        row.original.always_unchecked ? (
          <Badge variant="secondary">Ja</Badge>
        ) : (
          <span className="text-muted-foreground text-sm">Nein</span>
        ),
    },
    {
      accessorKey: 'usage_count',
      header: 'Verwendet',
      cell: ({ row }) => <span className="text-sm">{row.original.usage_count}×</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: rules,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Lieferantenregeln</h1>
          {!loading && <Badge variant="secondary">{rules.length}</Badge>}
        </div>
        <Input
          placeholder="Lieferant suchen…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="w-60"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
                    Keine Regeln gefunden. Regeln werden beim Verarbeiten von Belegen automatisch gelernt.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(o) => { if (!o) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regel bearbeiten — {editTarget?.vendor_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Buchungskategorie-ID</Label>
              <Input
                value={editCategoryId}
                onChange={(e) => setEditCategoryId(e.target.value)}
                placeholder="UUID der Kategorie"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Steuertyp</Label>
              <Select value={editTaxType} onValueChange={setEditTaxType}>
                <SelectTrigger>
                  <SelectValue placeholder="Steuertyp wählen" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Immer manuell prüfen</Label>
              <Switch checked={editAlwaysUnchecked} onCheckedChange={setEditAlwaysUnchecked} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete alert dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regel löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Regel für <strong>{deleteTarget?.vendor_name}</strong> und alle zugehörigen Lernbeispiele unwiderruflich löschen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
