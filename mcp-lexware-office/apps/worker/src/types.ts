// ── Shared worker types ───────────────────────────────────────────────────────

export interface TenantProfile {
  id: string;
  lexwareOrg: string;
  lexofficeApiKey: string;
  companyName: string;
  industryOperationalLens: string;
  taxFramework: string;
  smallBusiness: boolean;
  approvalThreshold: number;
}

export interface PostingCategory {
  id: string;
  name: string;
  type: 'income' | 'outgo';
  groupName?: string;
  splitAllowed?: boolean;
  contactRequired?: boolean;
}

// ── Classification tool outputs ───────────────────────────────────────────────

export interface ClassifyLineItem {
  description?: string;
  grossAmount: number;
  taxAmount: number;
  taxRatePercent: number;
  categoryId: string;
  confidence: number;
}

export interface SettlementLineItem {
  label?: string;
  grossAmount: number;
  taxAmount: number;
  taxRatePercent: number;
  categoryId: string;
}

export interface SettlementVoucher {
  description: string;
  voucherType: 'salesinvoice' | 'purchaseinvoice';
  taxType: string;
  useCollectiveContact?: boolean;
  lineItems: SettlementLineItem[];
}

export interface PurchaseInvoiceToolOutput {
  voucherType: 'purchaseinvoice' | 'purchasecreditnote';
  taxType: string;
  lineItems: ClassifyLineItem[];
  overallConfidence: number;
  reasoning?: string;
  flags?: string[];
}

export interface SettlementToolOutput {
  vouchers: SettlementVoucher[];
  loanRepaymentDetected?: boolean;
  loanAmount?: number;
  overallConfidence: number;
  reasoning?: string;
}

export interface ClarificationToolOutput {
  reason: string;
  question: string;
  suggestedCategoryId?: string;
}

// ── Unified classification result ─────────────────────────────────────────────

export type ClassificationResult =
  | { kind: 'purchase_invoice'; data: PurchaseInvoiceToolOutput; confidence: number; passUsed: 1 | 2 }
  | { kind: 'settlement'; data: SettlementToolOutput; confidence: number; passUsed: 1 | 2 }
  | { kind: 'clarification_needed'; data: ClarificationToolOutput; confidence: 0; passUsed: 1 | 2 };

// ── Voucher API payload ───────────────────────────────────────────────────────

export interface VoucherItem {
  amount: number;
  taxAmount: number;
  taxRatePercent: number;
  categoryId: string;
}

export interface VoucherPayload {
  type: string;
  voucherStatus: 'open' | 'unchecked';
  voucherDate?: string | null;
  dueDate?: string | null;
  voucherNumber?: string | null;
  totalGrossAmount?: number | null;
  totalTaxAmount?: number | null;
  taxType: string;
  contactId?: string;
  useCollectiveContact?: boolean;
  voucherItems: VoucherItem[];
  remark?: string;
}

export interface VoucherBuildResult {
  payloads: VoucherPayload[];
  loanFlagNote?: string;
}
