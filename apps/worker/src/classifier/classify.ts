import type { ExtractedDocument } from '../processor/pdf-extractor.js';
import type { FingerprintMatch } from '../processor/fingerprint-matcher.js';
import type { DocumentType, TaxTypeHint } from '../processor/document-classifier.js';
import type { TenantProfile, PostingCategory, ClassificationResult } from '../types.js';
import { AnthropicClassifier, CONFIDENCE_THRESHOLD } from './anthropic-client.js';
import type { ClassifyToolName } from './anthropic-client.js';

export interface ClarificationContext {
  answeredQuestions: Array<{
    triggerId: string;
    question: string;
    answer: string;
  }>;
  referenceDocText?: string;
}

const SETTLEMENT_TYPES: DocumentType[] = [
  'settlement', 'pos_monthly_summary', 'loan_aware_settlement', 'delivery_platform',
];

function resolveToolName(documentType: DocumentType): ClassifyToolName {
  return SETTLEMENT_TYPES.includes(documentType)
    ? 'classify_settlement'
    : 'classify_purchase_invoice';
}

function buildClarificationBlock(ctx: ClarificationContext): string {
  const lines = [
    '[CLARIFICATION PROVIDED — previously unclear points now resolved]',
    ...ctx.answeredQuestions.map(
      (q) => `• ${q.triggerId}: ${q.question}\n  Answer: ${q.answer}`,
    ),
  ];
  if (ctx.referenceDocText) {
    lines.push('', '[REFERENCE DOCUMENT CONTEXT]', ctx.referenceDocText.slice(0, 1000));
  }
  lines.push('', '[END CLARIFICATION — classify the following document using this context]', '');
  return lines.join('\n');
}

function buildUserMessage(
  extracted: ExtractedDocument,
  fingerprint: FingerprintMatch,
  documentType: DocumentType,
  taxTypeHint: TaxTypeHint,
  clarification?: ClarificationContext,
): string {
  const lines: string[] = [];

  if (clarification && clarification.answeredQuestions.length > 0) {
    lines.push(buildClarificationBlock(clarification));
  }

  lines.push(
    `DOCUMENT TYPE: ${documentType}`,
    `TAX TYPE HINT: ${taxTypeHint}`,
    '',
    '=== EXTRACTED DATA ===',
    `Vendor VAT ID: ${extracted.vatId ?? 'not found'}`,
    `Vendor IBAN: ${extracted.iban ?? 'not found'}`,
    `Invoice Number: ${extracted.invoiceNumber ?? 'not found'}`,
    `Invoice Date: ${extracted.invoiceDate ?? 'not found'}`,
    `Due Date: ${extracted.dueDate ?? 'not found'}`,
    `Total Gross Amount: €${extracted.totalGrossAmount ?? 'not found'}`,
    `Total Tax Amount: €${extracted.totalTaxAmount ?? 'not found'}`,
    '',
    '=== TAX RATE ROWS ===',
  );

  if (extracted.taxRateRows.length > 0) {
    for (const row of extracted.taxRateRows) {
      lines.push(`  ${row.rate}% → net €${row.net}, tax €${row.tax}, gross €${row.gross}`);
    }
  } else {
    lines.push('  (none extracted)');
  }

  lines.push('', '=== DOCUMENT TEXT (cleaned) ===');
  lines.push(extracted.cleanText.slice(0, 1500));

  if (fingerprint.classificationExamples.length > 0) {
    lines.push('', '=== PRIOR CLASSIFICATION EXAMPLES (same vendor) ===');
    for (const ex of fingerprint.classificationExamples) {
      lines.push(`  "${ex.rawDescription}" → category ${ex.targetCategoryUuid} @ ${ex.vatRate}% VAT`);
    }
  }

  lines.push(
    '',
    'Classify this document. Use the posting categories provided in the system prompt.',
    'Return structured output using the appropriate tool.',
  );

  return lines.join('\n');
}

export async function classifyDocument(
  extracted: ExtractedDocument,
  fingerprint: FingerprintMatch,
  documentType: DocumentType,
  taxTypeHint: TaxTypeHint,
  tenant: TenantProfile,
  postingCategories: PostingCategory[],
  pdfBuffer: Buffer,
  anthropicClient: AnthropicClassifier,
  clarificationContext?: ClarificationContext,
): Promise<ClassificationResult> {
  const toolName = resolveToolName(documentType);
  const userMessage = buildUserMessage(extracted, fingerprint, documentType, taxTypeHint, clarificationContext);

  // With clarification context, confidence threshold is lower — user answers are authoritative
  const threshold = clarificationContext ? 0.5 : CONFIDENCE_THRESHOLD;

  // Pass 1 — text only
  const pass1 = await anthropicClient.classifyStandard({
    toolName,
    tenant,
    categories: postingCategories,
    userMessage,
  });

  console.log(
    `[classifier] Pass 1 — kind=${pass1.kind} confidence=${pass1.confidence.toFixed(2)}${clarificationContext ? ' (with clarification)' : ''}`,
  );

  if (pass1.confidence >= threshold || pass1.kind === 'clarification_needed') {
    return pass1;
  }

  // Pass 2 — vision
  console.log(`[classifier] Confidence ${pass1.confidence.toFixed(2)} < ${threshold} — running vision pass`);

  const pass2 = await anthropicClient.classifyWithVision({
    toolName,
    tenant,
    categories: postingCategories,
    userMessage,
    pdfBuffer,
  });

  console.log(
    `[classifier] Pass 2 — kind=${pass2.kind} confidence=${pass2.confidence.toFixed(2)} ` +
    `(delta: +${(pass2.confidence - pass1.confidence).toFixed(2)})`,
  );

  return pass2;
}
