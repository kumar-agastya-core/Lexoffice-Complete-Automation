/**
 * Pipeline demo — runs the full extraction + classification + complexity
 * scoring on a hardcoded Lieferando-style invoice text.
 *
 * Run: node --experimental-strip-types test-pipeline.ts
 */
import { processText } from './src/processor/pdf-extractor.js';
import { classifyDocument } from './src/processor/document-classifier.js';
import { scoreComplexity } from './src/processor/complexity-scorer.js';
import type { FingerprintMatch } from './src/processor/fingerprint-matcher.js';

// Typical Lieferando Auszahlungsbericht text
const LIEFERANDO_TEXT = `
Lieferando.de
Auszahlungsbericht

Vendor GmbH
Musterstraße 1
10115 Berlin
USt-IdNr. DE123456789

Rechnungsnummer: LFD-2026-00042
Rechnungsdatum: 05.04.2026
Fällig am: 05.04.2026

Zeitraum: 01.04.2026 – 30.04.2026

Bestellungen:    120
Umsatz brutto:   3.240,00 EUR
Servicegebühr:   388,80 EUR
Auszahlung:      2.851,20 EUR

19% MwSt auf Servicegebühr: 326,72  62,08
Gesamtbetrag: 3.240,00

IBAN: DE89370400440532013000
`;

const doc = processText(LIEFERANDO_TEXT, 1);
console.log('\n=== ExtractedDocument ===');
console.log(JSON.stringify(doc, null, 2));

const { documentType, taxTypeHint } = classifyDocument(doc);
console.log('\n=== Classification ===');
console.log({ documentType, taxTypeHint });

// No fingerprint match — unknown vendor (first time seen)
const fingerprint: FingerprintMatch = {
  matched: false,
  fingerprintId: null,
  vendorName: null,
  documentTypeRule: null,
  classificationExamples: [],
};

const complexity = scoreComplexity({ doc, fingerprint, documentType, taxTypeHint });
console.log('\n=== ComplexityResult ===');
console.log(JSON.stringify(complexity, null, 2));

// Assertions
const assert = (condition: boolean, message: string) => {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
};

console.log('\n=== Assertions ===');
assert(documentType === 'delivery_platform', 'documentType = delivery_platform');
assert(taxTypeHint === 'gross', 'taxTypeHint = gross (DE VAT ID present)');
assert(
  complexity.triggers.some((t) => t.id === 'unknown_vendor'),
  'trigger: unknown_vendor fires (new vendor)',
);
assert(
  !complexity.triggers.some((t) => t.id === 'foreign_eu_vendor'),
  'trigger: foreign_eu_vendor NOT fired (DE vendor)',
);
assert(
  !complexity.triggers.some((t) => t.id === 'amount_reconciliation_failure'),
  'trigger: amount_reconciliation_failure NOT fired',
);
assert(complexity.score >= 1, 'requiresClarification = true (unknown_vendor warning)');
assert(doc.vatId === 'DE123456789', 'VAT ID extracted correctly');
assert(doc.iban === 'DE89370400440532013000', 'IBAN extracted correctly');
assert(doc.invoiceNumber === 'LFD-2026-00042', 'Invoice number extracted');
assert(doc.totalGrossAmount !== null && doc.totalGrossAmount > 0, 'Gross amount extracted');
