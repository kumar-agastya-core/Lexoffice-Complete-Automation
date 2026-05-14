import { parseAmount } from '../processor/pdf-extractor.js';

export interface HelloCashSummaryData {
  period: { from: string; to: string };
  totalGross: number;
  vatBreakdown: Array<{ rate: number; net: number; vat: number; gross: number }>;
  byPaymentMethod: {
    card: number;
    cash: number;
  };
  kassenbuchEntries: Array<{
    date: string;
    deposits: number;
    withdrawals: number;
    balance: number;
  }>;
}

/** Parse a Hello Cash Umsatzübersicht from extracted PDF text. Pure function. */
export function parseHelloCashReport(text: string): HelloCashSummaryData {
  // ── Period ───────────────────────────────────────────────────────────────────
  const periodMatch = text.match(/(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})[^\d]+(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/);
  const from = periodMatch ? normaliseDate(periodMatch[1]) : '';
  const to = periodMatch ? normaliseDate(periodMatch[2]) : '';

  // ── VAT breakdown (Umsätze nach Umsatzsteuer-Sätzen) ─────────────────────────
  const vatBreakdown: HelloCashSummaryData['vatBreakdown'] = [];
  // Pattern: tax rate % ... net ... vat ... gross
  const vatRowRegex = /(\d+(?:\.\d+)?)\s*%[^\d]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let vm: RegExpExecArray | null;
  while ((vm = vatRowRegex.exec(text)) !== null) {
    const rate = parseFloat(vm[1]);
    const net = parseAmount(vm[2]);
    const vat = parseAmount(vm[3]);
    vatBreakdown.push({ rate, net, vat, gross: net + vat });
  }

  // ── By payment method ─────────────────────────────────────────────────────────
  const cardMatch = text.match(/EC-Karte[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const cashMatch = text.match(/Bar(?:\s+\(Bargeld\))?[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const card = cardMatch ? parseAmount(cardMatch[1]) : 0;
  const cash = cashMatch ? parseAmount(cashMatch[1]) : 0;

  const totalGross = vatBreakdown.reduce((s, r) => s + r.gross, 0) || card + cash;

  // ── Kassenbuch (Ein/Auszahlungen pro Tag) ─────────────────────────────────────
  const kassenbuchEntries: HelloCashSummaryData['kassenbuchEntries'] = [];
  // Pattern: date (+deposits) (-withdrawals) balance
  const kbRegex = /(\d{2}\.\d{2}\.\d{4})[^\d]{0,20}([+-]?\d{1,3}(?:\.\d{3})*,\d{2})[^\d]{0,20}([+-]?\d{1,3}(?:\.\d{3})*,\d{2})[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  let km: RegExpExecArray | null;
  while ((km = kbRegex.exec(text)) !== null) {
    kassenbuchEntries.push({
      date: normaliseDate(km[1]),
      deposits: parseAmount(km[2].replace('+', '')),
      withdrawals: parseAmount(km[3].replace('-', '')),
      balance: parseAmount(km[4]),
    });
    if (kassenbuchEntries.length >= 31) break; // max 31 days
  }

  return {
    period: { from, to },
    totalGross,
    vatBreakdown,
    byPaymentMethod: { card, cash },
    kassenbuchEntries,
  };
}

function normaliseDate(raw: string): string {
  const parts = raw.split(/[.\/-]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw;
}
