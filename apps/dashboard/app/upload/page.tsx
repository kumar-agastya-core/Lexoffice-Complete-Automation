'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Upload, Mail, Copy, UploadCloud } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface RecentUpload {
  id: string;
  fileName: string;
  fileSize: number;
  timestamp: string;
  status: 'processing' | 'queued';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function IntegrationUploadCard({
  title,
  description,
  uploadUrl,
  accept,
}: {
  title: string;
  description: string;
  uploadUrl: string;
  accept: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(uploadUrl, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDone(true);
      toast.success(`${title} erfolgreich hochgeladen`);
    } catch (err) {
      toast.error(`Fehler beim Upload: ${(err as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <Badge variant="outline">Hochgeladen</Badge>
            <button className="text-xs underline" onClick={() => setDone(false)}>Weiteres hochladen</button>
          </div>
        ) : (
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 py-6 hover:border-primary/40 hover:bg-muted/30 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void handleFile(f);
            }}
          >
            <p className="text-sm text-muted-foreground">
              {uploading ? 'Wird verarbeitet…' : 'Datei hierher ziehen oder klicken'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">{accept}</p>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function UploadPage() {
  const [progress, setProgress] = useState<number | null>(null);
  const [recentUploads, setRecentUploads] = useState<RecentUpload[]>([]);
  const [inboundEmail, setInboundEmail] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchEmail() {
      try {
        const res = await fetch('/api/settings/email');
        if (res.ok) {
          const data = await res.json() as { email: string | null };
          setInboundEmail(data.email);
        }
      } catch { /* ignore */ } finally {
        setEmailLoading(false);
      }
    }
    void fetchEmail();
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Nur PDF-Dateien werden unterstützt');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Datei zu groß (max. 20 MB)');
      return;
    }

    // Animate progress 0→90 over 1.5s
    setProgress(0);
    const startTime = Date.now();
    const animInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(90, (elapsed / 1500) * 90);
      setProgress(pct);
    }, 50);

    const uploadEntry: RecentUpload = {
      id: `${Date.now()}`,
      fileName: file.name,
      fileSize: file.size,
      timestamp: new Date().toISOString(),
      status: 'processing',
    };
    setRecentUploads((prev) => [uploadEntry, ...prev]);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });

      clearInterval(animInterval);

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      setProgress(100);
      setRecentUploads((prev) =>
        prev.map((u) => (u.id === uploadEntry.id ? { ...u, status: 'queued' } : u)),
      );

      setTimeout(() => setProgress(null), 1500);
    } catch (err) {
      clearInterval(animInterval);
      setProgress(null);
      setRecentUploads((prev) => prev.filter((u) => u.id !== uploadEntry.id));
      toast.error('Fehler beim Upload', {
        description: (err as Error).message,
      });
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    void (async () => {
      for (const file of files) {
        await processFile(file);
      }
    })();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Belege hochladen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF-Rechnungen hochladen oder per E-Mail weiterleiten
        </p>
      </div>

      {/* SECTION A — Universal drop zone */}
      <Card
        className="cursor-pointer border-2 border-dashed border-muted-foreground/30 transition-colors hover:border-primary/40 hover:bg-muted/20"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Beleg hochladen</h2>
          <p className="mt-1 text-sm text-muted-foreground">PDF hierher ziehen oder klicken</p>

          {progress !== null && (
            <div className="mt-6 w-full max-w-xs">
              <Progress value={progress} className="h-2" />
              {progress === 100 && (
                <div className="mt-3 flex justify-center">
                  <Badge className="bg-green-500 text-white hover:bg-green-600">
                    In Warteschlange
                  </Badge>
                </div>
              )}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              void (async () => {
                for (const file of files) {
                  await processFile(file);
                }
              })();
              e.target.value = '';
            }}
          />
        </CardContent>
      </Card>

      {/* SECTION B — Email alternative */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Per E-Mail weiterleiten</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {emailLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="flex gap-2">
              <Input
                readOnly
                value={inboundEmail ?? 'E-Mail-Adresse nicht konfiguriert'}
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (inboundEmail) {
                    void navigator.clipboard.writeText(inboundEmail);
                    toast.success('E-Mail-Adresse kopiert');
                  }
                }}
                disabled={!inboundEmail}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Leiten Sie jede Eingangsrechnung als PDF-Anhang an diese Adresse weiter
          </p>
        </CardContent>
      </Card>

      {/* SECTION C — Recent uploads */}
      {recentUploads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zuletzt hochgeladen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{upload.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(upload.fileSize)} · {formatTime(upload.timestamp)}
                  </p>
                </div>
                {upload.status === 'processing' ? (
                  <Skeleton className="h-5 w-24" />
                ) : (
                  <Badge variant="secondary">Wird verarbeitet...</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SECTION D — Integrations accordion */}
      <Accordion type="single" collapsible>
        <AccordionItem value="integrations">
          <AccordionTrigger className="text-sm font-medium">
            Spezielle Integrationen (SumUp, Hello Cash)
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 pt-2 sm:grid-cols-2">
              <IntegrationUploadCard
                title="SumUp Monatsbericht"
                description="Laden Sie Ihren monatlichen PDF-Bericht von SumUp hoch. Umsätze und Gebühren werden als separate Belege gebucht."
                uploadUrl="/api/integrations/sumup/upload"
                accept=".pdf,application/pdf"
              />
              <IntegrationUploadCard
                title="Hello Cash Monatsbericht"
                description="Laden Sie Ihre Umsatzübersicht (PDF oder CSV) von Hello Cash hoch. Karten- und Barumsätze werden getrennt gebucht."
                uploadUrl="/api/integrations/hellocash/upload"
                accept=".pdf,.csv,application/pdf,text/csv"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
