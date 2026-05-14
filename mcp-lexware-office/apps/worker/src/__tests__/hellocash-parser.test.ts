import { describe, it, expect } from 'vitest';
import { parseHelloCashReport } from '../integrations/hellocash-parser.js';
import { helloCashToDocumentJobs } from '../integrations/hellocash-to-jobs.js';

const SAMPLE_HELLOCASH_TEXT = `
Hello Cash GmbH
Umsatzübersicht April 2026
01.04.2026 – 30.04.2026

Umsätze nach Umsatzsteuer-Sätzen:
19%   2.100,00   399,00
7%    1.400,00    98,00

Umsätze nach Zahlungsart:
EC-Karte   2.851,20
Bar          746,80

Gesamtumsatz: 3.598,00

Ein/Auszahlungen pro Tag – Kassenbuch:
01.04.2026   +200,00   -50,00   150,00
02.04.2026   +300,00     0,00   450,00
03.04.2026   +150,00   -20,00   580,00
`;

describe('parseHelloCashReport', () => {
  it('parses VAT breakdown (7% and 19% totals)', () => {
    const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
    const row19 = data.vatBreakdown.find((r) => r.rate === 19);
    const row7 = data.vatBreakdown.find((r) => r.rate === 7);
    expect(row19).toBeDefined();
    expect(row7).toBeDefined();
    expect(row19!.vat).toBeCloseTo(399);
    expect(row7!.vat).toBeCloseTo(98);
  });

  it('separates card vs cash correctly', () => {
    const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
    expect(data.byPaymentMethod.card).toBeCloseTo(2851.2);
    expect(data.byPaymentMethod.cash).toBeCloseTo(746.8);
  });

  it('parses Kassenbuch entries count', () => {
    const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
    expect(data.kassenbuchEntries.length).toBeGreaterThan(0);
  });

  it('period dates parsed correctly', () => {
    const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
    expect(data.period.from).toBe('2026-04-01');
    expect(data.period.to).toBe('2026-04-30');
  });

  it('totalGross computed from VAT breakdown', () => {
    const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
    expect(data.totalGross).toBeGreaterThan(0);
  });
});

describe('helloCashToDocumentJobs', () => {
  const data = parseHelloCashReport(SAMPLE_HELLOCASH_TEXT);
  const buffer = Buffer.from('fake-pdf');

  it('creates two DocumentJob entries (cash + card)', () => {
    const jobs = helloCashToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs).toHaveLength(2);
  });

  it('one job has paymentMethod=cash', () => {
    const jobs = helloCashToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs.some((j) => j.metadata?.paymentMethod === 'cash')).toBe(true);
  });

  it('one job has paymentMethod=card', () => {
    const jobs = helloCashToDocumentJobs(data, 'tenant-1', buffer);
    expect(jobs.some((j) => j.metadata?.paymentMethod === 'card')).toBe(true);
  });

  it('includes kassenbuchEntries count in metadata', () => {
    const jobs = helloCashToDocumentJobs(data, 'tenant-1', buffer);
    for (const j of jobs) {
      expect(j.metadata?.kassenbuchEntries).toBeGreaterThanOrEqual(0);
    }
  });

  it('all jobs have source=integration and integrationType=hellocash', () => {
    const jobs = helloCashToDocumentJobs(data, 'tenant-1', buffer);
    for (const j of jobs) {
      expect(j.source).toBe('integration');
      expect(j.metadata?.integrationType).toBe('hellocash');
    }
  });
});
