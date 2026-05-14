import type { SumUpSettlementData } from './sumup-parser.js';
import type { DocumentJob } from '../queue.js';

export function sumupToDocumentJobs(
  data: SumUpSettlementData,
  tenantId: string,
  fileBuffer: Buffer,
): DocumentJob[] {
  const fileArray = Array.from(fileBuffer) as unknown as Buffer;
  const jobs: DocumentJob[] = [];

  // Job 1 — Revenue (salesinvoice)
  jobs.push({
    tenantId,
    fileBuffer: fileArray,
    mimeType: 'application/pdf',
    source: 'integration',
    receivedAt: new Date().toISOString(),
    metadata: {
      integrationType: 'sumup',
      jobSubtype: 'revenue',
    },
  } as DocumentJob);

  // Job 2 — Processing fees (purchaseinvoice, EU §13b)
  jobs.push({
    tenantId,
    fileBuffer: fileArray,
    mimeType: 'application/pdf',
    source: 'integration',
    receivedAt: new Date().toISOString(),
    metadata: {
      integrationType: 'sumup',
      jobSubtype: 'fees',
      isExternalService13b: true,
      vendorVatId: data.vendorVatId,
    },
  } as DocumentJob);

  return jobs;
}
