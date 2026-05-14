import type { ClassificationResult } from '../types.js';
import type { ExtractedDocument } from '../processor/pdf-extractor.js';

export interface MathVerificationResult {
  passed: boolean;
  calculatedGross: number;
  statedGross: number;
  difference: number;
  lineItemCheck: boolean;
  taxCalculationCheck: boolean;
}

const GROSS_TOLERANCE = 0.05;
const TAX_TOLERANCE = 0.02;

export function verifyMath(
  result: ClassificationResult,
  extracted: ExtractedDocument,
): MathVerificationResult {
  const statedGross = extracted.totalGrossAmount ?? 0;

  // Gather all line items across vouchers
  const lineItems = gatherLineItems(result);

  if (lineItems.length === 0) {
    return { passed: true, calculatedGross: statedGross, statedGross, difference: 0, lineItemCheck: true, taxCalculationCheck: true };
  }

  const calculatedGross = round2(lineItems.reduce((s, li) => s + li.grossAmount, 0));
  const difference = round2(Math.abs(calculatedGross - statedGross));

  // Check 1: gross sum within tolerance
  const grossCheck = statedGross === 0 || difference <= GROSS_TOLERANCE;

  // Check 2: grossAmount - taxAmount = net ≥ 0 for each item
  const lineItemCheck = lineItems.every((li) => {
    const net = round2(li.grossAmount - li.taxAmount);
    return net >= -TAX_TOLERANCE;
  });

  // Check 3: tax calculation — net × rate/100 ≈ taxAmount
  const taxCalculationCheck = lineItems.every((li) => {
    if (li.taxRatePercent === 0) return Math.abs(li.taxAmount) <= TAX_TOLERANCE;
    const net = round2(li.grossAmount - li.taxAmount);
    const expectedTax = round2(net * (li.taxRatePercent / 100));
    return Math.abs(expectedTax - li.taxAmount) <= TAX_TOLERANCE;
  });

  const passed = grossCheck && lineItemCheck && taxCalculationCheck;

  return { passed, calculatedGross, statedGross, difference, lineItemCheck, taxCalculationCheck };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface RawLineItem {
  grossAmount: number;
  taxAmount: number;
  taxRatePercent: number;
}

function gatherLineItems(result: ClassificationResult): RawLineItem[] {
  if (result.kind === 'purchase_invoice') {
    return result.data.lineItems;
  }
  if (result.kind === 'settlement') {
    return result.data.vouchers.flatMap((v) => v.lineItems);
  }
  return [];
}
