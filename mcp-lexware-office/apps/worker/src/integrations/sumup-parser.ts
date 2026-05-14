import { parseAmount } from '../processor/pdf-extractor.js';

export interface SumUpSettlementData {
  period: { from: string; to: string };
  grossTransactions: number;
  processingFees: number;
  loanRepayment: number;
  netPaidOut: number;
  pendingPayout: number;
  vendorVatId: string;
  hasLoanRepayment: boolean;
}

/** Parse a SumUp monthly settlement report from extracted PDF text. Pure function. */
export function parseSumUpReport(text: string): SumUpSettlementData {
  function extractAmount(pattern: RegExp): number {
    const m = text.match(pattern);
    return m ? parseAmount(m[1]) : 0;
  }

  const gross = extractAmount(/Bruttozahlungen[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const fees = extractAmount(/Bearbeitungsgebühren[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const loan = extractAmount(/Darlehensabzüge[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const net = extractAmount(/Auszahlungsbetrag[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);
  const pending = extractAmount(/Auszuzahlen[^\d]{0,30}(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[,.]\d{2})/i);

  // Period: DD-MM-YYYY – DD-MM-YYYY or DD.MM.YYYY – DD.MM.YYYY
  const periodMatch = text.match(/(\d{2}[-./]\d{2}[-./]\d{4})[^\d]+(\d{2}[-./]\d{2}[-./]\d{4})/);
  let from = '';
  let to = '';
  if (periodMatch) {
    from = normaliseDateString(periodMatch[1]);
    to = normaliseDateString(periodMatch[2]);
  }

  // Vendor VAT ID — SumUp is IE9813461A (Irish entity)
  const vatMatch = text.match(/\b(IE[A-Z0-9]{7,10})\b/);
  const vendorVatId = vatMatch ? vatMatch[1] : 'IE9813461A';

  return {
    period: { from, to },
    grossTransactions: gross,
    processingFees: fees,
    loanRepayment: loan,
    netPaidOut: net,
    pendingPayout: pending,
    vendorVatId,
    hasLoanRepayment: loan > 0,
  };
}

function normaliseDateString(raw: string): string {
  // Convert DD-MM-YYYY or DD/MM/YYYY to YYYY-MM-DD
  const parts = raw.split(/[-./]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return raw;
}
