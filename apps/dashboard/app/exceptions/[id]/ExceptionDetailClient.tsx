'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { FileText, Send, Paperclip, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardContent, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { ClarificationSession } from '@/app/lib/db';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const PDFDocument = dynamic(
  () =>
    import('react-pdf').then((m) => {
      const { pdfjs } = m;
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      return { default: m.Document };
    }),
  { ssr: false },
);
const PDFPage = dynamic(
  () => import('react-pdf').then((m) => ({ default: m.Page })),
  { ssr: false },
);

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ── PDFViewer ──────────────────────────────────────────────────────────────────

function PDFViewer({ pdfBase64 }: { pdfBase64?: string }) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const pdfSrc = pdfBase64 ? `data:application/pdf;base64,${pdfBase64}` : null;

  return (
    <Card className="h-full">
      <CardContent className="p-4">
        {pdfSrc ? (
          <ScrollArea className="h-[600px]">
            <PDFDocument
              file={pdfSrc}
              onLoadSuccess={({ numPages: n }) => {
                setNumPages(n);
                setPageNumber(1);
              }}
              loading={<Skeleton className="h-80 w-full" />}
            >
              <PDFPage pageNumber={pageNumber} width={340} />
            </PDFDocument>
          </ScrollArea>
        ) : (
          <div className="flex h-80 flex-col items-center justify-center gap-3 text-muted-foreground">
            <FileText className="h-12 w-12" />
            <p className="text-sm">PDF nicht verfügbar</p>
          </div>
        )}
        {numPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
              disabled={pageNumber <= 1}
            >
              ←
            </Button>
            <span className="text-xs text-muted-foreground">
              {pageNumber} / {numPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
              disabled={pageNumber >= numPages}
            >
              →
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── ChatAndApprove ────────────────────────────────────────────────────────────

type ExceptionStatus = 'pending' | 'awaiting_approval' | 'resolved' | 'dismissed';

function ChatAndApprove({
  exceptionId,
  sessions,
  status,
  plan,
}: {
  exceptionId: string;
  sessions: ClarificationSession[];
  status: ExceptionStatus;
  plan: Record<string, unknown>;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  const hasOpenSession = sessions.some((s) => s.status === 'open');

  async function handleSendAnswer() {
    if (!answer.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/exceptions/${exceptionId}/answer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      });
      setAnswer('');
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      await fetch(`/api/exceptions/${exceptionId}/approve`, { method: 'POST' });
      setApproveOpen(false);
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

  return (
    <>
      {sessions.length > 0 && (
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Klärungsgespräch
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-[380px] px-4">
              <div className="space-y-4 pb-4 pt-2">
                {sessions.map((session) => (
                  <div key={session.id} className="space-y-3">
                    {/* AI message */}
                    <div className="flex items-start gap-3">
                      <Avatar className="h-7 w-7 shrink-0 bg-muted">
                        <AvatarFallback className="text-xs">AI</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                          {session.question}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.asked_at ? formatTime(session.asked_at) : ''}
                        </p>
                      </div>
                    </div>
                    {/* User reply */}
                    {session.answer && (
                      <div className="flex flex-row-reverse items-start gap-3">
                        <Avatar className="h-7 w-7 shrink-0 bg-primary">
                          <AvatarFallback className="text-xs text-primary-foreground">
                            Du
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-right">
                          <div className="inline-block rounded-lg bg-accent px-3 py-2 text-sm">
                            {session.answer}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {session.answered_at ? formatTime(session.answered_at) : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>

          {hasOpenSession && (
            <CardFooter className="flex-col gap-2 border-t pt-4">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Antwort eingeben… z.B. 'Das ist Büromaterial von REWE'"
                className="min-h-[80px] resize-none"
              />
              <div className="flex w-full justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('ref-upload-detail')?.click()}
                >
                  <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                  Dokument
                </Button>
                <input
                  id="ref-upload-detail"
                  type="file"
                  className="hidden"
                  accept=".pdf,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const fd = new FormData();
                    fd.append('file', file);
                    await fetch('/api/upload', { method: 'POST', body: fd });
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleSendAnswer}
                  disabled={sending || !answer.trim()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {sending ? 'Sende…' : 'Senden'}
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      )}

      {status === 'awaiting_approval' && (
        <Button onClick={() => setApproveOpen(true)} className="w-full">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Genehmigen & Buchen
        </Button>
      )}

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buchung bestätigen</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            {Object.entries(plan).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b py-1.5">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleApprove} disabled={approving}>
              {approving ? 'Wird gebucht…' : 'Jetzt buchen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const ExceptionDetailClient = { PDFViewer, ChatAndApprove };
