'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, AlertCircle, TrendingUp, Clock, BookOpen, Loader2 } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

interface ClientData {
  id: string;
  companyName: string;
  businessType: string | null;
  inboundEmail: string | null;
  setupComplete: boolean;
  createdAt: string;
  openExceptions: number;
  totalDocs: number;
  lastDocAt: string | null;
  fingerprintCount: number;
  automationRate: number;
}

const AUTH = `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_SECRET ?? ''}`;

function formatDate(iso: string | null): string {
  if (!iso) return 'Noch keiner';
  try {
    return new Date(iso).toLocaleDateString('de-DE');
  } catch {
    return '—';
  }
}

export default function MandantenPage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClientData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mandanten', { headers: { Authorization: AUTH } });
      if (res.status === 403) { setForbidden(true); return; }
      if (res.ok) {
        const data = await res.json() as { clients: ClientData[] };
        setClients(data.clients);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!slug.trim()) return;
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/mandanten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ slug: slug.trim() }),
      });
      if (res.ok) {
        toast.success('Mandant hinzugefügt');
        setAddOpen(false);
        setSlug('');
        void load();
      } else {
        const d = await res.json() as { error?: string };
        setAddError(d.error ?? 'Fehler');
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(`/api/mandanten/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: AUTH },
      });
      toast.success('Mandant entfernt');
      setDeleteTarget(null);
      void load();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSwitch(clientId: string) {
    setSwitching(clientId);
    try {
      const res = await fetch(`/api/mandanten/${clientId}/switch`, {
        method: 'POST',
        headers: { Authorization: AUTH },
      });
      if (res.ok) {
        router.push('/exceptions');
      } else {
        toast.error('Wechsel fehlgeschlagen');
      }
    } finally {
      setSwitching(null);
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Mandanten</h1>
        <Alert variant="destructive">
          <AlertDescription>Diese Seite ist nur für Buchhalter-Konten verfügbar</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mandanten</h1>
          <p className="text-sm text-muted-foreground">Verwalten Sie Ihre Kunden-Konten</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Mandant hinzufügen
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-lg" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-sm">Noch keine Mandanten. Fügen Sie Ihren ersten Kunden hinzu.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Card key={client.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{client.companyName}</CardTitle>
                  <Badge variant={client.setupComplete ? 'outline' : 'secondary'} className="shrink-0">
                    {client.setupComplete ? 'Aktiv' : 'Einrichtung'}
                  </Badge>
                </div>
                {client.businessType && (
                  <p className="text-xs text-muted-foreground">{client.businessType}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className={`flex items-center gap-2 ${client.openExceptions > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {client.openExceptions} offene{' '}
                    {client.openExceptions === 1 ? 'Ausnahme' : 'Ausnahmen'}
                  </span>
                  {client.openExceptions > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs">{client.openExceptions}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                  <span>{client.automationRate.toFixed(0)}% automatisiert</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Letzter Beleg: {formatDate(client.lastDocAt)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BookOpen className="h-3.5 w-3.5 shrink-0" />
                  <span>{client.fingerprintCount} Regeln gelernt</span>
                </div>
              </CardContent>
              <CardFooter className="flex gap-2">
                <Button
                  className="flex-1"
                  size="sm"
                  onClick={() => void handleSwitch(client.id)}
                  disabled={switching === client.id}
                >
                  {switching === client.id ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Öffnen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(client)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Add client dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setAddError(''); setSlug(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mandant hinzufügen</DialogTitle>
            <DialogDescription>
              Geben Sie die Lexware-Slug des Mandanten ein (aus seiner Eingangs-E-Mail)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="client-slug">Slug</Label>
              <Input
                id="client-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="firmenname"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
              />
            </div>
            {addError && (
              <Alert variant="destructive">
                <AlertDescription>{addError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Abbrechen</Button>
            <Button onClick={() => void handleAdd()} disabled={adding || !slug.trim()}>
              {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mandant entfernen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie <strong>{deleteTarget?.companyName}</strong> aus Ihrer Mandantenliste entfernen?
              Die Daten des Mandanten werden nicht gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
