import type { ReactElement } from 'react'
import { notFound } from 'next/navigation'
import { getException } from '@/app/lib/db'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { ExceptionDetailClient } from './ExceptionDetailClient'

type ExceptionStatus = 'pending' | 'awaiting_approval' | 'resolved' | 'dismissed'

const STATUS_LABELS: Record<ExceptionStatus, string> = {
  pending: 'Klärung nötig',
  awaiting_approval: 'Genehmigung',
  resolved: 'Erledigt',
  dismissed: 'Abgewiesen',
}

const STATUS_VARIANTS: Record<ExceptionStatus, 'destructive' | 'secondary' | 'outline'> = {
  pending: 'destructive',
  awaiting_approval: 'secondary',
  resolved: 'outline',
  dismissed: 'outline',
}

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<ReactElement> {
  const { id } = await params
  const exception = await getException(id).catch(() => null)
  if (!exception) notFound()

  const payload = exception.payload as unknown as Record<string, unknown>
  const plan = payload.executionPlan as Record<string, unknown>
  const pdfBase64 = payload.originalFileBase64 as string | undefined
  const status = exception.status as ExceptionStatus
  const triggerReasons = payload.triggerReasons as string[] | undefined

  return (
    <div className="space-y-4">
      <div>
        <a href="/exceptions" className="text-sm text-muted-foreground hover:underline">
          Zurueck zur Uebersicht
        </a>
      </div>
      <div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <ExceptionDetailClient.PDFViewer pdfBase64={pdfBase64} />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">
                      {(plan?.extractedVendorName as string | undefined) ??
                        triggerReasons?.[0] ??
                        'Unbekanntes Dokument'}
                    </CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {plan?.extractedAmount != null && (
                        <span className="text-base font-semibold text-foreground">
                          {(plan.extractedAmount as number).toFixed(2)}
                        </span>
                      )}
                      {plan?.extractedDate != null && (
                        <span>{String(plan.extractedDate)}</span>
                      )}
                      {payload.source != null && (
                        <Badge variant={payload.source === 'email' ? 'secondary' : 'outline'}>
                          {payload.source === 'email' ? 'E-Mail' : 'Upload'}
                        </Badge>
                      )}
                      <Badge variant={STATUS_VARIANTS[status]}>
                        {STATUS_LABELS[status]}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {payload.lexwareDeeplink != null && (
                <CardContent className="pt-0">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={String(payload.lexwareDeeplink)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-2 h-3.5 w-3.5" />
                      In Lexware oeffnen
                    </a>
                  </Button>
                </CardContent>
              )}
            </Card>
            <ExceptionDetailClient.ChatAndApprove
              exceptionId={id}
              sessions={exception.sessions}
              status={status}
              plan={plan}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
