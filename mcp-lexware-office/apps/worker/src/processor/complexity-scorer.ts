import type { ExtractedDocument } from './pdf-extractor.js';
import type { FingerprintMatch } from './fingerprint-matcher.js';
import type { DocumentType, TaxTypeHint } from './document-classifier.js';

export interface ComplexityTrigger {
  id: string;
  severity: 'blocking' | 'warning';
  question: string;
  referenceDocs?: string[];
}

export interface ComplexityResult {
  score: number;
  triggers: ComplexityTrigger[];
  requiresClarification: boolean;
}

interface ScoreInput {
  doc: ExtractedDocument;
  fingerprint: FingerprintMatch;
  documentType: DocumentType;
  taxTypeHint: TaxTypeHint;
}

export function scoreComplexity({
  doc,
  fingerprint,
  documentType,
  taxTypeHint,
}: ScoreInput): ComplexityResult {
  const triggers: ComplexityTrigger[] = [];

  // TRIGGER_1: unknown_vendor
  if (!fingerprint.matched) {
    triggers.push({
      id: 'unknown_vendor',
      severity: 'warning',
      question:
        "I haven't seen this vendor before. " +
        'Can you confirm: what type of expense is this? ' +
        '(e.g. marketing, office supplies, professional services)',
    });
  }

  // TRIGGER_2: foreign_eu_vendor
  if (taxTypeHint === 'externalService13b') {
    triggers.push({
      id: 'foreign_eu_vendor',
      severity: 'blocking',
      question:
        'This invoice is from an EU company outside Germany ' +
        'with no VAT shown. German §13b UStG requires you to ' +
        'self-assess 19% VAT. Can you confirm this vendor ' +
        'provides services (not physical goods) to your business?',
    });
  }

  // TRIGGER_3: loan_deductions_detected
  if (documentType === 'loan_aware_settlement') {
    triggers.push({
      id: 'loan_deductions_detected',
      severity: 'blocking',
      question:
        'I can see loan repayment deductions in this document. ' +
        'To book this correctly I need the original loan agreement. ' +
        'Please upload it, or tell me: what was the original loan ' +
        'amount and when was it taken out?',
      referenceDocs: ['Original loan agreement or confirmation email'],
    });
  }

  // TRIGGER_4: cross_period_data — multiple calendar months in dates
  if (hasCrossPeriodDates(doc.rawText)) {
    triggers.push({
      id: 'cross_period_data',
      severity: 'warning',
      question:
        'This document contains transactions from multiple months. ' +
        'Should I book this using: ' +
        'A) The document date shown on the invoice, or ' +
        'B) Split by the actual transaction dates?',
    });
  }

  // TRIGGER_5: mixed_payment_methods
  if (documentType === 'pos_monthly_summary') {
    const lower = doc.rawText.toLowerCase();
    if (lower.includes('ec-karte') && lower.includes('bar')) {
      triggers.push({
        id: 'mixed_payment_methods',
        severity: 'warning',
        question:
          'This report shows both card (EC-Karte) and cash (Bar) ' +
          'revenue. I will create separate vouchers for each. ' +
          'Please confirm this is correct for your accounting setup.',
      });
    }
  }

  // TRIGGER_6: amount_reconciliation_failure
  if (doc.taxRateRows.length > 0 && doc.totalGrossAmount !== null) {
    const calculated = parseFloat(
      doc.taxRateRows.reduce((s, r) => s + r.gross, 0).toFixed(2),
    );
    const diff = Math.abs(calculated - doc.totalGrossAmount);
    if (diff > 0.05) {
      triggers.push({
        id: 'amount_reconciliation_failure',
        severity: 'blocking',
        question:
          `The line item totals (€${calculated.toFixed(2)}) do not match the ` +
          `document total (€${doc.totalGrossAmount.toFixed(2)}). ` +
          `The difference is €${diff.toFixed(2)}. ` +
          'Please check the original document before I proceed.',
      });
    }
  }

  // TRIGGER_7: high_value_document
  if (doc.totalGrossAmount !== null && doc.totalGrossAmount > 5000) {
    triggers.push({
      id: 'high_value_document',
      severity: 'warning',
      question:
        'This document is above €5,000. I will create it as an ' +
        'unchecked draft for your review before finalising.',
    });
  }

  const score = triggers.length;
  return {
    score,
    triggers,
    requiresClarification: score >= 1,
  };
}

/** Check if raw text contains dates from more than one calendar month. */
function hasCrossPeriodDates(rawText: string): boolean {
  const dateRegex = /(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/g;
  const months = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = dateRegex.exec(rawText)) !== null) {
    const month = m[2].padStart(2, '0');
    const rawYear = m[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    months.add(`${year}-${month}`);
  }
  return months.size > 1;
}
