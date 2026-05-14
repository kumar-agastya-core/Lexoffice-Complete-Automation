import type { HelloCashSummaryData } from './hellocash-parser.js';
import type { DocumentJob } from '../queue.js';

export function helloCashToDocumentJobs(
  data: HelloCashSummaryData,
  tenantId: string,
  fileBuffer: Buffer,
): DocumentJob[] {
  const fileArray = Array.from(fileBuffer) as unknown as Buffer;
  const jobs: DocumentJob[] = [];

  // Job 1 — Cash revenue (Bar)
  if (data.byPaymentMethod.cash > 0) {
    jobs.push({
      tenantId,
      fileBuffer: fileArray,
      mimeType: 'application/pdf',
      source: 'integration',
      receivedAt: new Date().toISOString(),
      metadata: {
        integrationType: 'hellocash',
        paymentMethod: 'cash',
        jobSubtype: 'revenue',
        kassenbuchEntries: data.kassenbuchEntries.length,
      },
    } as DocumentJob);
  }

  // Job 2 — Card revenue (EC-Karte)
  if (data.byPaymentMethod.card > 0) {
    jobs.push({
      tenantId,
      fileBuffer: fileArray,
      mimeType: 'application/pdf',
      source: 'integration',
      receivedAt: new Date().toISOString(),
      metadata: {
        integrationType: 'hellocash',
        paymentMethod: 'card',
        jobSubtype: 'revenue',
        kassenbuchEntries: data.kassenbuchEntries.length,
      },
    } as DocumentJob);
  }

  // Fallback: if both zero (edge case), emit one job
  if (jobs.length === 0) {
    jobs.push({
      tenantId,
      fileBuffer: fileArray,
      mimeType: 'application/pdf',
      source: 'integration',
      receivedAt: new Date().toISOString(),
      metadata: {
        integrationType: 'hellocash',
        paymentMethod: 'card',
        jobSubtype: 'revenue',
        kassenbuchEntries: data.kassenbuchEntries.length,
      },
    } as DocumentJob);
  }

  return jobs;
}
