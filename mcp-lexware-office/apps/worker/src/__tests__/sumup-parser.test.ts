import { describe, it, expect } from 'vitest';
import { parseSumUpReport } from '../integrations/sumup-parser.js';
import { sumupToDocumentJobs } from '../integrations/sumup-to-jobs.js';

const SAMPLE_SUMUP_TEXT = `
SumUp Financial Services Limited
USt-IdNr. IE9813461A

Monatlicher Abrechnungsbericht
Zeitraum: 01-04-2026 – 30-04-2026

Bruttozahlungen                         3.240,00 EUR
Bearbeitungsgebühren                      388,80 EUR
Darlehensabzüge                           150,00 EUR
Auszahlungsbetrag                       2.701,20 EUR
Auszuzahlen                                 0,00 EUR
`;

const SAMPLE_NO_LOAN_TEXT = `
SumUp Financial Services Limited
IE9813461A

01-04-2026 – 30-04-2026

Bruttozahlungen 1.000,00
Bearbeitungsgebühren 120,00
Auszahlungsbetrag 880,00
`;

describe('parseSumUpReport', () => {
  it('parses gross, fees, loan from known text', () => {
    const data = parseSumUpReport(SAMPLE_SUMUP_TEXT);
    expect(data.grossTransactions).toBeCloseTo(3240);
    expect(data.processingFees).toBeCloseTo(388.8);
    expect(data.loanRepayment).toBeCloseTo(150);
    expect(data.netPaidOut).toBeCloseTo(2701.2);
  });

  it('detects hasLoanRepayment correctly when loan > 0', () => {
    const data = parseSumUpReport(SAMPLE_SUMUP_TEXT);
    expect(data.hasLoanRepayment).toBe(true);
  });

  it('hasLoanRepayment is false when no loan', () => {
    const data = parseSumUpReport(SAMPLE_NO_LOAN_TEXT);
    expect(data.hasLoanRepayment).toBe(false);
    expect(data.loanRepayment).toBe(0);
  });

  it('parses period dates correctly', () => {
    const data = parseSumUpReport(SAMPLE_SUMUP_TEXT);
    expect(data.period.from).toBe('2026-04-01');
    expect(data.period.to).toBe('2026-04-30');
  });

  it('extracts Irish VAT ID (IE prefix)', () => {
    const data = parseSumUpReport(SAMPLE_SUMUP_TEXT);
    expect(data.vendorVatId).toBe('IE9813461A');
  });
});

describe('sumupToDocumentJobs', () => {
  const data = parseSumUpReport(SAMPLE_SUMUP_TEXT);
  const buffer = Buffer.from('fake-pdf');

  it('creates two DocumentJob entries', () => {
    const jobs = sumupToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs).toHaveLength(2);
  });

  it('first job is revenue (no §13b flag)', () => {
    const jobs = sumupToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs[0].metadata?.jobSubtype).toBe('revenue');
    expect(jobs[0].metadata?.isExternalService13b).toBeUndefined();
  });

  it('second job is fees with §13b flag and vendor VAT ID', () => {
    const jobs = sumupToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs[1].metadata?.jobSubtype).toBe('fees');
    expect(jobs[1].metadata?.isExternalService13b).toBe(true);
    expect(jobs[1].metadata?.vendorVatId).toBe('IE9813461A');
  });

  it('all jobs have source=integration', () => {
    const jobs = sumupToDocumentJobs(data, 'tenant-1', buffer);
    for (const j of jobs) expect(j.source).toBe('integration');
  });
});
